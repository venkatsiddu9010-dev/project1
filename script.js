/* ==========================================================================
   Github Browser — front-end logic
   Sections:
   1. Nav (mobile menu, active link, smooth scroll)
   2. Scroll reveal
   3. Hero decorations (language bar, typing effect)
   4. Toasts
   5. GitHub Browser app (repo form, file tree, tabs, code viewer)
   6. Execution engine (Piston API for code, iframe preview for HTML)
   ========================================================================== */

(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     1. NAV
  --------------------------------------------------------------------- */
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Highlight the nav link for the section currently in view
  const navAnchors = document.querySelectorAll('[data-nav]');
  const sections = Array.from(navAnchors)
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  if (sections.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = '#' + entry.target.id;
          const link = document.querySelector(`[data-nav][href="${id}"]`);
          if (!link) return;
          if (entry.isIntersecting) {
            navAnchors.forEach((a) => a.classList.remove('active'));
            link.classList.add('active');
          }
        });
      },
      { rootMargin: '-40% 0px -50% 0px' }
    );
    sections.forEach((s) => sectionObserver.observe(s));
  }

  /* ---------------------------------------------------------------------
     2. SCROLL REVEAL
  --------------------------------------------------------------------- */
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealItems.forEach((i) => io.observe(i));
  } else {
    revealItems.forEach((i) => i.classList.add('in'));
  }

  /* ---------------------------------------------------------------------
     3. HERO DECORATIONS
  --------------------------------------------------------------------- */
  (function langBar() {
    const bar = document.getElementById('langBar');
    if (!bar) return;
    const langs = [
      { n: 'Python', w: 22, c: 'var(--blue)' },
      { n: 'JavaScript', w: 18, c: 'var(--gold)' },
      { n: 'Java', w: 12, c: 'var(--violet)' },
      { n: 'Go', w: 9, c: 'var(--green)' },
      { n: 'Rust', w: 8, c: 'var(--pink)' },
      { n: 'C++', w: 7, c: 'var(--red)' },
      { n: 'TypeScript', w: 6, c: 'var(--blue)' },
      { n: 'Ruby', w: 5, c: 'var(--red)' },
      { n: 'C#', w: 5, c: 'var(--green)' },
      { n: 'Other 51', w: 8, c: 'var(--muted)' },
    ];
    langs.forEach((l) => {
      const s = document.createElement('span');
      s.style.width = l.w + '%';
      s.style.background = l.c;
      s.title = l.n;
      bar.appendChild(s);
    });
  })();

  (function typedTerminal() {
    const el = document.getElementById('typedOut');
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = 'Hello, world!';
      return;
    }
    const text = 'Hello, world!';
    let i = 0;
    function type() {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        i++;
        setTimeout(type, 70);
      }
    }
    setTimeout(type, 900);
  })();

  /* ---------------------------------------------------------------------
     4. TOASTS
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
     5. GITHUB BROWSER APP
  --------------------------------------------------------------------- */
  const repoForm = document.getElementById('repoForm');
  const ownerInput = document.getElementById('ownerInput');
  const repoInput = document.getElementById('repoInput');
  const branchInput = document.getElementById('branchInput');
  const loadRepoBtn = document.getElementById('loadRepoBtn');
  const formStatus = document.getElementById('formStatus');
  const repoPath = document.getElementById('repoPath');

  const treeEmpty = document.getElementById('treeEmpty');
  const treeRoot = document.getElementById('treeRoot');

  const tabBar = document.getElementById('tabBar');
  const fileMeta = document.getElementById('fileMeta');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const runBtn = document.getElementById('runBtn');
  const codeEmpty = document.getElementById('codeEmpty');
  const codeBlock = document.getElementById('codeBlock');
  const codeContent = document.getElementById('codeContent');

  const consoleOutput = document.getElementById('consoleOutput');
  const runStatus = document.getElementById('runStatus');
  const clearConsoleBtn = document.getElementById('clearConsoleBtn');

  // App state
  const state = {
    owner: null,
    repo: null,
    branch: null,
    tabs: [], // { path, name, content, isBinary }
    activeTab: null,
  };

  // Extension -> { hljs language, piston alias, kind }
  const LANG_MAP = {
    py: { hljs: 'python', piston: 'python', kind: 'code' },
    js: { hljs: 'javascript', piston: 'javascript', kind: 'code' },
    mjs: { hljs: 'javascript', piston: 'javascript', kind: 'code' },
    ts: { hljs: 'typescript', piston: 'typescript', kind: 'code' },
    java: { hljs: 'java', piston: 'java', kind: 'code' },
    c: { hljs: 'c', piston: 'c', kind: 'code' },
    h: { hljs: 'c', piston: 'c', kind: 'code' },
    cpp: { hljs: 'cpp', piston: 'c++', kind: 'code' },
    cc: { hljs: 'cpp', piston: 'c++', kind: 'code' },
    cs: { hljs: 'csharp', piston: 'csharp', kind: 'code' },
    go: { hljs: 'go', piston: 'go', kind: 'code' },
    rs: { hljs: 'rust', piston: 'rust', kind: 'code' },
    rb: { hljs: 'ruby', piston: 'ruby', kind: 'code' },
    php: { hljs: 'php', piston: 'php', kind: 'code' },
    kt: { hljs: 'kotlin', piston: 'kotlin', kind: 'code' },
    swift: { hljs: 'swift', piston: 'swift', kind: 'code' },
    sh: { hljs: 'bash', piston: 'bash', kind: 'code' },
    bash: { hljs: 'bash', piston: 'bash', kind: 'code' },
    pl: { hljs: 'perl', piston: 'perl', kind: 'code' },
    lua: { hljs: 'lua', piston: 'lua', kind: 'code' },
    r: { hljs: 'r', piston: 'r', kind: 'code' },
    dart: { hljs: 'dart', piston: 'dart', kind: 'code' },
    scala: { hljs: 'scala', piston: 'scala', kind: 'code' },
    hs: { hljs: 'haskell', piston: 'haskell', kind: 'code' },
    ex: { hljs: 'elixir', piston: 'elixir', kind: 'code' },
    clj: { hljs: 'clojure', piston: 'clojure', kind: 'code' },
    html: { hljs: 'html', piston: null, kind: 'html' },
    htm: { hljs: 'html', piston: null, kind: 'html' },
    css: { hljs: 'css', piston: null, kind: 'style' },
    json: { hljs: 'json', piston: null, kind: 'data' },
    yml: { hljs: 'yaml', piston: null, kind: 'data' },
    yaml: { hljs: 'yaml', piston: null, kind: 'data' },
    md: { hljs: 'markdown', piston: null, kind: 'text' },
    txt: { hljs: 'plaintext', piston: null, kind: 'text' },
  };

  function langInfoFor(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return LANG_MAP[ext] || { hljs: 'plaintext', piston: null, kind: 'text' };
  }

  const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'];

  function setFormStatus(message, type) {
    formStatus.textContent = message || '';
    formStatus.className = 'form-status' + (type ? ' ' + type : '');
  }

  function setLoading(isLoading) {
    const label = loadRepoBtn.querySelector('.btn-label');
    const spinner = loadRepoBtn.querySelector('.spinner');
    loadRepoBtn.disabled = isLoading;
    spinner.hidden = !isLoading;
    label.textContent = isLoading ? 'Loading…' : 'Load repository';
  }

  async function ghFetch(url) {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('GitHub API rate limit reached. Wait a few minutes and try again.');
      }
      if (res.status === 404) {
        throw new Error('Repository or branch not found. Check the owner and repo name.');
      }
      throw new Error(`GitHub API error (${res.status}).`);
    }
    return res.json();
  }

  async function loadRepository(owner, repo, branch) {
    setLoading(true);
    setFormStatus('Contacting GitHub…');
    try {
      const repoData = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`);
      const resolvedBranch = branch || repoData.default_branch;

      const treeData = await ghFetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(resolvedBranch)}?recursive=1`
      );

      if (treeData.truncated) {
        showToast('This repository is large — showing a partial file tree.', 'error');
      }

      state.owner = owner;
      state.repo = repo;
      state.branch = resolvedBranch;
      state.tabs = [];
      state.activeTab = null;

      renderTree(treeData.tree || []);
      repoPath.textContent = `${owner}/${repo} @ ${resolvedBranch}`;
      renderTabs();
      renderCode();

      setFormStatus(`Loaded ${owner}/${repo} — ${treeData.tree.length} items on ${resolvedBranch}.`, 'success');
      showToast(`Repository ${owner}/${repo} loaded`, 'success');
    } catch (err) {
      setFormStatus(err.message, 'error');
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // Build a nested structure from GitHub's flat tree list, then render it
  function renderTree(flatTree) {
    const root = { name: '', children: {}, type: 'tree' };

    flatTree.forEach((entry) => {
      const parts = entry.path.split('/');
      let node = root;
      parts.forEach((part, idx) => {
        const isLast = idx === parts.length - 1;
        if (!node.children[part]) {
          node.children[part] = {
            name: part,
            children: {},
            type: isLast ? entry.type : 'tree',
            path: isLast ? entry.path : parts.slice(0, idx + 1).join('/'),
          };
        }
        node = node.children[part];
      });
    });

    treeRoot.innerHTML = '';
    treeRoot.appendChild(buildTreeList(root, 0));
    treeEmpty.hidden = true;
    treeRoot.hidden = false;
  }

  function sortedChildren(node) {
    return Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  function buildTreeList(node, depth) {
    const ul = document.createElement('ul');
    if (depth === 0) ul.className = 'tree-root-list';

    sortedChildren(node).forEach((child) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tree-node-btn';

      if (child.type === 'tree') {
        btn.innerHTML = `<span class="caret">▸</span><span class="icon">📁</span><span class="name"></span>`;
        btn.querySelector('.name').textContent = child.name;
        const sub = buildTreeList(child, depth + 1);
        sub.hidden = true;
        btn.addEventListener('click', () => {
          const expanded = btn.classList.toggle('expanded');
          sub.hidden = !expanded;
        });
        li.appendChild(btn);
        li.appendChild(sub);
      } else {
        const ext = child.name.split('.').pop().toLowerCase();
        const icon = IMAGE_EXT.includes(ext) ? '🖼️' : '📄';
        btn.innerHTML = `<span class="caret" style="visibility:hidden">▸</span><span class="icon">${icon}</span><span class="name"></span>`;
        btn.querySelector('.name').textContent = child.name;
        btn.dataset.path = child.path;
        btn.addEventListener('click', () => openFile(child.path, btn));
        li.appendChild(btn);
      }
      ul.appendChild(li);
    });

    return ul;
  }

  async function openFile(path, btnEl) {
    const existing = state.tabs.find((t) => t.path === path);
    if (existing) {
      state.activeTab = path;
      renderTabs();
      renderCode();
      highlightActiveTreeNode(path);
      return;
    }

    const ext = path.split('.').pop().toLowerCase();
    if (IMAGE_EXT.includes(ext)) {
      showToast('Image preview isn\u2019t supported yet — try a text-based source file.', 'error');
      return;
    }

    fileMeta.textContent = `Loading ${path}…`;
    try {
      const raw = await fetchRawFile(state.owner, state.repo, state.branch, path);
      state.tabs.push({ path, name: path.split('/').pop(), content: raw });
      state.activeTab = path;
      renderTabs();
      renderCode();
      highlightActiveTreeNode(path);
    } catch (err) {
      showToast(`Couldn't open ${path}: ${err.message}`, 'error');
      fileMeta.textContent = 'Select a file to view its source';
    }
  }

  function highlightActiveTreeNode(path) {
    treeRoot.querySelectorAll('.tree-node-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.path === path);
    });
  }

  async function fetchRawFile(owner, repo, branch, path) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`file fetch failed (${res.status})`);
    return res.text();
  }

  function closeTab(path, evt) {
    if (evt) evt.stopPropagation();
    const idx = state.tabs.findIndex((t) => t.path === path);
    if (idx === -1) return;
    state.tabs.splice(idx, 1);
    if (state.activeTab === path) {
      state.activeTab = state.tabs.length ? state.tabs[Math.max(0, idx - 1)].path : null;
    }
    renderTabs();
    renderCode();
    highlightActiveTreeNode(state.activeTab);
  }

  function renderTabs() {
    tabBar.innerHTML = '';
    state.tabs.forEach((tab) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tab' + (tab.path === state.activeTab ? ' active' : '');
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', String(tab.path === state.activeTab));
      el.innerHTML = `<span class="name"></span><span class="tab-close" aria-label="Close ${tab.name}">✕</span>`;
      el.querySelector('.name').textContent = tab.name;
      el.addEventListener('click', () => {
        state.activeTab = tab.path;
        renderTabs();
        renderCode();
        highlightActiveTreeNode(tab.path);
      });
      el.querySelector('.tab-close').addEventListener('click', (e) => closeTab(tab.path, e));
      tabBar.appendChild(el);
    });
  }

  function renderCode() {
    const tab = state.tabs.find((t) => t.path === state.activeTab);
    if (!tab) {
      codeEmpty.hidden = false;
      codeBlock.hidden = true;
      fileMeta.textContent = 'Select a file to view its source';
      copyBtn.disabled = true;
      downloadBtn.disabled = true;
      runBtn.disabled = true;
      return;
    }

    const lang = langInfoFor(tab.name);
    codeEmpty.hidden = true;
    codeBlock.hidden = false;
    fileMeta.textContent = `${tab.path} · ${lang.hljs}`;
    copyBtn.disabled = false;
    downloadBtn.disabled = false;
    runBtn.disabled = !(lang.kind === 'html' || lang.piston);
    runBtn.querySelector('span') && (runBtn.innerHTML = lang.kind === 'html' ? 'Preview <span aria-hidden="true">▶</span>' : 'Run <span aria-hidden="true">▶</span>');

    codeContent.textContent = tab.content;
    codeContent.className = `language-${lang.hljs}`;
    if (window.hljs) {
      try {
        window.hljs.highlightElement(codeContent);
      } catch (e) {
        /* highlighting is cosmetic — fall back to plain text silently */
      }
    }
  }

  copyBtn.addEventListener('click', async () => {
    const tab = state.tabs.find((t) => t.path === state.activeTab);
    if (!tab) return;
    try {
      await navigator.clipboard.writeText(tab.content);
      showToast('Copied to clipboard', 'success');
    } catch {
      showToast('Could not copy — your browser blocked clipboard access.', 'error');
    }
  });

  downloadBtn.addEventListener('click', () => {
    const tab = state.tabs.find((t) => t.path === state.activeTab);
    if (!tab) return;
    const blob = new Blob([tab.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  clearConsoleBtn.addEventListener('click', () => {
    consoleOutput.innerHTML = '<span class="console-placeholder">Output will appear here after you run a file.</span>';
    runStatus.textContent = '';
    runStatus.className = 'run-status';
  });

  /* ---------------------------------------------------------------------
     6. EXECUTION ENGINE
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
    runStatus.textContent = text;
    runStatus.className = 'run-status' + (kind ? ' ' + kind : '');
  }

  runBtn.addEventListener('click', async () => {
    const tab = state.tabs.find((t) => t.path === state.activeTab);
    if (!tab) return;
    const lang = langInfoFor(tab.name);

    if (lang.kind === 'html') {
      previewHtml(tab);
      return;
    }

    if (!lang.piston) {
      showToast('This file type isn\u2019t executable — try a source file like .py or .js.', 'error');
      return;
    }

    runBtn.disabled = true;
    setRunStatus('Running…', 'running');
    consoleOutput.textContent = '';

    try {
      const runtimes = await getRuntimes();
      const match = runtimes.find((r) => r.language === lang.piston || (r.aliases && r.aliases.includes(lang.piston)));
      if (!match) throw new Error(`No runtime available for ${lang.piston}.`);

      const res = await fetch('https://emkc.org/api/v2/piston/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: match.language,
          version: match.version,
          files: [{ name: tab.name, content: tab.content }],
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

      consoleOutput.textContent = output;
      const failed = (run.code && run.code !== 0) || run.stderr || compile.stderr;
      setRunStatus(failed ? 'Error' : 'Success', failed ? 'error' : 'success');
    } catch (err) {
      consoleOutput.textContent = err.message;
      setRunStatus('Error', 'error');
      showToast(err.message, 'error');
    } finally {
      runBtn.disabled = false;
    }
  });

  function previewHtml(tab) {
    consoleOutput.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.title = `Live preview of ${tab.name}`;
    consoleOutput.appendChild(iframe);
    iframe.srcdoc = tab.content;
    setRunStatus('Success', 'success');
  }

  /* ---------------------------------------------------------------------
     Form wiring
  --------------------------------------------------------------------- */
  repoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const owner = ownerInput.value.trim();
    const repo = repoInput.value.trim();
    const branch = branchInput.value.trim();
    if (!owner || !repo) {
      setFormStatus('Enter both an owner and a repository name.', 'error');
      return;
    }
    loadRepository(owner, repo, branch);
  });

  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [owner, repo] = btn.dataset.sample.split('/');
      ownerInput.value = owner;
      repoInput.value = repo;
      branchInput.value = '';
      loadRepository(owner, repo, '');
    });
  });

  document.querySelectorAll('[data-explore]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTimeout(() => ownerInput && ownerInput.focus({ preventScroll: true }), 500);
    });
  });
})();
