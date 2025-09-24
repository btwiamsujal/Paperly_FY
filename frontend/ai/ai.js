class AISummarizerManager {
    constructor() {
        this.currentDocument = null;
        this.summaryData = {};              // overview, key_points, highlights get stored here
        this.summaryHistory = this.loadHistory();
        this.API_BASE = "http://localhost:5002"; // change if your backend is hosted elsewhere
        this.fileUrl = null;
        this._pending = {}; // track in-flight fetches per tab to avoid duplicates
        this.init();
    }

    /* ========= Boot ========= */
    init() {
        this.initEventListeners();
        this.renderHistory();
    }

    /* ========= Auth wrapper (handles 401 / expired tokens) ========= */
    async fetchWithAuth(url, options = {}) {
        const token = localStorage.getItem("token");
        const headers = options.headers || {};
        const hasContentType = Object.keys(headers).some(
            k => k.toLowerCase() === "content-type"
        );

        // Don’t force Content-Type when sending FormData
        const merged = {
            ...options,
            headers: {
                ...headers,
                Authorization: `Bearer ${token || ""}`
            }
        };

        const res = await fetch(url, merged);

        if (res.status === 401) {
            // try to parse message for clarity
            let msg = "Session expired, please log in again.";
            try {
                const t = await res.clone().json();
                if (t?.message) msg = t.message;
            } catch (_) {
                // ignore parse error, keep default
            }
            alert(msg);
            localStorage.removeItem("token");
            // redirect to your login page (change path if different)
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

        // Optional global actions
        const dlBtn = document.getElementById("downloadSummaryBtn");
        if (dlBtn) dlBtn.addEventListener("click", () => this.downloadSummary());

        const shareBtn = document.getElementById("shareSummaryBtn");
        if (shareBtn) shareBtn.addEventListener("click", () => this.shareSummary());

        const startNewBtn = document.getElementById("startNewBtn");
        if (startNewBtn) startNewBtn.addEventListener("click", () => location.reload());
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

        this.currentDocument = { name: file.name, size: file.size, uploadDate: new Date() };
        this.startProcessing();

        try {
            // 1) Upload PDF
            const formData = new FormData();
            formData.append("file", file);

            const uploadRes = await this.fetchWithAuth(`${this.API_BASE}/api/files/upload`, {
                method: "POST",
                body: formData
            });

            const textMaybeJson = await uploadRes.text(); // read once
            let uploadData;
            try {
                uploadData = JSON.parse(textMaybeJson);
            } catch {
                throw new Error(textMaybeJson || "Upload failed");
            }
            if (!uploadRes.ok) {
                const msg = uploadData?.message || "Upload failed";
                throw new Error(msg);
            }

            // Handle both possible shapes from backend:
            // { fileUrl: "..." } OR { content: { fileUrl: "..." } }
            this.fileUrl = uploadData.fileUrl || uploadData.content?.fileUrl;
            if (!this.fileUrl) {
                throw new Error("Upload succeeded but fileUrl missing in response.");
            }
            console.log("✅ Uploaded:", this.fileUrl);

            // 2) As soon as upload succeeds, move to step 2 (Analyzing content)
            this.setProcessingStep(2);

            // Start all AI requests in parallel for speed
            const overviewPromise = this.fetchSummary("overview");
            // Prefetch others immediately (no overlays)
            this.fetchSummary("key-points");
            this.fetchSummary("highlights");

            // Wait only for overview to show the first result
            await overviewPromise;

            // Step 3 (Generating summary) just before showing results
            this.setProcessingStep(3);
            this.showResults(this.summaryData);

        } catch (err) {
            console.error("❌ Upload error:", err);
            this.showMessage(err.message || "Upload failed", "error");
            // roll back UI
            document.getElementById("processingSection")?.style && (document.getElementById("processingSection").style.display = "none");
            document.getElementById("uploadSection")?.style && (document.getElementById("uploadSection").style.display = "block");
        }
    }

    /* ========= Tabs ========= */
    async switchSummaryTab(tab) {
        // basic UI toggle
        document.querySelectorAll(".summary-tab").forEach(el => el.classList.remove("active"));
        document.querySelectorAll(".summary-panel").forEach(el => el.classList.remove("active"));

        const tabBtn = document.querySelector(`.summary-tab[data-tab="${tab}"]`);
        const panel = document.getElementById(tab);
        if (tabBtn) tabBtn.classList.add("active");
        if (panel) panel.classList.add("active");

        // Fetch data if not already present (no overlays/placeholders)
        if (!this.summaryData[tab] && this.fileUrl) {
            await this.fetchSummary(tab);
        }

        this.populateResults(this.summaryData);
    }

    async fetchSummary(tab) {
        if (!this.fileUrl) {
            this.showMessage("No file to summarize yet.", "error");
            return;
        }

        // Deduplicate concurrent requests per tab
        if (this._pending && this._pending[tab]) {
            try { await this._pending[tab]; } catch (_) {}
            return;
        }

        const task = (async () => {
            try {
                let endpoint;
                if (tab === "overview") endpoint = "/api/files/analyze-pdf-url";
                if (tab === "key-points") endpoint = "/api/files/analyze-key-points";
                if (tab === "highlights") endpoint = "/api/files/analyze-highlights";
                if (!endpoint) return;

                const res = await this.fetchWithAuth(`${this.API_BASE}${endpoint}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fileUrl: this.fileUrl })
                });

                const textMaybeJson = await res.text();
                let data;
                try {
                    data = JSON.parse(textMaybeJson);
                } catch {
                    throw new Error(textMaybeJson || "Failed to parse AI response");
                }

                if (!res.ok) {
                    const msg = data?.message || "AI summarization failed";
                    throw new Error(msg);
                }

                // Merge results. If overview returns more fields, they’ll be stored here.
                this.summaryData = { ...this.summaryData, ...data };
            } catch (err) {
                console.error(`❌ Error fetching ${tab}:`, err);
                this.showMessage(err.message || `Error fetching ${tab}`, "error");
            }
        })();

        this._pending = this._pending || {};
        this._pending[tab] = task;
        try {
            await task;
        } finally {
            delete this._pending[tab];
        }
    }

    /* ========= UI Helpers ========= */
    startProcessing() {
        const up = document.getElementById("uploadSection");
        const pr = document.getElementById("processingSection");
        const rs = document.getElementById("resultsSection");

        if (up) up.style.display = "none";
        if (pr) pr.style.display = "block";
        if (rs) rs.style.display = "none"; // keep results hidden until we actually have data

        // Reset and set initial step to 1 (Extracting text)
        this.setProcessingStep(1);
    }

    setProcessingStep(stepIndex) {
        const steps = document.querySelectorAll('.processing-steps .step');
        steps.forEach((s, i) => {
            if (i === stepIndex - 1) s.classList.add('active');
            else s.classList.remove('active');
        });
    }

    showResults(summaryData) {
        const up = document.getElementById("uploadSection");
        const pr = document.getElementById("processingSection");
        const rs = document.getElementById("resultsSection");

        if (up) up.style.display = "none";
        if (pr) pr.style.display = "none"; // hide processing once we have data
        if (rs) rs.style.display = "block";

        this.populateResults(summaryData);

        // Save to history only if we have at least one of the fields
        const hasData = !!(summaryData?.overview || (summaryData?.key_points?.length) || (summaryData?.highlights?.length));
        if (hasData && this.currentDocument) {
            this.saveToHistory(summaryData);
        }
    }

    populateResults(summaryData) {
        if (!this.currentDocument) return;

        // Document Info
        const docInfo = document.getElementById("documentInfo");
        if (docInfo) {
            docInfo.innerHTML = `
                <div class="doc-icon">📄</div>
                <div class="doc-details">
                    <div class="doc-name">${this.currentDocument.name}</div>
                    <div class="doc-meta">
                        <span>Size: ${this.formatFileSize(this.currentDocument.size)}</span>
                        <span>Processed: ${this.formatDate(this.currentDocument.uploadDate)}</span>
                    </div>
                </div>
            `;
        }

        // Overview text
        const overviewEl = document.getElementById("overviewText");
        if (overviewEl) {
            overviewEl.textContent = summaryData.overview || "No overview yet.";
        }

        // Key points
        const kpEl = document.getElementById("keyPointsList");
        if (kpEl) {
            const list = (summaryData.key_points || []).map(p => `<div class="key-point">• ${this.escapeHtml(p)}</div>`).join("");
            kpEl.innerHTML = list || `<div class="muted">No key points yet.</div>`;
        }

        // Highlights
        const hlEl = document.getElementById("highlightsList");
        if (hlEl) {
            const list = (summaryData.highlights || []).map(h => `<div class="highlight">${this.escapeHtml(h)}</div>`).join("");
            hlEl.innerHTML = list || `<div class="muted">No highlights yet.</div>`;
        }
    }

    /* ========= History ========= */
    saveToHistory(summaryData) {
        this.summaryHistory.push({
            docName: this.currentDocument.name,
            summary: summaryData,
            date: new Date().toISOString()
        });
        localStorage.setItem("summaryHistory", JSON.stringify(this.summaryHistory));
        this.renderHistory();
    }

    renderHistory() {
        const historyEl = document.getElementById("historyList");
        if (!historyEl) return;

        if (!this.summaryHistory.length) {
            historyEl.innerHTML = `<div class="muted">No history yet.</div>`;
            return;
        }

        historyEl.innerHTML = this.summaryHistory.map((entry, idx) => `
            <div class="history-item" onclick="aiManager.loadFromHistory(${idx})" title="Load summary">
                <div class="history-doc">${this.escapeHtml(entry.docName)}</div>
                <div class="history-date">${this.formatDate(new Date(entry.date))}</div>
            </div>
        `).join("");
    }

    loadFromHistory(index) {
        const entry = this.summaryHistory[index];
        if (!entry) return;
        this.currentDocument = { name: entry.docName, size: 0, uploadDate: new Date(entry.date) };
        this.summaryData = entry.summary || {};
        this.showResults(this.summaryData);
    }

    /* ========= Save & Share ========= */
    downloadSummary() {
        if (!this.currentDocument) return;
        const blob = new Blob([JSON.stringify(this.summaryData, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${this.currentDocument.name}_summary.json`;
        link.click();
    }

    shareSummary() {
        if (!this.currentDocument) return;
        if (navigator.share) {
            navigator.share({
                title: "AI PDF Summary",
                text: `Summary of ${this.currentDocument.name}`,
                url: window.location.href
            });
        } else {
            this.showMessage("Sharing not supported in this browser.", "error");
        }
    }

    /* ========= Utils ========= */
    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    formatDate(date) {
        try {
            return new Date(date).toLocaleString();
        } catch {
            return "";
        }
    }

    loadHistory() {
        try {
            return JSON.parse(localStorage.getItem("summaryHistory") || "[]");
        } catch {
            return [];
        }
    }

    showMessage(message, type = "info") {
        // Simple alert for now — you can wire to a toast UI
        alert(`${type.toUpperCase()}: ${message}`);
    }

    escapeHtml(str = "") {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

/* ========= Global init ========= */
let aiManager;
document.addEventListener("DOMContentLoaded", () => {
    // Quick guard if user isn’t logged in
    const token = localStorage.getItem("token");
    if (!token) {
        alert("Please log in to use AI summarization.");
        window.location.href = "/login.html";
        return;
    }

    aiManager = new AISummarizerManager();

    // expose for inline handlers if any
    window.downloadSummary = () => aiManager.downloadSummary();
    window.shareSummary = () => aiManager.shareSummary();
    window.startNew = () => location.reload();
});
