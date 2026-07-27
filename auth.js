/* ==========================================================================
   GitHubAuth + GistAPI — shared across github.html and gists.html
   ---------------------------------------------------------------------
   Auth model: the user pastes their own GitHub Personal Access Token
   (fine-grained or classic, needs the "gist" scope). The token is kept
   ONLY in sessionStorage (cleared when the tab closes) and is never sent
   anywhere but api.github.com. There is no backend and no client secret
   involved — this file makes direct, authenticated fetch() calls.
   ========================================================================== */
(function (global) {
  'use strict';

  const TOKEN_KEY = 'ghb_pat';
  const USER_KEY = 'ghb_user';
  const API_BASE = 'https://api.github.com';

  /* ------------------------------------------------------------------
     Small internal helpers
  ------------------------------------------------------------------ */
  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  }

  function setToken(token) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* sessionStorage unavailable (private mode etc.) — auth just won't persist across nothing anyway */
    }
  }

  function clearToken() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch {}
  }

  function cachedUser() {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function cacheUser(user) {
    try {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
  }

  function isAuthed() {
    return !!getToken();
  }

  function authHeaders(extra) {
    const headers = Object.assign({ Accept: 'application/vnd.github+json' }, extra || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  /* ------------------------------------------------------------------
     Central request wrapper — every GitHub call funnels through here so
     rate-limit / auth / network errors are handled the same way everywhere.
  ------------------------------------------------------------------ */
  class GitHubApiError extends Error {
    constructor(message, opts) {
      super(message);
      this.name = 'GitHubApiError';
      this.status = opts && opts.status;
      this.kind = (opts && opts.kind) || 'error'; // 'auth' | 'rate_limit' | 'not_found' | 'validation' | 'network' | 'error'
      this.resetAt = opts && opts.resetAt;
    }
  }

  async function request(path, options) {
    const opts = options || {};
    const url = path.startsWith('http') ? path : API_BASE + path;
    let res;
    try {
      res = await fetch(url, {
        method: opts.method || 'GET',
        headers: authHeaders(opts.body ? { 'Content-Type': 'application/json' } : {}),
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (networkErr) {
      throw new GitHubApiError('Could not reach GitHub. Check your connection and try again.', { kind: 'network' });
    }

    if (res.status === 401) {
      clearToken();
      throw new GitHubApiError('Your GitHub token is invalid or has expired. Please reconnect.', {
        status: 401,
        kind: 'auth',
      });
    }

    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
        const mins = Math.max(1, Math.ceil((reset - Date.now()) / 60000));
        throw new GitHubApiError(`GitHub API rate limit reached. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.`, {
          status: 403,
          kind: 'rate_limit',
          resetAt: reset,
        });
      }
      let body = null;
      try { body = await res.json(); } catch {}
      throw new GitHubApiError((body && body.message) || 'GitHub refused this request (403).', {
        status: 403,
        kind: 'auth',
      });
    }

    if (res.status === 404) {
      throw new GitHubApiError('Not found — it may have been deleted, or you don\u2019t have access to it.', {
        status: 404,
        kind: 'not_found',
      });
    }

    if (res.status === 422) {
      let body = null;
      try { body = await res.json(); } catch {}
      const detail = body && body.errors && body.errors.length ? body.errors.map((e) => e.message || e.code).join('; ') : null;
      throw new GitHubApiError(detail || (body && body.message) || 'GitHub rejected this data — check the fields and try again.', {
        status: 422,
        kind: 'validation',
      });
    }

    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch {}
      throw new GitHubApiError((body && body.message) || `GitHub API error (${res.status}).`, { status: res.status });
    }

    if (res.status === 204) return null;
    return res.json();
  }

  /* ------------------------------------------------------------------
     GistAPI — the official Gists REST API, minimum scope: "gist"
  ------------------------------------------------------------------ */
  const GistAPI = {
    async listMine(page) {
      return request(`/gists?per_page=100&page=${page || 1}`);
    },
    async get(id) {
      return request(`/gists/${encodeURIComponent(id)}`);
    },
    async create({ description, isPublic, files }) {
      return request('/gists', {
        method: 'POST',
        body: { description: description || '', public: !!isPublic, files },
      });
    },
    async update(id, { description, files }) {
      const body = {};
      if (description !== undefined) body.description = description;
      if (files) body.files = files;
      return request(`/gists/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    },
    async remove(id) {
      return request(`/gists/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    async me() {
      return request('/user');
    },
  };

  /* ------------------------------------------------------------------
     GitHubAuth — token lifecycle + a reusable "connect" modal + nav badge
  ------------------------------------------------------------------ */
  let onChangeListeners = [];

  const GitHubAuth = {
    isAuthed,
    getToken,
    authHeaders,
    getUser: cachedUser,

    onChange(fn) {
      onChangeListeners.push(fn);
    },

    _notify() {
      onChangeListeners.forEach((fn) => {
        try { fn(cachedUser()); } catch {}
      });
    },

    signOut() {
      clearToken();
      this._notify();
    },

    /** Verify a token works and cache the resulting user. Throws GitHubApiError on failure. */
    async connect(token) {
      setToken(token.trim());
      try {
        const user = await GistAPI.me();
        cacheUser({ login: user.login, avatar_url: user.avatar_url, name: user.name });
        this._notify();
        return user;
      } catch (err) {
        clearToken();
        throw err;
      }
    },

    /** Opens a modal prompting for a PAT. Resolves with the user object, rejects on cancel. */
    openConnectModal() {
      return new Promise((resolve, reject) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
          <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="connectModalTitle">
            <div class="modal-head">
              <h3 id="connectModalTitle">Connect your GitHub account</h3>
              <button type="button" class="modal-close" aria-label="Close">✕</button>
            </div>
            <div class="modal-body">
              <p class="modal-help">
                Paste a GitHub <strong>Personal Access Token</strong> with the
                <code>gist</code> scope. It's stored only in this browser tab's session —
                never sent anywhere but api.github.com, and never saved to disk.
              </p>
              <a class="modal-link" href="https://github.com/settings/tokens/new?scopes=gist&description=Github%20Browser" target="_blank" rel="noopener">
                Create a token on GitHub ↗
              </a>
              <div class="field" style="margin-top:16px;">
                <label for="patInput">Personal Access Token</label>
                <input id="patInput" type="password" autocomplete="off" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
              </div>
              <div class="modal-error" id="connectError" hidden></div>
            </div>
            <div class="modal-foot">
              <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
              <button type="button" class="btn btn-primary" id="connectSubmitBtn">
                <span class="btn-label">Connect</span>
                <span class="spinner" hidden aria-hidden="true"></span>
              </button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const patInput = overlay.querySelector('#patInput');
        const errorBox = overlay.querySelector('#connectError');
        const submitBtn = overlay.querySelector('#connectSubmitBtn');
        patInput.focus();

        function close() {
          document.body.style.overflow = '';
          overlay.remove();
        }

        function setBusy(busy) {
          submitBtn.disabled = busy;
          submitBtn.querySelector('.btn-label').textContent = busy ? 'Connecting…' : 'Connect';
          submitBtn.querySelector('.spinner').hidden = !busy;
        }

        async function submit() {
          const token = patInput.value.trim();
          if (!token) {
            errorBox.textContent = 'Paste a token first.';
            errorBox.hidden = false;
            return;
          }
          errorBox.hidden = true;
          setBusy(true);
          try {
            const user = await GitHubAuth.connect(token);
            setBusy(false);
            close();
            resolve(user);
          } catch (err) {
            setBusy(false);
            errorBox.textContent = err.message || 'Could not verify that token.';
            errorBox.hidden = false;
          }
        }

        submitBtn.addEventListener('click', submit);
        patInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') submit();
        });
        overlay.querySelector('.modal-close').addEventListener('click', () => { close(); reject(new Error('cancelled')); });
        overlay.querySelector('[data-cancel]').addEventListener('click', () => { close(); reject(new Error('cancelled')); });
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) { close(); reject(new Error('cancelled')); }
        });
      });
    },

    /** Ensures a token is present, prompting the connect modal if not. Returns true if authed (or newly connected), false if the user cancelled. */
    async ensureConnected() {
      if (isAuthed()) return true;
      try {
        await this.openConnectModal();
        return true;
      } catch {
        return false;
      }
    },

    /** Renders a small connect/connected badge into the given container and keeps it in sync. */
    renderBadge(container) {
      if (!container) return;
      function paint() {
        const user = cachedUser();
        container.innerHTML = '';
        if (isAuthed() && user) {
          const wrap = document.createElement('div');
          wrap.className = 'auth-badge connected';
          wrap.innerHTML = `
            <img src="${user.avatar_url}" alt="" class="auth-avatar">
            <span class="auth-name mono">${user.login}</span>
            <button type="button" class="icon-btn auth-signout">Disconnect</button>`;
          wrap.querySelector('.auth-signout').addEventListener('click', () => {
            GitHubAuth.signOut();
          });
          container.appendChild(wrap);
        } else {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-ghost btn-sm auth-connect-btn';
          btn.textContent = 'Connect GitHub';
          btn.addEventListener('click', () => {
            GitHubAuth.openConnectModal().catch(() => {});
          });
          container.appendChild(btn);
        }
      }
      paint();
      this.onChange(paint);
    },
  };

  global.GitHubAuth = GitHubAuth;
  global.GistAPI = GistAPI;
  global.GitHubApiError = GitHubApiError;
})(window);
