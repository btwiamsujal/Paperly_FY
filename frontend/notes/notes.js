class NotesManager {
  constructor() {
    this.notes = [];
    this.currentView = 'grid';
    this.editingNote = null;
    this.currentUserId = this.getCurrentUserId();
    this.init();
  }

  async init() {
    this.searchQuery = '';
    this.selectedType = '';
    this.selectedTag = '';
    await this.fetchNotes();
    this.refreshList();
    this.initEventListeners();
  }

  getCurrentUserId() {
    const token = localStorage.getItem("token");
    const payload = this.decodeJwt(token);
    return payload?.id || null;
  }

  async fetchNotes() {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/files/notes", {
        headers: { Authorization: `Bearer ${token}` }
      });
      this.notes = await res.json();
    } catch (err) {
      console.error("❌ Fetch notes error:", err);
      this.notes = [];
    }
  }

  initEventListeners() {
    const grid = document.getElementById("notesGrid");
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.note-card');
      if (!card) return;
      const noteId = card.dataset.id;
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'edit') {
        e.stopPropagation();
        this.openEdit(noteId);
        return;
      }
      if (action === 'delete') {
        e.stopPropagation();
        this.deleteNote(noteId);
        return;
      }
      this.openViewer(noteId);
    });

    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.querySelector('.search-btn');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.searchQuery = searchInput.value.trim().toLowerCase();
        this.refreshList();
      });
      if (searchBtn) {
        searchBtn.addEventListener('click', () => {
          this.searchQuery = searchInput.value.trim().toLowerCase();
          this.refreshList();
        });
      }
    }

    const typeFilter = document.getElementById('typeFilter');
    if (typeFilter) {
      typeFilter.addEventListener('change', () => {
        this.selectedType = typeFilter.value;
        this.refreshList();
      });
    }
    const tagFilter = document.getElementById('tagFilter');
    if (tagFilter) {
      tagFilter.addEventListener('change', () => {
        this.selectedTag = tagFilter.value.trim().toLowerCase();
        this.refreshList();
      });
    }

    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle) {
      viewToggle.addEventListener('click', () => {
        const gridEl = document.getElementById('notesGrid');
        gridEl.classList.toggle('list-view');
      });
    }

    // File input preview
    const fileInput = document.getElementById('noteFile');
    const filePreview = document.getElementById('filePreview');
    if (fileInput && filePreview) {
      fileInput.addEventListener('change', () => {
        filePreview.innerHTML = '';
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        if (f.type.startsWith('image/')) {
          const url = URL.createObjectURL(f);
          const img = document.createElement('img');
          img.src = url;
          img.alt = f.name;
          img.style.maxWidth = '100%';
          img.style.maxHeight = '200px';
          img.style.objectFit = 'contain';
          img.onload = () => URL.revokeObjectURL(url);
          filePreview.appendChild(img);
        } else if (f.type === 'application/pdf') {
          filePreview.innerHTML = '<div class="note-pdf"><span class="pdf-icon">📄</span> PDF selected</div>';
        } else {
          filePreview.textContent = f.name;
        }
      });
    }
  }

  renderNotes(notesToRender = this.notes) {
    const grid = document.getElementById("notesGrid");
    if (!notesToRender.length) {
      grid.innerHTML = `<div class=\"no-notes\">No matching notes</div>`;
      return;
    }
    grid.innerHTML = notesToRender.map(note => this.createNoteCard(note)).join("");
  }

  getFilteredNotes() {
    const q = (this.searchQuery || '').toLowerCase();
    const type = this.selectedType || '';
    const tag = (this.selectedTag || '').toLowerCase();

    return this.notes.filter(n => {
      if (type && n.type !== type) return false;
      if (tag && !(n.tags || []).some(t => t.toLowerCase() === tag)) return false;
      if (!q) return true;
      const hay = [n.title, n.content, ...(n.tags || []), n.uploadedBy?.name]
        .filter(Boolean)
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  refreshList() {
    this.renderNotes(this.getFilteredNotes());
  }

  createNoteCard(note) {
    const owner = (note.uploadedBy && (note.uploadedBy._id || note.uploadedBy.id)) === this.currentUserId;
    const uploaderName = note.uploadedBy?.name || 'Unknown';
    const date = this.formatDate(note.date);

    let preview = "";
    if (note.type === "text") preview = `<div class=\"note-content\">${this.escapeHtml(note.content || '').slice(0, 300)}</div>`;
    if (note.type === "image") preview = `<img src=\"${note.fileUrl || ''}\" class=\"note-image\" alt=\"${this.escapeHtml(note.title)}\" onerror=\"this.replaceWith(document.createTextNode('Image unavailable'))\"/>`;
    if (note.type === "pdf") preview = `<div class=\"note-pdf\"><span class=\"pdf-icon\">📄</span> <div>PDF document</div></div>`;

    const tags = (note.tags || []).map(t => `<span class=\"note-tag\">${this.escapeHtml(t)}</span>`).join('');

    return `
      <div class=\"note-card\" data-id=\"${note._id}\">\n        <div class=\"note-header\">\n          <h3 class=\"note-title\">${this.escapeHtml(note.title)}</h3>\n          <span class=\"note-type\">${note.type.toUpperCase()}</span>\n        </div>\n        <div class=\"note-meta\">by ${this.escapeHtml(uploaderName)} • ${date}</div>\n        ${preview}\n        <div class=\"note-footer\">\n          <div class=\"note-tags\">${tags}</div>\n          <div class=\"note-actions\">\n            ${owner ? `<button class=\"action-btn\" data-action=\"edit\" title=\"Edit\">✏️</button>\n            <button class=\"action-btn delete\" data-action=\"delete\" title=\"Delete\">🗑️</button>` : ''}\n          </div>\n        </div>\n      </div>`;
  }

  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  formatDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return ''; }
  }

  decodeJwt(token) {
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1] || '';
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '==='.slice((base64.length + 3) % 4);
      const json = atob(padded);
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  cloudinaryInlineUrl(url) {
    try {
      if (!url) return url;
      const u = new URL(url);
      if (!u.hostname.includes('res.cloudinary.com')) return url;
      // insert fl_inline into the delivery URL right after /upload/
      return url.replace('/upload/', '/upload/fl_inline/');
    } catch (_) {
      return url;
    }
  }

  async saveNote() {
    const submitBtn = document.getElementById('noteSubmitBtn');
    const originalHtml = submitBtn.innerHTML;
    const startLoading = () => {
      submitBtn.disabled = true;
      submitBtn.classList.add('btn-loading');
      submitBtn.innerHTML = '<span class="dots-loader" aria-hidden="true"><span></span><span></span><span></span><span></span></span>';
    };
    const stopLoading = () => {
      submitBtn.disabled = false;
      submitBtn.classList.remove('btn-loading');
      submitBtn.innerHTML = originalHtml;
    };
    const title = document.getElementById("noteTitle").value;
    startLoading();
    const type = document.getElementById("noteType").value;
    const content = document.getElementById("noteContent").value;
    const tags = document.getElementById("noteTags").value.split(",").map(t => t.trim()).filter(Boolean);
    const fileInput = document.getElementById("noteFile");

    if (!title.trim()) return alert("Title required");

    let fileUrl = null;
    // Require a file when creating image/pdf notes
    if (!this.editingNote && (type === 'image' || type === 'pdf')) {
      if (!fileInput.files.length) {
        alert('Please attach a file for this note type.');
        stopLoading();
        return;
      }
    }
    if (fileInput.files.length) {
      try {
        const token = localStorage.getItem("token");
        const typeSelect = document.getElementById('noteType');
        const noteType = typeSelect ? typeSelect.value : 'text';

        const file = fileInput.files[0];
        let toUpload = file;

        // Client-side compress images to speed up upload
        if (noteType === 'image' && file.type.startsWith('image/')) {
          try { toUpload = await this.compressImage(file, 1600, 0.82); } catch(_) {}
        }

        const formData = new FormData();
        // Keep a consistent filename extension when compressing
        const uploadName = (noteType === 'image' && toUpload.type === 'image/jpeg' && !/\.jpe?g$/i.test(file.name))
          ? file.name.replace(/\.[^.]+$/, '.jpg') : file.name;
        formData.append('file', toUpload, uploadName);

        const data = await this.uploadWithProgress('/api/files/upload', formData, token);
        fileUrl = data.fileUrl;
      } catch (err) {
        console.error("❌ Upload error:", err);
        alert("Upload failed");
        // hide progress
        const wrap = document.getElementById('uploadProgressWrap');
        if (wrap) wrap.classList.add('hidden');
        return;
      }
    }

    try {
      const token = localStorage.getItem("token");
      if (this.editingNote) {
        // Update existing note
        const payload = { title, content, tags };
        if (fileUrl) payload.fileUrl = fileUrl; // optional replace
        const res = await fetch(`/api/files/notes/${this.editingNote._id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        const updated = await res.json();
        // Update in memory
        const idx = this.notes.findIndex(n => n._id === updated._id);
        if (idx >= 0) this.notes[idx] = updated;
      } else {
        // Create new
        const res = await fetch("/api/files/notes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ title, type, content, tags, fileUrl })
        });
        const newNote = await res.json();
        this.notes.unshift(newNote);
      }
      this.refreshList();
      this.closeModal();
    } catch (err) {
      console.error("❌ Save note error:", err);
      alert("Failed to save note");
    } finally {
      stopLoading();
    }
  }

  // Upload with progress using XHR to support progress events
  uploadWithProgress(url, formData, token) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const wrap = document.getElementById('uploadProgressWrap');
      const bar = document.getElementById('uploadProgressBar');
      const text = document.getElementById('uploadProgressText');
      if (wrap) wrap.classList.remove('hidden');
      if (bar) bar.style.width = '0%';
      if (text) text.textContent = '0%';

      xhr.open('POST', url, true);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        if (bar) bar.style.width = pct + '%';
        if (text) text.textContent = pct + '%';
      };

      xhr.onerror = () => {
        if (wrap) wrap.classList.add('hidden');
        reject(new Error('Network error during upload'));
      };

      xhr.onload = () => {
        if (wrap) wrap.classList.add('hidden');
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.message || 'Upload failed'));
        } catch (e) {
          reject(new Error('Invalid server response'));
        }
      };

      xhr.send(formData);
    });
  }

  // Client-side image compression to speed up uploads
  compressImage(file, maxDimension = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return resolve(file);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try {
          // Compute new size preserving aspect ratio
          let { width, height } = img;
          if (width <= maxDimension && height <= maxDimension) {
            URL.revokeObjectURL(url);
            return resolve(file);
          }
          if (width > height) {
            const ratio = maxDimension / width;
            width = maxDimension;
            height = Math.round(height * ratio);
          } else {
            const ratio = maxDimension / height;
            height = maxDimension;
            width = Math.round(width * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          // Use JPEG for better compression unless original is PNG with transparency
          let mime = 'image/jpeg';
          if (file.type === 'image/png') {
            // Try to detect transparency by sampling
            try {
              const sample = ctx.getImageData(0,0,Math.min(10,width),Math.min(10,height)).data;
              let hasAlpha = false;
              for (let i=3;i<sample.length;i+=4){ if (sample[i] < 255) { hasAlpha = true; break; } }
              mime = hasAlpha ? 'image/png' : 'image/jpeg';
            } catch (_) { mime = 'image/png'; }
          }
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(new File([blob], file.name, { type: mime }));
            else reject(new Error('Compression failed'));
          }, mime, quality);
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  openEdit(noteId) {
    const note = this.notes.find(n => n._id === noteId);
    if (!note) return;
    this.editingNote = note;
    document.getElementById('noteModalTitle').textContent = 'Edit Note';
    document.getElementById('noteSubmitBtn').textContent = 'Update Note';

    document.getElementById('noteTitle').value = note.title || '';
    document.getElementById('noteType').value = note.type;
    // Type cannot be changed for simplicity
    document.getElementById('noteType').disabled = true;
    document.getElementById('noteContent').value = note.type === 'text' ? (note.content || '') : '';
    document.getElementById('noteTags').value = (note.tags || []).join(', ');
    // Reset file input
    document.getElementById('noteFile').value = '';
    handleTypeChange();
    document.getElementById('noteModal').classList.add('active');
  }

  async deleteNote(noteId) {
    if (!confirm('Delete this note?')) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/files/notes/${noteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Delete failed');
      }
      this.notes = this.notes.filter(n => n._id !== noteId);
      this.refreshList();
    } catch (err) {
      alert(err.message);
    }
  }

  openViewer(noteId) {
    const note = this.notes.find(n => n._id === noteId);
    if (!note) return;
    document.getElementById('viewerTitle').textContent = note.title || 'Note';
    const meta = document.getElementById('viewerMeta');
    const uploaderName = note.uploadedBy?.name || 'Unknown';
    const date = this.formatDate(note.date);
    meta.innerHTML = `<div class=\"note-meta\">by ${this.escapeHtml(uploaderName)} • ${date}</div>`;

    // Reset zoom state
    this.viewerType = note.type;
    this.imageZoom = 1;
    this.pdfZoom = 100;

    const body = document.getElementById('viewerBody');
    if (note.type === 'text') {
      body.innerHTML = `<div style=\"white-space: pre-wrap; line-height:1.6;\">${this.escapeHtml(note.content || '')}</div>`;
    } else if (note.type === 'image') {
      body.innerHTML = `<div class=\"image-viewport\"><img id=\"viewerImage\" src=\"${note.fileUrl || ''}\" alt=\"${this.escapeHtml(note.title)}\" onerror=\"this.replaceWith(document.createTextNode('Image unavailable'))\"/></div>`;
      // Wheel zoom for image
      const viewport = body.querySelector('.image-viewport');
      viewport.addEventListener('wheel', (e) => {
        if (!e.ctrlKey) return; // ctrl+wheel to zoom
        e.preventDefault();
        this.adjustZoom('in', 'image', e.deltaY < 0 ? 0.1 : -0.1);
      }, { passive: false });
      this.applyImageZoom();
    } else if (note.type === 'pdf') {
      const proxied = `/api/files/pdf?src=${encodeURIComponent(note.fileUrl || '')}`;
      body.innerHTML = `<div class=\"pdf-viewport\" id=\"pdfViewport\"></div>`;
      const token = localStorage.getItem('token');
      fetch(proxied, { headers: { Authorization: `Bearer ${token}` }})
        .then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || `Failed to load PDF (${res.status})`);
          }
          return res.arrayBuffer();
        })
        .then(async (arrayBuffer) => {
          await this.ensurePdfJs();
          // Configure worker
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          }
          const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          this._pdfDoc = pdf;
          this._pdfPageNum = 1;
          this._pdfScale = 1.0;
          await this.renderPdfDoc();
        })
        .catch((err) => {
          body.innerHTML = `<div style=\"padding:12px;color:#c00;\">Unable to display PDF: ${this.escapeHtml(err.message)}</div>`;
        });
    } else {
      body.innerHTML = '<div>Unsupported note type</div>';
    }

    // Bind zoom controls
    const btnIn = document.getElementById('zoomIn');
    const btnOut = document.getElementById('zoomOut');
    const btnReset = document.getElementById('zoomReset');
    const btnFit = document.getElementById('zoomFit');
    btnIn.onclick = () => this.adjustZoom('in');
    btnOut.onclick = () => this.adjustZoom('out');
    btnReset.onclick = () => this.adjustZoom('reset');
    btnFit.onclick = () => this.adjustZoom('fit');

    document.getElementById('viewerModal').classList.add('active');

    // Handle window resize to keep PDF sizing consistent
    this._onResize = () => {
      if (this.viewerType === 'pdf') this.applyPdfZoom();
      if (this.viewerType === 'image') this.applyImageZoom();
    };
    window.addEventListener('resize', this._onResize);
  }

  applyImageZoom() {
    const img = document.getElementById('viewerImage');
    if (!img) return;
    const z = Math.max(0.2, Math.min(5, this.imageZoom || 1));
    this.imageZoom = z;
    img.style.transformOrigin = 'center center';
    img.style.transform = `scale(${z})`;
    this.updateZoomDisplay();
  }

  async ensurePdfJs() {
    if (window.pdfjsLib) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = resolve; s.onerror = () => reject(new Error('Failed to load pdf.js'));
      document.head.appendChild(s);
    });
  }

  async renderPdfDoc() {
    const viewportEl = document.getElementById('pdfViewport');
    if (!viewportEl || !this._pdfDoc) return;

    // Capture center ratio vs total content height for center-centric zoom
    const cW = viewportEl.clientWidth;
    const cH = viewportEl.clientHeight;
    const prevScrollMid = (viewportEl.scrollTop + cH / 2) / Math.max(1, viewportEl.scrollHeight);

    const desiredScale = Math.max(0.2, Math.min(5, this._pdfScale || 1));
    this._pdfScale = desiredScale;

    // Clear existing pages
    viewportEl.innerHTML = '';

    const numPages = this._pdfDoc.numPages || 1;
    let baseWidth = this._pdfBaseWidth || 0;

    for (let i = 1; i <= numPages; i++) {
      const page = await this._pdfDoc.getPage(i);
      if (!baseWidth) {
        const baseViewport = page.getViewport({ scale: 1 });
        baseWidth = baseViewport.width;
        this._pdfBaseWidth = baseWidth;
      }
      const vp = page.getViewport({ scale: desiredScale });
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width)}px`;
      canvas.style.height = `${Math.floor(vp.height)}px`;
      viewportEl.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    }

    // Restore center after render using ratio
    const newScrollTarget = Math.max(0, prevScrollMid * viewportEl.scrollHeight - cH / 2);
    viewportEl.scrollTop = Math.round(newScrollTarget);

    this.updateZoomDisplay();
  }

  applyPdfZoom(initial = false) {
    // Re-render all pages at new scale
    this.renderPdfDoc();
  }

  adjustZoom(action, typeOverride = null, delta = null) {
    const type = typeOverride || this.viewerType;
    if (type === 'image') {
      if (action === 'in') this.imageZoom = (this.imageZoom || 1) + (delta ?? 0.2);
      else if (action === 'out') this.imageZoom = (this.imageZoom || 1) - 0.2;
      else if (action === 'reset') this.imageZoom = 1;
      else if (action === 'fit') {
        // With CSS object-fit: contain, natural fit is scale = 1
        this.imageZoom = 1;
      }
      this.applyImageZoom();
    } else if (type === 'pdf') {
      if (action === 'in') this._pdfScale = (this._pdfScale || 1) + 0.2;
      else if (action === 'out') this._pdfScale = (this._pdfScale || 1) - 0.2;
      else if (action === 'reset') this._pdfScale = 1;
      else if (action === 'fit') {
        try {
          const viewportEl = document.getElementById('pdfViewport');
          const pageWidth = this._pdfBaseWidth || 800;
          const containerWidth = viewportEl ? (viewportEl.clientWidth - 24) : 800;
          this._pdfScale = pageWidth > 0 ? Math.max(0.2, Math.min(5, containerWidth / pageWidth)) : 1;
        } catch(_) { this._pdfScale = 1; }
      }
      this.applyPdfZoom();
    }
  }

  updateZoomDisplay() {
    const resetBtn = document.getElementById('zoomReset');
    if (!resetBtn) return;
    const type = this.viewerType;
    if (type === 'image') {
      const percent = Math.round((this.imageZoom || 1) * 100);
      resetBtn.textContent = `${percent}%`;
    } else if (type === 'pdf') {
      const percent = Math.round((this._pdfScale || 1) * 100);
      resetBtn.textContent = `${percent}%`;
    } else {
      resetBtn.textContent = '100%';
    }
  }

  closeViewer() {
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      this._onResize = null;
    }
    this._pdfDoc = null;
    this._pdfPageNum = 1;
    this._pdfScale = 1;
    document.getElementById('viewerModal').classList.remove('active');
    document.getElementById('viewerBody').innerHTML = '';
  }

  closeModal() {
    this.editingNote = null;
    document.getElementById('noteModalTitle').textContent = 'Create Note';
    document.getElementById('noteSubmitBtn').textContent = 'Save Note';
    document.getElementById('noteType').disabled = false;
    document.getElementById("noteModal").classList.remove("active");
    document.getElementById("noteForm").reset();
    document.getElementById("filePreview").innerHTML = "";
  }
}

// Global
let notesManager;
document.addEventListener("DOMContentLoaded", () => {
  if (!ensureAuth()) return;
  notesManager = new NotesManager();
  document.getElementById("noteForm").addEventListener("submit", e => {
    e.preventDefault();
    notesManager.saveNote();
  });
});

function ensureAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '../auth/auth.html';
    return false;
  }
  const payload = (notesManager && typeof notesManager.decodeJwt === 'function')
    ? notesManager.decodeJwt(token)
    : (function(){
        try {
          const base64Url = token.split('.')[1] || '';
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const padded = base64 + '==='.slice((base64.length + 3) % 4);
          return JSON.parse(atob(padded));
        } catch (_) { return null; }
      })();
  if (payload && payload.exp && (Date.now() / 1000) > payload.exp) {
    localStorage.removeItem('token');
    window.location.href = '../auth/auth.html';
    return false;
  }
  return true;
}

function openCreateModal() {
  document.getElementById("noteModal").classList.add("active");
}
function closeModal() {
  notesManager.closeModal();
}
function closeViewer() {
  notesManager.closeViewer();
}
function handleTypeChange() {
  const type = document.getElementById("noteType").value;
  const fileGroup = document.getElementById("fileGroup");
  const fileInput = document.getElementById("noteFile");
  const textGroup = document.getElementById("textGroup");
  if (type === "text") {
    fileGroup.classList.add("hidden");
    textGroup.classList.remove("hidden");
    fileInput.value = "";
  } else if (type === "image") {
    fileGroup.classList.remove("hidden");
    textGroup.classList.add("hidden");
    fileInput.accept = ".jpg,.jpeg,.png";
  } else if (type === "pdf") {
    fileGroup.classList.remove("hidden");
    textGroup.classList.add("hidden");
    fileInput.accept = ".pdf";
  }
}
