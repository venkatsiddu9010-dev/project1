/* ==========================================================================
   Gists dashboard — app logic for gists.html
   1. Toasts (same pattern as github.js)
   2. Auth-gated dashboard: load / search / filter / sort / GistCard / GistList
   3. Gist detail: GistFileTabs + viewer (syntax highlight, raw, copy, download)
   4. Run / preview a gist file (Piston API / iframe — same engine as github.js)
   5. Create / Edit / Delete wiring (delegates to GistModals + GistAPI)
   6. Bridge: "Open in Editor" hands a file off to github.html
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     1. TOASTS
  --------------------------------------------------------------------- */
  const toastStack = document.getElementById('toastStack');
  function showToast(message, type) {
    if (!toastStack) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    toastStack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s ease';
      setTimeout(() => el.remove(), 320);
    }, 4200);
  }

  /* ---------------------------------------------------------------------
     Elements
  --------------------------------------------------------------------- */
  const authSlot = document.getElementById('authSlot');
  const authGate = document.getElementById('authGate');
  const authGateConnectBtn = document.getElementById('authGateConnectBtn');

  const gistListView = document.getElementById('gistListView');
  const gistSkeleton = document.getElementById('gistSkeleton');
  const gistEmpty = document.getElementById('gistEmpty');
  const gistLoadError = document.getElementById('gistLoadError');
  const gistGrid = document.getElementById('gistGrid');

  const searchInput = document.getElementById('gistSearchInput');
  const visFilter = document.getElementById('gistVisFilter');
  const sortSelect = document.getElementById('gistSortSelect');
  const newGistBtn = document.getElementById('newGistBtn');
  const emptyNewGistBtn = document.getElementById('emptyNewGistBtn');

  const gistDetailView = document.getElementById('gistDetailView');
  const backToListBtn = document.getElementById('backToListBtn');
  const gistDetailPath = document.getElementById('gistDetailPath');
  const gistDetailMeta = document.getElementById('gistDetailMeta');
  const gistTabsBar = document.getElementById('gistTabsBar');
  const gistFileMeta = document.getElementById('gistFileMeta');
  const gistCodeBlock = document.getElementById('gistCodeBlock');
  const gistCodeContent = document.getElementById('gistCodeContent');
  const gistRawBlock = document.getElementById('gistRawBlock');
  const gistViewRawBtn = document.getElementById('gistViewRawBtn');
  const gistCopyBtn = document.getElementById('gistCopyBtn');
  const gistDownloadBtn = document.getElementById('gistDownloadBtn');
  const gistRunBtn = document.getElementById('gistRunBtn');
  const gistEditBtn = document.getElementById('gistEditBtn');
  const gistDeleteBtn = document.getElementById('gistDeleteBtn');
  const gistOpenInEditorBtn = document.getElementById('gistOpenInEditorBtn');
  const gistThemeToggle = document.getElementById('gistThemeToggle');
  const gistConsolePanel = document.getElementById('gistConsolePanel');
  const gistConsoleOutput = document.getElementById('gistConsoleOutput');
  const gistRunStatus = document.getElementById('gistRunStatus');
  const gistClearConsoleBtn = document.getElementById('gistClearConsoleBtn');
  const hljsThemeLink = document.getElementById('hljsTheme');

  const HLJS_DARK = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
  const HLJS_LIGHT = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';

  const PISTON_ALIAS = {
    js: 'javascript', ts: 'typescript', py: 'python', java: 'java', c: 'c',
    cpp: 'c++', cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
    swift: 'swift', kt: 'kotlin', sh: 'bash',
  };

  /* ---------------------------------------------------------------------
     State
  --------------------------------------------------------------------- */
  const state = {
    gists: [],       // raw list from the API
    detail: null,    // full gist currently open
    activeFile: null,
    theme: 'dark',
  };

  /* ---------------------------------------------------------------------
     2. AUTH GATE
  --------------------------------------------------------------------- */
  GitHubAuth.renderBadge(authSlot);
  authGateConnectBtn.addEventListener('click', () => {
    GitHubAuth.openConnectModal().then(() => loadGists()).catch(() => {});
  });

  function refreshAuthView() {
    if (GitHubAuth.isAuthed()) {
      authGate.hidden = true;
      gistListView.hidden = false;
    } else {
      authGate.hidden = false;
      gistListView.hidden = true;
      gistDetailView.hidden = true;
    }
  }
  GitHubAuth.onChange(() => {
    refreshAuthView();
    if (GitHubAuth.isAuthed()) loadGists();
  });
  refreshAuthView();

  /* ---------------------------------------------------------------------
     LIST LOADING
  --------------------------------------------------------------------- */
  function setListState(mode) {
    // mode: 'loading' | 'empty' | 'error' | 'ready'
    gistSkeleton.hidden = mode !== 'loading';
    gistEmpty.hidden = mode !== 'empty';
    gistLoadError.hidden = mode !== 'error';
    gistGrid.hidden = mode !== 'ready';
  }

  async function loadGists() {
    setListState('loading');
    try {
      let page = 1;
      let all = [];
      while (page <= 5) {
        const batch = await GistAPI.listMine(page);
        all = all.concat(batch);
        if (batch.length < 100) break;
        page += 1;
      }
      state.gists = all;
      if (!all.length) {
        setListState('empty');
      } else {
        setListState('ready');
        renderGistGrid();
      }
    } catch (err) {
      gistLoadError.innerHTML = `<p><strong>Couldn't load your gists.</strong> ${escapeHtml(err.message)}</p>`;
      setListState('error');
      showToast(err.message, 'error');
      if (err.kind === 'auth') refreshAuthView();
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  }

  /* ---------------------------------------------------------------------
     GistCard + GistList (search / filter / sort applied on render)
  --------------------------------------------------------------------- */
  function GistCard(gist) {
    const filenames = Object.keys(gist.files || {});
    const card = document.createElement('div');
    card.className = 'gist-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.innerHTML = `
      <div class="gist-card-head">
        <span class="badge ${gist.public ? 'badge-public' : 'badge-secret'}">${gist.public ? 'Public' : 'Secret'}</span>
        <span class="gist-card-count mono">${filenames.length} file${filenames.length === 1 ? '' : 's'}</span>
      </div>
      <h3 class="gist-card-desc">${escapeHtml(gist.description || filenames[0] || 'Untitled gist')}</h3>
      <div class="gist-card-files mono">${filenames.slice(0, 3).map((f) => `<span>${escapeHtml(f)}</span>`).join('')}${filenames.length > 3 ? `<span>+${filenames.length - 3} more</span>` : ''}</div>
      <div class="gist-card-dates">
        <span>Created ${formatDate(gist.created_at)}</span>
        <span>Updated ${formatDate(gist.updated_at)}</span>
      </div>`;
    card.addEventListener('click', () => openGistDetail(gist.id));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGistDetail(gist.id); }
    });
    return card;
  }

  function filteredSortedGists() {
    const q = searchInput.value.trim().toLowerCase();
    const vis = visFilter.value;
    let list = state.gists.filter((g) => {
      if (vis === 'public' && !g.public) return false;
      if (vis === 'secret' && g.public) return false;
      if (!q) return true;
      const inDesc = (g.description || '').toLowerCase().includes(q);
      const inFiles = Object.keys(g.files || {}).some((f) => f.toLowerCase().includes(q));
      return inDesc || inFiles;
    });
    const sortBy = sortSelect.value;
    list = list.slice().sort((a, b) => {
      if (sortBy === 'created') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'name') {
        const an = Object.keys(a.files || {})[0] || '';
        const bn = Object.keys(b.files || {})[0] || '';
        return an.localeCompare(bn);
      }
      return new Date(b.updated_at) - new Date(a.updated_at); // 'updated' default
    });
    return list;
  }

  function renderGistGrid() {
    const list = filteredSortedGists();
    gistGrid.innerHTML = '';
    if (!list.length) {
      const msg = document.createElement('p');
      msg.className = 'gist-no-results mono';
      msg.textContent = 'No gists match your search.';
      gistGrid.appendChild(msg);
      return;
    }
    list.forEach((g) => gistGrid.appendChild(GistCard(g)));
  }

  [searchInput, visFilter, sortSelect].forEach((el) => {
    el.addEventListener('input', renderGistGrid);
    el.addEventListener('change', renderGistGrid);
  });

  /* ---------------------------------------------------------------------
     3. GIST DETAIL — GistFileTabs + Viewer
  --------------------------------------------------------------------- */
  async function openGistDetail(id) {
    gistListView.hidden = true;
    gistDetailView.hidden = false;
    gistDetailPath.textContent = 'Loading gist…';
    gistDetailMeta.innerHTML = '';
    gistTabsBar.innerHTML = '';
    gistCodeContent.textContent = '';
    gistConsolePanel.hidden = true;

    try {
      const gist = await GistAPI.get(id);
      state.detail = gist;
      const filenames = Object.keys(gist.files);
      state.activeFile = filenames[0];
      gistDetailPath.textContent = `${gist.owner ? gist.owner.login + ' / ' : ''}${gist.description || filenames[0]}`;
      gistDetailMeta.innerHTML = `
        <span class="badge ${gist.public ? 'badge-public' : 'badge-secret'}">${gist.public ? 'Public' : 'Secret'}</span>
        <span class="mono">Created ${formatDate(gist.created_at)}</span>
        <span class="mono">Updated ${formatDate(gist.updated_at)}</span>
        <a href="${gist.html_url}" target="_blank" rel="noopener" class="modal-link">View on GitHub ↗</a>`;
      renderFileTabs();
      renderActiveFile();
    } catch (err) {
      gistDetailPath.textContent = 'Could not load this gist';
      gistDetailMeta.innerHTML = `<span style="color:var(--red)">${escapeHtml(err.message)}</span>`;
      showToast(err.message, 'error');
    }
  }

  function renderFileTabs() {
    const filenames = Object.keys(state.detail.files);
    gistTabsBar.innerHTML = '';
    gistTabsBar.appendChild(GistModals.buildFileTabs(filenames, state.activeFile, (name) => {
      state.activeFile = name;
      renderFileTabs();
      renderActiveFile();
    }));
  }

  function activeFileObj() {
    return state.detail && state.detail.files[state.activeFile];
  }

  function renderActiveFile() {
    const file = activeFileObj();
    if (!file) return;
    gistRawBlock.hidden = true;
    gistCodeBlock.hidden = false;
    gistViewRawBtn.textContent = 'View Raw';
    const lang = GistModals.langForFilename(file.filename);
    gistFileMeta.textContent = `${file.filename} · ${lang.label}`;
    gistCodeContent.textContent = file.content || '';
    gistCodeContent.className = `language-${lang.hljs}`;
    if (window.hljs) {
      try { window.hljs.highlightElement(gistCodeContent); } catch {}
    }
    const runnable = lang.ext === 'html' || !!PISTON_ALIAS[lang.ext];
    gistRunBtn.disabled = !runnable;
    gistRunBtn.innerHTML = lang.ext === 'html' ? 'Preview <span aria-hidden="true">▶</span>' : 'Run <span aria-hidden="true">▶</span>';
  }

  gistViewRawBtn.addEventListener('click', () => {
    const file = activeFileObj();
    if (!file) return;
    const showingRaw = !gistRawBlock.hidden;
    if (showingRaw) {
      gistRawBlock.hidden = true;
      gistCodeBlock.hidden = false;
      gistViewRawBtn.textContent = 'View Raw';
    } else {
      gistRawBlock.textContent = file.content || '';
      gistRawBlock.hidden = false;
      gistCodeBlock.hidden = true;
      gistViewRawBtn.textContent = 'View Highlighted';
    }
  });

  gistCopyBtn.addEventListener('click', async () => {
    const file = activeFileObj();
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.content || '');
      showToast('Copied to clipboard', 'success');
    } catch {
      showToast('Could not copy — your browser blocked clipboard access.', 'error');
    }
  });

  gistDownloadBtn.addEventListener('click', () => {
    const file = activeFileObj();
    if (!file) return;
    const blob = new Blob([file.content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  gistThemeToggle.addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    hljsThemeLink.href = state.theme === 'dark' ? HLJS_DARK : HLJS_LIGHT;
    document.getElementById('gistCodeScroll').classList.toggle('theme-light', state.theme === 'light');
  });

  backToListBtn.addEventListener('click', () => {
    gistDetailView.hidden = true;
    gistListView.hidden = false;
    state.detail = null;
  });

  /* ---------------------------------------------------------------------
     4. RUN / PREVIEW (same engine as the main Browser: Piston + iframe)
  --------------------------------------------------------------------- */
  let runtimesCache = null;
  async function getRuntimes() {
    if (runtimesCache) return runtimesCache;
    const res = await fetch('https://emkc.org/api/v2/piston/runtimes');
    if (!res.ok) throw new Error('Could not reach the execution engine.');
    runtimesCache = await res.json();
    return runtimesCache;
  }

  function setRunStatus(text, kind) {
    gistRunStatus.textContent = text;
    gistRunStatus.className = 'run-status' + (kind ? ' ' + kind : '');
  }

  gistClearConsoleBtn.addEventListener('click', () => {
    gistConsoleOutput.innerHTML = '<span class="console-placeholder">Output will appear here after you run a file.</span>';
    setRunStatus('', '');
  });

  gistRunBtn.addEventListener('click', async () => {
    const file = activeFileObj();
    if (!file) return;
    const lang = GistModals.langForFilename(file.filename);
    gistConsolePanel.hidden = false;

    if (lang.ext === 'html') {
      gistConsoleOutput.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.title = `Live preview of ${file.filename}`;
      gistConsoleOutput.appendChild(iframe);
      iframe.srcdoc = file.content;
      setRunStatus('Success', 'success');
      return;
    }

    const piston = PISTON_ALIAS[lang.ext];
    if (!piston) {
      showToast('This file type isn\u2019t executable — try a source file like .py or .js.', 'error');
      return;
    }

    gistRunBtn.disabled = true;
    setRunStatus('Running…', 'running');
    gistConsoleOutput.textContent = '';

    try {
      const runtimes = await getRuntimes();
      const match = runtimes.find((r) => r.language === piston || (r.aliases && r.aliases.includes(piston)));
      if (!match) throw new Error(`No runtime available for ${piston}.`);

      const res = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: match.language,
          version: match.version,
          files: [{ name: file.filename, content: file.content }],
        }),
      });
      if (!res.ok) throw new Error(`Execution engine returned an error (${res.status}).`);
      const data = await res.json();
      const run = data.run || {};
      const compile = data.compile || {};
      let output = '';
      if (compile.stderr) output += compile.stderr + '\n';
      output += run.stdout || '';
      if (run.stderr) output += (output ? '\n' : '') + run.stderr;
      if (!output.trim()) output = '(no output)';
      gistConsoleOutput.textContent = output;
      const failed = (run.code && run.code !== 0) || !!run.stderr || !!compile.stderr;
      setRunStatus(failed ? 'Error' : 'Success', failed ? 'error' : 'success');
    } catch (err) {
      gistConsoleOutput.textContent = err.message;
      setRunStatus('Error', 'error');
      showToast(err.message, 'error');
    } finally {
      gistRunBtn.disabled = false;
    }
  });

  /* ---------------------------------------------------------------------
     5. CREATE / EDIT / DELETE
  --------------------------------------------------------------------- */
  function openCreate() {
    GistModals.openCreateGistModal(null, (gist) => {
      showToast('Gist created', 'success');
      state.gists.unshift(gist);
      setListState('ready');
      renderGistGrid();
    });
  }
  newGistBtn.addEventListener('click', openCreate);
  emptyNewGistBtn.addEventListener('click', openCreate);

  gistEditBtn.addEventListener('click', () => {
    if (!state.detail) return;
    GistModals.openEditGistModal(state.detail, (updated) => {
      showToast('Gist updated', 'success');
      state.detail = updated;
      const idx = state.gists.findIndex((g) => g.id === updated.id);
      if (idx !== -1) state.gists[idx] = updated;
      const filenames = Object.keys(updated.files);
      if (!filenames.includes(state.activeFile)) state.activeFile = filenames[0];
      renderFileTabs();
      renderActiveFile();
      gistDetailMeta.querySelector('.mono:nth-of-type(2)') && (gistDetailMeta.innerHTML = gistDetailMeta.innerHTML); // meta timestamps refresh below
      openGistDetail(updated.id);
    });
  });

  gistDeleteBtn.addEventListener('click', () => {
    if (!state.detail) return;
    GistModals.openDeleteConfirmModal(state.detail, (id) => {
      showToast('Gist deleted', 'success');
      state.gists = state.gists.filter((g) => g.id !== id);
      gistDetailView.hidden = true;
      gistListView.hidden = false;
      if (!state.gists.length) setListState('empty');
      else renderGistGrid();
    });
  });

  /* ---------------------------------------------------------------------
     6. BRIDGE: open a gist file in the main code editor
  --------------------------------------------------------------------- */
  gistOpenInEditorBtn.addEventListener('click', () => {
    const file = activeFileObj();
    if (!file) return;
    try {
      sessionStorage.setItem('ghb_open_in_editor', JSON.stringify({ name: file.filename, content: file.content }));
    } catch {
      showToast('Could not hand this file off to the editor.', 'error');
      return;
    }
    window.location.href = 'github.html?openGist=1';
  });
})();
