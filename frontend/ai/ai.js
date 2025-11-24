class AISummarizerManager {
    constructor() {
        this.currentSummary = null; // Current summary being viewed
        this.summaries = []; // List of user's summaries
        this.currentPage = 1;
        this.totalPages = 1;
        this.API_BASE = "http://localhost:5002";
        this.pollingIntervals = new Map(); // Track polling intervals by summary ID
        this.init();
    }

    /* ========= Boot ========= */
    init() {
        this.initEventListeners();
        this.loadUserSummaries();
    }

    /* ========= Auth wrapper (handles 401 / expired tokens) ========= */
    async fetchWithAuth(url, options = {}) {
        const token = localStorage.getItem("token");
        const headers = options.headers || {};

        const merged = {
            ...options,
            headers: {
                ...headers,
                Authorization: `Bearer ${token || ""}`
            }
        };

        const res = await fetch(url, merged);

        if (res.status === 401) {
            let msg = "Session expired, please log in again.";
            try {
                const t = await res.clone().json();
                if (t?.message) msg = t.message;
            } catch (_) {}
            alert(msg);
            localStorage.removeItem("token");
            window.location.href = "/login.html";
            throw new Error("Unauthorized (401)");
        }

        return res;
    }

    /* ========= Listeners ========= */
    initEventListeners() {
        const fileInput = document.getElementById("fileInput");
        if (fileInput) {
            fileInput.addEventListener("change", (e) => {
                if (e.target.files[0]) this.handleFileUpload(e.target.files[0]);
            });
        }

        const uploadArea = document.getElementById("uploadArea");
        if (uploadArea) {
            uploadArea.addEventListener("dragover", (e) => {
                e.preventDefault();
                uploadArea.classList.add("dragover");
            });
            uploadArea.addEventListener("dragleave", () => {
                uploadArea.classList.remove("dragover");
            });
            uploadArea.addEventListener("drop", (e) => {
                e.preventDefault();
                uploadArea.classList.remove("dragover");
                const files = e.dataTransfer.files;
                if (files[0] && files[0].type === "application/pdf") {
                    this.handleFileUpload(files[0]);
                } else {
                    this.showMessage("Please drop a PDF file.", "error");
                }
            });
            uploadArea.addEventListener("click", () => fileInput?.click());
        }

        // Tabs
        document.querySelectorAll(".summary-tab").forEach(tab => {
            tab.addEventListener("click", (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchSummaryTab(tabName);
            });
        });

        const startNewBtn = document.getElementById("startNewBtn");
        if (startNewBtn) startNewBtn.addEventListener("click", () => this.startNew());
    }

    /* ========= Upload flow ========= */
    async handleFileUpload(file) {
        if (file.type !== "application/pdf") {
            this.showMessage("Please upload a PDF file.", "error");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            this.showMessage("File size must be < 10MB.", "error");
            return;
        }

        this.startProcessing(file.name);

        try {
            // 1) Upload PDF
            const formData = new FormData();
            formData.append("file", file);

            const uploadRes = await this.fetchWithAuth(`${this.API_BASE}/api/files/upload`, {
                method: "POST",
                body: formData
            });

            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) {
                throw new Error(uploadData?.message || "Upload failed");
            }

            const fileUrl = uploadData.fileUrl || uploadData.content?.fileUrl;
            if (!fileUrl) {
                throw new Error("Upload succeeded but fileUrl missing in response.");
            }
            console.log("✅ Uploaded:", fileUrl);

            // 2) Create summary (returns immediately with PENDING status)
            this.setProcessingStep(2);
            const summary = await this.createSummary(fileUrl, file.name);
            
            // 3) Start polling for status
            this.setProcessingStep(3);
            await this.pollSummaryStatus(summary._id);

        } catch (err) {
            console.error("❌ Upload/summarization error:", err);
            this.showMessage(err.message || "Upload failed", "error");
            this.resetToUpload();
        }
    }

    /* ========= API Methods ========= */
    
    /**
     * Create a new summary (returns immediately with PENDING status)
     */
    async createSummary(fileUrl, title) {
        try {
            const res = await this.fetchWithAuth(`${this.API_BASE}/api/ai-summary/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileUrl, title, originalFileName: title })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.message || 'Failed to create summary');
            }

            console.log('✅ Summary created:', data.summary);
            return data.summary;
        } catch (err) {
            console.error('❌ Create summary error:', err);
            throw err;
        }
    }

    /**
     * Poll summary status until COMPLETED or FAILED
     */
    async pollSummaryStatus(summaryId, maxAttempts = 60) {
        let attempts = 0;
        
        return new Promise((resolve, reject) => {
            const interval = setInterval(async () => {
                attempts++;
                
                try {
                    const res = await this.fetchWithAuth(`${this.API_BASE}/api/ai-summary/${summaryId}`);
                    const summary = await res.json();
                    
                    if (!res.ok) {
                        clearInterval(interval);
                        reject(new Error(summary?.message || 'Failed to fetch summary'));
                        return;
                    }

                    console.log(`📊 Summary status: ${summary.status} (attempt ${attempts})`);

                    if (summary.status === 'COMPLETED') {
                        clearInterval(interval);
                        this.currentSummary = summary;
                        this.showResults(summary);
                        this.loadUserSummaries(); // Refresh list
                        resolve(summary);
                    } else if (summary.status === 'FAILED') {
                        clearInterval(interval);
                        this.showMessage(`Summarization failed: ${summary.errorMessage}`, 'error');
                        this.resetToUpload();
                        reject(new Error(summary.errorMessage || 'Summarization failed'));
                    } else if (attempts >= maxAttempts) {
                        clearInterval(interval);
                        this.showMessage('Summarization timeout - please check back later', 'error');
                        this.resetToUpload();
                        reject(new Error('Polling timeout'));
                    }
                    // Otherwise keep polling (PENDING or IN_PROGRESS)
                } catch (err) {
                    console.error('❌ Polling error:', err);
                    clearInterval(interval);
                    reject(err);
                }
            }, 2000); // Poll every 2 seconds
            
            // Store interval for cleanup
            this.pollingIntervals.set(summaryId, interval);
        });
    }

    /**
     * Load user's summaries with pagination
     */
    async loadUserSummaries(page = 1) {
        try {
            const res = await this.fetchWithAuth(
                `${this.API_BASE}/api/ai-summary/my?page=${page}&limit=10`
            );
            
            if (!res.ok) {
                throw new Error('Failed to load summaries');
            }
            
            const data = await res.json();
            this.summaries = data.summaries || [];
            this.currentPage = data.pagination?.page || 1;
            this.totalPages = data.pagination?.pages || 1;
            
            this.renderHistory();
        } catch (err) {
            console.error('❌ Load summaries error:', err);
            const historyEl = document.getElementById("historyList");
            if (historyEl) {
                historyEl.innerHTML = `<div class="error-state">Failed to load summaries</div>`;
            }
        }
    }

    /**
     * Delete a summary
     */
    async deleteSummary(summaryId) {
        if (!confirm('Are you sure you want to delete this summary?')) {
            return;
        }

        try {
            const res = await this.fetchWithAuth(`${this.API_BASE}/api/ai-summary/${summaryId}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data?.message || 'Failed to delete summary');
            }

            this.showMessage('Summary deleted successfully', 'success');
            this.loadUserSummaries(this.currentPage);
            
            // If we're viewing the deleted summary, reset to upload
            if (this.currentSummary?._id === summaryId) {
                this.resetToUpload();
            }
        } catch (err) {
            console.error('❌ Delete summary error:', err);
            this.showMessage(err.message || 'Failed to delete summary', 'error');
        }
    }

    /**
     * Regenerate a failed summary
     */
    async regenerateSummary(summaryId) {
        try {
            const res = await this.fetchWithAuth(`${this.API_BASE}/api/ai-summary/${summaryId}/regenerate`, {
                method: 'POST'
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.message || 'Failed to regenerate summary');
            }

            this.showMessage('Regeneration started...', 'info');
            
            // Start polling for the regenerated summary
            await this.pollSummaryStatus(summaryId);
        } catch (err) {
            console.error('❌ Regenerate summary error:', err);
            this.showMessage(err.message || 'Failed to regenerate summary', 'error');
        }
    }

    /* ========= Tabs ========= */
    switchSummaryTab(tab) {
        document.querySelectorAll(".summary-tab").forEach(el => el.classList.remove("active"));
        document.querySelectorAll(".summary-panel").forEach(el => el.classList.remove("active"));

        const tabBtn = document.querySelector(`.summary-tab[data-tab="${tab}"]`);
        const panel = document.getElementById(tab);
        if (tabBtn) tabBtn.classList.add("active");
        if (panel) panel.classList.add("active");
    }

    /* ========= UI Helpers ========= */
    startProcessing(fileName) {
        const up = document.getElementById("uploadSection");
        const pr = document.getElementById("processingSection");
        const rs = document.getElementById("resultsSection");

        if (up) up.style.display = "none";
        if (pr) pr.style.display = "block";
        if (rs) rs.style.display = "none";

        this.setProcessingStep(1);
    }

    setProcessingStep(stepIndex) {
        const steps = document.querySelectorAll('.processing-steps .step');
        steps.forEach((s, i) => {
            if (i === stepIndex - 1) s.classList.add('active');
            else s.classList.remove('active');
        });
    }

    showResults(summary) {
        const up = document.getElementById("uploadSection");
        const pr = document.getElementById("processingSection");
        const rs = document.getElementById("resultsSection");

        if (up) up.style.display = "none";
        if (pr) pr.style.display = "none";
        if (rs) rs.style.display = "block";

        this.populateResults(summary);
    }

    populateResults(summary) {
        if (!summary) return;

        // Document Info
        const docInfo = document.getElementById("documentInfo");
        if (docInfo) {
            const processingTime = summary.processingTime 
                ? `${(summary.processingTime / 1000).toFixed(1)}s` 
                : 'N/A';
            
            docInfo.innerHTML = `
                <div class="doc-icon">📄</div>
                <div class="doc-details">
                    <div class="doc-name">${this.escapeHtml(summary.title)}</div>
                    <div class="doc-meta">
                        <span>Status: ${this.getStatusBadge(summary.status)}</span>
                        <span>Processing: ${processingTime}</span>
                        <span>Created: ${this.formatDate(summary.createdAt)}</span>
                    </div>
                </div>
            `;
        }

        // Overview text
        const overviewEl = document.getElementById("overviewText");
        if (overviewEl) {
            overviewEl.textContent = summary.summary?.overview || summary.content || "No overview available.";
        }

        // Key points
        const kpEl = document.getElementById("keyPointsList");
        if (kpEl) {
            const keyPoints = summary.summary?.key_points || [];
            const list = keyPoints.map(p => `<div class="key-point">• ${this.escapeHtml(p)}</div>`).join("");
            kpEl.innerHTML = list || `<div class="muted">No key points available.</div>`;
        }

        // Highlights
        const hlEl = document.getElementById("highlightsList");
        if (hlEl) {
            const highlights = summary.summary?.highlights || [];
            const list = highlights.map(h => `<div class="highlight">${this.escapeHtml(h)}</div>`).join("");
            hlEl.innerHTML = list || `<div class="muted">No highlights available.</div>`;
        }
    }

    /* ========= History ========= */
    renderHistory() {
        const historyEl = document.getElementById("historyList");
        if (!historyEl) return;

        if (!this.summaries.length) {
            historyEl.innerHTML = `<div class="muted">No summaries yet. Upload a PDF to get started!</div>`;
            return;
        }

        const summariesHtml = this.summaries.map(entry => `
            <div class="history-item" data-id="${entry._id}">
                <div class="history-content" onclick="aiManager.loadSummary('${entry._id}')">
                    <div class="history-doc">${this.escapeHtml(entry.title)}</div>
                    <div class="history-meta">
                        ${this.getStatusBadge(entry.status)}
                        <span class="history-date">${this.formatDate(entry.createdAt)}</span>
                    </div>
                </div>
                <div class="history-actions">
                    ${entry.status === 'FAILED' ? `
                        <button class="btn-retry" onclick="aiManager.regenerateSummary('${entry._id}')" title="Retry">
                            🔄
                        </button>
                    ` : ''}
                    <button class="btn-delete" onclick="aiManager.deleteSummary('${entry._id}')" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
        `).join("");

        const paginationHtml = this.totalPages > 1 ? `
            <div class="pagination">
                <button 
                    onclick="aiManager.loadUserSummaries(${this.currentPage - 1})"
                    ${this.currentPage === 1 ? 'disabled' : ''}
                >
                    ← Previous
                </button>
                <span>Page ${this.currentPage} of ${this.totalPages}</span>
                <button 
                    onclick="aiManager.loadUserSummaries(${this.currentPage + 1})"
                    ${this.currentPage === this.totalPages ? 'disabled' : ''}
                >
                    Next →
                </button>
            </div>
        ` : '';

        historyEl.innerHTML = summariesHtml + paginationHtml;
    }

    async loadSummary(id) {
        try {
            const res = await this.fetchWithAuth(`${this.API_BASE}/api/ai-summary/${id}`);
            const summary = await res.json();
            
            if (!res.ok) {
                throw new Error(summary?.message || 'Failed to load summary');
            }

            this.currentSummary = summary;
            
            if (summary.status === 'COMPLETED') {
                this.showResults(summary);
            } else if (summary.status === 'PENDING' || summary.status === 'IN_PROGRESS') {
                this.showMessage('Summary is still processing...', 'info');
                this.startProcessing(summary.title);
                await this.pollSummaryStatus(summary._id);
            } else if (summary.status === 'FAILED') {
                this.showMessage(`Summary failed: ${summary.errorMessage}`, 'error');
            }
        } catch (err) {
            console.error('❌ Load summary error:', err);
            this.showMessage(err.message || 'Failed to load summary', 'error');
        }
    }

    /* ========= Utilities ========= */
    getStatusBadge(status) {
        const badges = {
            'PENDING': '<span class="status-badge status-pending">⏳ Pending</span>',
            'IN_PROGRESS': '<span class="status-badge status-progress">⚙️ Processing</span>',
            'COMPLETED': '<span class="status-badge status-completed">✅ Completed</span>',
            'FAILED': '<span class="status-badge status-failed">❌ Failed</span>'
        };
        return badges[status] || '<span class="status-badge">Unknown</span>';
    }

    resetToUpload() {
        const up = document.getElementById("uploadSection");
        const pr = document.getElementById("processingSection");
        const rs = document.getElementById("resultsSection");

        if (up) up.style.display = "block";
        if (pr) pr.style.display = "none";
        if (rs) rs.style.display = "none";
        
        this.currentSummary = null;
    }

    startNew() {
        this.resetToUpload();
        // Clear file input
        const fileInput = document.getElementById("fileInput");
        if (fileInput) fileInput.value = '';
    }

    formatDate(date) {
        try {
            return new Date(date).toLocaleString();
        } catch {
            return "";
        }
    }

    showMessage(message, type = "info") {
        // Simple alert for now — you can wire to a toast UI
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
        alert(`${prefix} ${message}`);
    }

    escapeHtml(str = "") {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /* ========= Download & Share ========= */
    downloadSummary() {
        if (!this.currentSummary) {
            this.showMessage('No summary to download', 'error');
            return;
        }

        // Create a formatted text version of the summary
        const summary = this.currentSummary.summary || {};
        const content = `
${this.currentSummary.title}
${'='.repeat(this.currentSummary.title.length)}

OVERVIEW
--------
${summary.overview || this.currentSummary.content || 'No overview available'}

KEY POINTS
----------
${(summary.key_points || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}

HIGHLIGHTS
----------
${(summary.highlights || []).map((h, i) => `• ${h}`).join('\n')}

---
Generated: ${this.formatDate(this.currentSummary.createdAt)}
Processing Time: ${this.currentSummary.processingTime ? (this.currentSummary.processingTime / 1000).toFixed(1) + 's' : 'N/A'}
        `.trim();

        // Create and download the file
        const blob = new Blob([content], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${this.currentSummary.title.replace(/[^a-z0-9]/gi, '_')}_summary.txt`;
        link.click();
        URL.revokeObjectURL(link.href);

        this.showMessage('Summary downloaded successfully', 'success');
    }

    shareSummary() {
        if (!this.currentSummary) {
            this.showMessage('No summary to share', 'error');
            return;
        }

        const summary = this.currentSummary.summary || {};
        const shareText = `${this.currentSummary.title}\n\n${summary.overview || this.currentSummary.content || 'AI-generated summary'}`;

        if (navigator.share) {
            navigator.share({
                title: `AI Summary: ${this.currentSummary.title}`,
                text: shareText,
                url: window.location.href
            }).then(() => {
                this.showMessage('Summary shared successfully', 'success');
            }).catch((err) => {
                if (err.name !== 'AbortError') {
                    console.error('Share error:', err);
                    this.fallbackShare(shareText);
                }
            });
        } else {
            this.fallbackShare(shareText);
        }
    }

    fallbackShare(text) {
        // Fallback: copy to clipboard
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.showMessage('Summary copied to clipboard!', 'success');
            }).catch(() => {
                this.showMessage('Sharing not supported in this browser', 'error');
            });
        } else {
            this.showMessage('Sharing not supported in this browser', 'error');
        }
    }

    cleanup() {
        // Clear all polling intervals
        this.pollingIntervals.forEach(interval => clearInterval(interval));
        this.pollingIntervals.clear();
    }
}

/* ========= Global init ========= */
let aiManager;
document.addEventListener("DOMContentLoaded", () => {
    // Quick guard if user isn't logged in
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Please log in to use AI summarization.");
        window.location.href = "/login.html";
        return;
    }

    aiManager = new AISummarizerManager();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (aiManager) aiManager.cleanup();
    });
});
