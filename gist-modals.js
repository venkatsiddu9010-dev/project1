/* ==========================================================================
   Gist modal components — shared by gists.html (dashboard) and github.html
   ("Save as Gist" from the code editor).

   Exposes on window:
     - GistModals.openCreateGistModal(prefill, onCreated)
     - GistModals.openEditGistModal(gist, onUpdated)
     - GistModals.openDeleteConfirmModal(gist, onDeleted)
     - GistModals.GIST_LANGUAGES
     - GistModals.langForFilename(filename)
     - GistModals.buildFileTabs(files, activeName, onSelect)   -- GistFileTabs
   ========================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
     Language <-> extension map, used to suggest a filename extension
     and to pick an hljs grammar for previews.
  ------------------------------------------------------------------ */
  const GIST_LANGUAGES = [
    { label: 'Plain text', ext: 'txt', hljs: 'plaintext' },
    { label: 'JavaScript', ext: 'js', hljs: 'javascript' },
    { label: 'TypeScript', ext: 'ts', hljs: 'typescript' },
    { label: 'Python', ext: 'py', hljs: 'python' },
    { label: 'Java', ext: 'java', hljs: 'java' },
    { label: 'C', ext: 'c', hljs: 'c' },
    { label: 'C++', ext: 'cpp', hljs: 'cpp' },
    { label: 'C#', ext: 'cs', hljs: 'csharp' },
    { label: 'Go', ext: 'go', hljs: 'go' },
    { label: 'Rust', ext: 'rs', hljs: 'rust' },
    { label: 'Ruby', ext: 'rb', hljs: 'ruby' },
    { label: 'PHP', ext: 'php', hljs: 'php' },
    { label: 'Swift', ext: 'swift', hljs: 'swift' },
    { label: 'Kotlin', ext: 'kt', hljs: 'kotlin' },
    { label: 'HTML', ext: 'html', hljs: 'html' },
    { label: 'CSS', ext: 'css', hljs: 'css' },
    { label: 'JSON', ext: 'json', hljs: 'json' },
    { label: 'Markdown', ext: 'md', hljs: 'markdown' },
    { label: 'Shell', ext: 'sh', hljs: 'bash' },
    { label: 'YAML', ext: 'yml', hljs: 'yaml' },
  ];
  const EXT_TO_LANG = {};
  GIST_LANGUAGES.forEach((l) => { EXT_TO_LANG[l.ext] = l; });
  // A couple of common extension aliases GitHub itself recognizes.
  EXT_TO_LANG.mjs = EXT_TO_LANG.js;
  EXT_TO_LANG.yaml = EXT_TO_LANG.yml;
  EXT_TO_LANG.htm = EXT_TO_LANG.html;

  function langForFilename(filename) {
    const ext = filename && filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    return EXT_TO_LANG[ext] || { label: 'Plain text', ext: 'txt', hljs: 'plaintext' };
  }

  /* ------------------------------------------------------------------
     Generic modal shell
  ------------------------------------------------------------------ */
  function openModal(innerHtml, opts) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay' + (opts && opts.wide ? ' wide' : '');
    overlay.innerHTML = innerHtml;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close() {
      document.body.style.overflow = '';
      overlay.remove();
    }
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !(opts && opts.preventBackdropClose)) close();
    });
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    });
    return { overlay, close };
  }

  let rowIdCounter = 0;
  function fileRowHtml(file) {
    rowIdCounter += 1;
    const rowId = `frow-${rowIdCounter}`;
    const lang = langForFilename(file.filename || '');
    const options = GIST_LANGUAGES.map(
      (l) => `<option value="${l.ext}" ${l.ext === lang.ext ? 'selected' : ''}>${l.label}</option>`
    ).join('');
    return `
      <div class="gist-file-row" data-row-id="${rowId}" data-orig-filename="${file._orig || ''}">
        <div class="gist-file-row-head">
          <input type="text" class="file-name-input mono" placeholder="filename.ext" value="${escapeAttr(file.filename || '')}">
          <select class="file-lang-select">${options}</select>
          <button type="button" class="icon-btn file-remove-btn" title="Remove file">✕</button>
        </div>
        <textarea class="file-content-input mono" spellcheck="false" placeholder="// paste or write code here">${escapeHtml(file.content || '')}</textarea>
      </div>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
  }

  function wireFileRow(rowEl, filesContainer) {
    const removeBtn = rowEl.querySelector('.file-remove-btn');
    removeBtn.addEventListener('click', () => {
      const rows = filesContainer.querySelectorAll('.gist-file-row');
      if (rows.length <= 1) return; // always keep at least one file
      rowEl.remove();
      updateRemoveButtonsState(filesContainer);
    });
    const nameInput = rowEl.querySelector('.file-name-input');
    const langSelect = rowEl.querySelector('.file-lang-select');
    langSelect.addEventListener('change', () => {
      const chosen = GIST_LANGUAGES.find((l) => l.ext === langSelect.value);
      if (!chosen) return;
      const current = nameInput.value.trim();
      const base = current.includes('.') ? current.slice(0, current.lastIndexOf('.')) : current || 'file';
      nameInput.value = `${base}.${chosen.ext}`;
    });
  }

  function updateRemoveButtonsState(filesContainer) {
    const rows = filesContainer.querySelectorAll('.gist-file-row');
    rows.forEach((r) => {
      r.querySelector('.file-remove-btn').disabled = rows.length <= 1;
    });
  }

  function addFileRow(filesContainer, file) {
    const wrap = document.createElement('div');
    wrap.innerHTML = fileRowHtml(file || { filename: '', content: '' });
    const rowEl = wrap.firstElementChild;
    filesContainer.appendChild(rowEl);
    wireFileRow(rowEl, filesContainer);
    updateRemoveButtonsState(filesContainer);
    return rowEl;
  }

  function collectFilesFromRows(filesContainer) {
    const rows = Array.from(filesContainer.querySelectorAll('.gist-file-row'));
    const files = [];
    for (const row of rows) {
      const filename = row.querySelector('.file-name-input').value.trim();
      const content = row.querySelector('.file-content-input').value;
      const origFilename = row.dataset.origFilename || null;
      if (!filename) throw new Error('Every file needs a filename.');
      if (!content.trim()) throw new Error(`"${filename}" is empty — add some content or remove the file.`);
      files.push({ filename, content, origFilename });
    }
    const names = files.map((f) => f.filename.toLowerCase());
    const dupe = names.find((n, i) => names.indexOf(n) !== i);
    if (dupe) throw new Error(`Two files are named "${dupe}" — filenames must be unique.`);
    return files;
  }

  /* ------------------------------------------------------------------
     CreateGistModal
  ------------------------------------------------------------------ */
  function openCreateGistModal(prefill, onCreated) {
    const initialFiles = (prefill && prefill.files && prefill.files.length ? prefill.files : [{ filename: '', content: '' }]);
    const initialDescription = (prefill && prefill.description) || '';

    const { overlay, close } = openModal(`
      <div class="modal-dialog wide" role="dialog" aria-modal="true" aria-labelledby="createGistTitle">
        <div class="modal-head">
          <h3 id="createGistTitle">Create a new gist</h3>
          <button type="button" class="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label for="gistDescInput">Description</label>
            <input id="gistDescInput" type="text" placeholder="What does this gist do?" value="${escapeAttr(initialDescription)}">
          </div>
          <div class="gist-visibility">
            <label class="radio-pill"><input type="radio" name="gistVis" value="secret" checked> Secret</label>
            <label class="radio-pill"><input type="radio" name="gistVis" value="public"> Public</label>
            <span class="modal-help-inline">Secret gists aren't listed publicly, but anyone with the link can view them.</span>
          </div>
          <div class="gist-files-container" id="createFilesContainer"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="addFileBtn">+ Add file</button>
          <div class="modal-error" id="createGistError" hidden></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
          <button type="button" class="btn btn-primary" id="createGistSubmitBtn">
            <span class="btn-label">Create gist</span>
            <span class="spinner" hidden aria-hidden="true"></span>
          </button>
        </div>
      </div>`);

    const filesContainer = overlay.querySelector('#createFilesContainer');
    initialFiles.forEach((f) => addFileRow(filesContainer, f));

    overlay.querySelector('#addFileBtn').addEventListener('click', () => addFileRow(filesContainer));
    overlay.querySelector('[data-cancel]').addEventListener('click', close);

    const submitBtn = overlay.querySelector('#createGistSubmitBtn');
    const errorBox = overlay.querySelector('#createGistError');

    function setBusy(busy) {
      submitBtn.disabled = busy;
      submitBtn.querySelector('.btn-label').textContent = busy ? 'Creating…' : 'Create gist';
      submitBtn.querySelector('.spinner').hidden = !busy;
    }

    submitBtn.addEventListener('click', async () => {
      errorBox.hidden = true;
      let files;
      try {
        files = collectFilesFromRows(filesContainer);
      } catch (validationErr) {
        errorBox.textContent = validationErr.message;
        errorBox.hidden = false;
        return;
      }
      if (!(await global.GitHubAuth.ensureConnected())) return;

      const isPublic = overlay.querySelector('input[name="gistVis"]:checked').value === 'public';
      const description = overlay.querySelector('#gistDescInput').value.trim();
      const filesPayload = {};
      files.forEach((f) => { filesPayload[f.filename] = { content: f.content }; });

      setBusy(true);
      try {
        const gist = await global.GistAPI.create({ description, isPublic, files: filesPayload });
        setBusy(false);
        close();
        if (typeof onCreated === 'function') onCreated(gist);
      } catch (err) {
        setBusy(false);
        errorBox.textContent = err.message || 'Could not create the gist.';
        errorBox.hidden = false;
      }
    });
  }

  /* ------------------------------------------------------------------
     EditGistModal
  ------------------------------------------------------------------ */
  function openEditGistModal(gist, onUpdated) {
    const existingFiles = Object.values(gist.files).map((f) => ({
      filename: f.filename,
      content: f.content,
      _orig: f.filename,
    }));

    const { overlay, close } = openModal(`
      <div class="modal-dialog wide" role="dialog" aria-modal="true" aria-labelledby="editGistTitle">
        <div class="modal-head">
          <h3 id="editGistTitle">Edit gist</h3>
          <button type="button" class="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label for="editGistDescInput">Description</label>
            <input id="editGistDescInput" type="text" value="${escapeAttr(gist.description || '')}">
          </div>
          <div class="gist-files-container" id="editFilesContainer"></div>
          <button type="button" class="btn btn-ghost btn-sm" id="editAddFileBtn">+ Add file</button>
          <div class="modal-error" id="editGistError" hidden></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost danger-text" id="editDeleteBtn">Delete gist</button>
          <div style="flex:1"></div>
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
          <button type="button" class="btn btn-primary" id="editGistSubmitBtn">
            <span class="btn-label">Save changes</span>
            <span class="spinner" hidden aria-hidden="true"></span>
          </button>
        </div>
      </div>`);

    const filesContainer = overlay.querySelector('#editFilesContainer');
    existingFiles.forEach((f) => {
      const row = addFileRow(filesContainer, f);
      row.dataset.origFilename = f._orig;
    });

    overlay.querySelector('#editAddFileBtn').addEventListener('click', () => addFileRow(filesContainer));
    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    overlay.querySelector('#editDeleteBtn').addEventListener('click', () => {
      close();
      openDeleteConfirmModal(gist, onUpdated);
    });

    const submitBtn = overlay.querySelector('#editGistSubmitBtn');
    const errorBox = overlay.querySelector('#editGistError');

    function setBusy(busy) {
      submitBtn.disabled = busy;
      submitBtn.querySelector('.btn-label').textContent = busy ? 'Saving…' : 'Save changes';
      submitBtn.querySelector('.spinner').hidden = !busy;
    }

    submitBtn.addEventListener('click', async () => {
      errorBox.hidden = true;
      let files;
      try {
        files = collectFilesFromRows(filesContainer);
      } catch (validationErr) {
        errorBox.textContent = validationErr.message;
        errorBox.hidden = false;
        return;
      }
      if (!(await global.GitHubAuth.ensureConnected())) return;

      const description = overlay.querySelector('#editGistDescInput').value.trim();
      const filesPayload = {};
      const keptNames = new Set();

      files.forEach((f) => {
        keptNames.add(f.filename);
        if (f.origFilename && f.origFilename !== f.filename) {
          // Renamed: GitHub matches on the ORIGINAL key and takes the new
          // "filename" field from the value to perform the rename.
          filesPayload[f.origFilename] = { filename: f.filename, content: f.content };
        } else {
          filesPayload[f.filename] = { content: f.content };
        }
      });
      // Any original file not present anymore was deleted by the user.
      Object.keys(gist.files).forEach((origName) => {
        const stillThere = files.some((f) => f.origFilename === origName);
        if (!stillThere) filesPayload[origName] = null;
      });

      setBusy(true);
      try {
        const updated = await global.GistAPI.update(gist.id, { description, files: filesPayload });
        setBusy(false);
        close();
        if (typeof onUpdated === 'function') onUpdated(updated);
      } catch (err) {
        setBusy(false);
        errorBox.textContent = err.message || 'Could not save changes.';
        errorBox.hidden = false;
      }
    });
  }

  /* ------------------------------------------------------------------
     DeleteConfirmModal
  ------------------------------------------------------------------ */
  function openDeleteConfirmModal(gist, onDeleted) {
    const label = gist.description || Object.keys(gist.files)[0] || gist.id;
    const { overlay, close } = openModal(`
      <div class="modal-dialog" role="alertdialog" aria-modal="true" aria-labelledby="deleteGistTitle">
        <div class="modal-head">
          <h3 id="deleteGistTitle">Delete this gist?</h3>
          <button type="button" class="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="modal-body">
          <p class="modal-help">
            "<strong>${escapeHtml(label)}</strong>" will be permanently deleted from GitHub.
            This can't be undone.
          </p>
          <div class="modal-error" id="deleteGistError" hidden></div>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
          <button type="button" class="btn btn-primary btn-danger" id="confirmDeleteBtn">
            <span class="btn-label">Delete gist</span>
            <span class="spinner" hidden aria-hidden="true"></span>
          </button>
        </div>
      </div>`);

    overlay.querySelector('[data-cancel]').addEventListener('click', close);
    const submitBtn = overlay.querySelector('#confirmDeleteBtn');
    const errorBox = overlay.querySelector('#deleteGistError');

    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true;
      submitBtn.querySelector('.btn-label').textContent = 'Deleting…';
      submitBtn.querySelector('.spinner').hidden = false;
      try {
        await global.GistAPI.remove(gist.id);
        close();
        if (typeof onDeleted === 'function') onDeleted(gist.id);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-label').textContent = 'Delete gist';
        submitBtn.querySelector('.spinner').hidden = true;
        errorBox.textContent = err.message || 'Could not delete this gist.';
        errorBox.hidden = false;
      }
    });
  }

  /* ------------------------------------------------------------------
     GistFileTabs — reused by the read-only viewer and inline previews.
     Returns a DOM element; onSelect(name) fires when a tab is clicked.
  ------------------------------------------------------------------ */
  function buildFileTabs(filenames, activeName, onSelect) {
    const bar = document.createElement('div');
    bar.className = 'tabs gist-tabs';
    bar.setAttribute('role', 'tablist');
    filenames.forEach((name) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab' + (name === activeName ? ' active' : '');
      tab.textContent = name;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(name === activeName));
      tab.addEventListener('click', () => onSelect(name));
      bar.appendChild(tab);
    });
    return bar;
  }

  global.GistModals = {
    openCreateGistModal,
    openEditGistModal,
    openDeleteConfirmModal,
    GIST_LANGUAGES,
    langForFilename,
    buildFileTabs,
  };
})(window);
