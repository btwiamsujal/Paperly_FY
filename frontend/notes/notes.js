class NotesManager {
  constructor() {
    this.notes = [];
    this.currentView = 'grid';
    this.editingNote = null;
    this.currentUserId = this.getCurrentUserId();
    this.init();
  }

  async init() {
    await this.fetchNotes();
    this.renderNotes();
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
  }

  renderNotes(notesToRender = this.notes) {
    const grid = document.getElementById("notesGrid");
    if (!notesToRender.length) {
      grid.innerHTML = `<div class="no-notes">No notes yet</div>`;
      return;
    }
    grid.innerHTML = notesToRender.map(note => this.createNoteCard(note)).join("");
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
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);
        const token = localStorage.getItem("token");

        const res = await fetch("/api/files/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Upload failed");
        fileUrl = data.fileUrl;
      } catch (err) {
        console.error("❌ Upload error:", err);
        alert("Upload failed");
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
      this.renderNotes();
      this.closeModal();
    } catch (err) {
      console.error("❌ Save note error:", err);
      alert("Failed to save note");
    } finally {
      stopLoading();
    }
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
      this.renderNotes();
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

    const body = document.getElementById('viewerBody');
    if (note.type === 'text') {
      body.innerHTML = `<div style=\"white-space: pre-wrap; line-height:1.6;\">${this.escapeHtml(note.content || '')}</div>`;
    } else if (note.type === 'image') {
      body.innerHTML = `<img src=\"${note.fileUrl || ''}\" alt=\"${this.escapeHtml(note.title)}\" style=\"max-height:70vh;width:auto;display:block;margin:auto;\" onerror=\"this.replaceWith(document.createTextNode('Image unavailable'))\"/>`;
    } else if (note.type === 'pdf') {
      const proxied = `/api/files/pdf?src=${encodeURIComponent(note.fileUrl || '')}`;
      // Create iframe first (empty), then set src via blob URL fetched with auth header
      body.innerHTML = `<iframe class=\"pdf-frame\" src=\"\" allowfullscreen></iframe>`;
      const iframe = body.querySelector('.pdf-frame');
      const token = localStorage.getItem('token');
      fetch(proxied, { headers: { Authorization: `Bearer ${token}` }})
        .then(async (res) => {
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(text || `Failed to load PDF (${res.status})`);
          }
          return res.blob();
        })
        .then((blob) => {
          // Revoke previous URL if any
          if (this.currentPdfUrl) { URL.revokeObjectURL(this.currentPdfUrl); }
          const url = URL.createObjectURL(blob);
          this.currentPdfUrl = url;
          iframe.src = `${url}#toolbar=0&navpanes=0&scrollbar=1`;
        })
        .catch((err) => {
          body.innerHTML = `<div style=\"padding:12px;color:#c00;\">Unable to display PDF: ${this.escapeHtml(err.message)}</div>`;
        });
    } else {
      body.innerHTML = '<div>Unsupported note type</div>';
    }

    document.getElementById('viewerModal').classList.add('active');
  }

  closeViewer() {
    if (this.currentPdfUrl) {
      try { URL.revokeObjectURL(this.currentPdfUrl); } catch (_) {}
      this.currentPdfUrl = null;
    }
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
