
class ClassroomManager {
    constructor() {
        this.recentClassrooms = [];
        this.currentClassroom = null;
        this.resources = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.fetchClassrooms();
        
        // Tab switching
        document.querySelectorAll('.classroom-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchClassroomTab(tabName);
            });
        });
    }

    bindEvents() {
        // Create Classroom Form
        const createForm = document.getElementById('createForm');
        if (createForm) {
            createForm.addEventListener('submit', (e) => this.handleCreateClassroom(e));
        }

        // Join Classroom Form
        const joinForm = document.getElementById('joinForm');
        if (joinForm) {
            joinForm.addEventListener('submit', (e) => this.handleJoinClassroom(e));
        }

        // Resource Upload Form
        const resourceUploadForm = document.getElementById('resourceUploadForm');
        if (resourceUploadForm) {
            resourceUploadForm.addEventListener('submit', (e) => this.handleResourceUpload(e));
        }

        // File Upload Area Interactions
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('resourceFile');

        if (uploadArea && fileInput) {
            // Click to upload
            uploadArea.addEventListener('click', () => {
                fileInput.click();
            });

            // Drag and drop
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.classList.add('dragover');
            });

            uploadArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.classList.remove('dragover');
                
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    fileInput.files = files;
                    this.updateFileDisplay(files);
                }
            });

            // File input change
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.updateFileDisplay(e.target.files);
                }
            });
        }
    }

    updateFileDisplay(files) {
        const uploadContent = document.querySelector('.upload-content');
        if (!uploadContent) return;
        
        const fileList = Array.from(files).map(file => file.name).join(', ');
        const fileInput = document.getElementById('resourceFile');
        
        // Clear content but keep input
        uploadContent.innerHTML = `
            <div class="upload-icon">📁</div>
            <h4>Files Selected</h4>
            <p>${fileList}</p>
        `;
        
        // Re-append input if it was lost
        if (fileInput) {
             uploadContent.appendChild(fileInput);
        }
    }

    async handleCreateClassroom(e) {
        e.preventDefault();

        const className = document.getElementById("className").value.trim();
        const classSubject = document.getElementById("classSubject").value.trim();

        if (!className || !classSubject) {
            this.showMessage("Please fill in all fields", "error");
            return;
        }

        const token = localStorage.getItem("token");
        if (!token) {
            this.showMessage("Please log in first", "error");
            return;
        }

        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loading-spinner"></div>Creating...';
        submitBtn.disabled = true;

        try {
            const response = await fetch("http://localhost:5002/api/classrooms/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: className,
                    subject: classSubject,
                }),
            });

            const data = await response.json();
            
            if (response.ok) {
                this.showMessage("Classroom created successfully!", "success");
                document.getElementById("createForm").reset();
                
                // Refresh the list from the server
                this.fetchClassrooms();
            } else {
                this.showMessage(data.message || "Error creating classroom", "error");
            }
        } catch (err) {
            console.error("Create classroom error:", err);
            this.showMessage("Server error. Please try again later.", "error");
        } finally {
            // Reset button state
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    async handleJoinClassroom(e) {
        e.preventDefault();

        const joinCode = document.getElementById("joinCode").value.trim();

        if (!joinCode) {
            this.showMessage("Please enter a classroom code", "error");
            return;
        }

        const token = localStorage.getItem("token");
        if (!token) {
            this.showMessage("Please log in first", "error");
            return;
        }

        // Show loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loading-spinner"></div>Joining...';
        submitBtn.disabled = true;

        try {
            const response = await fetch("http://localhost:5002/api/classrooms/join", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    code: joinCode,
                }),
            });

            const data = await response.json();
            
            if (response.ok) {
                this.showMessage("Joined classroom successfully!", "success");
                document.getElementById("joinForm").reset();
                
                // Refresh the list from the server
                this.fetchClassrooms();
            } else {
                this.showMessage(data.message || "Error joining classroom", "error");
            }
        } catch (err) {
            console.error("Join classroom error:", err);
            this.showMessage("Server error. Please try again later.", "error");
        } finally {
            // Reset button state
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    async fetchClassrooms() {
        const token = localStorage.getItem("token");
        if (!token) return;

        try {
            const response = await fetch("http://localhost:5002/api/classrooms/my", {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            const data = await response.json();

            if (response.ok) {
                this.recentClassrooms = data.classrooms || [];
                this.renderRecentClassrooms();
            } else {
                console.error("Failed to fetch classrooms:", data.message);
            }
        } catch (err) {
            console.error("Error fetching classrooms:", err);
        }
    }

    async handleResourceUpload(e) {
        e.preventDefault();
        const fileInput = document.getElementById('resourceFile');
        const title = document.getElementById('resourceTitle').value.trim();
        const description = document.getElementById('resourceDescription').value.trim();

        if (!fileInput.files.length || !title) {
            this.showMessage('Please select files and enter a title', 'error');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            this.showMessage('Please log in first', 'error');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<div class="loading-spinner"></div>Uploading...';
        submitBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]); 
            formData.append('title', title);
            formData.append('description', description);

            const classroomId = this.currentClassroom._id || this.currentClassroom.id;

            const response = await fetch(`http://localhost:5002/api/classrooms/${classroomId}/resources`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                this.showMessage('Resource uploaded successfully!', 'success');
                document.getElementById('resourceUploadForm').reset();
                this.resetUploadArea();
                this.fetchResources(classroomId); // Refresh list
            } else {
                this.showMessage(data.message || 'Error uploading resource', 'error');
            }
        } catch (err) {
            console.error('Upload error:', err);
            this.showMessage('Error uploading resource', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }

    resetUploadArea() {
        const uploadContent = document.querySelector('.upload-content');
        if (!uploadContent) return;
        
        uploadContent.innerHTML = `
            <div class="upload-icon">📁</div>
            <h4>Drop files here or click to browse</h4>
            <p>Supported formats: PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, TXT</p>
        `;
        // We need to recreate the input since we might have wiped it or it needs reset
        const oldInput = document.getElementById('resourceFile');
        if (oldInput) oldInput.remove(); // Remove old if exists
        
        const newInput = document.createElement('input');
        newInput.type = 'file';
        newInput.id = 'resourceFile';
        newInput.multiple = true;
        newInput.accept = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt';
        newInput.style.display = 'none';
        
        // Re-bind event
        newInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.updateFileDisplay(e.target.files);
            }
        });
        
        uploadContent.appendChild(newInput);
    }

    async fetchResources(classroomId) {
        const token = localStorage.getItem('token');
        if (!token) return;

        try {
            const response = await fetch(`http://localhost:5002/api/classrooms/${classroomId}/resources`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();

            if (response.ok) {
                this.resources = data.resources || [];
                this.renderResources();
            } else {
                console.error('Failed to fetch resources:', data.message);
            }
        } catch (err) {
            console.error('Error fetching resources:', err);
        }
    }

    renderResources() {
        const grid = document.getElementById('resourcesGrid');
        if (!grid) return;
        
        if (this.resources.length === 0) {
            grid.innerHTML = `
                <div class="empty-resources">
                    <div class="empty-icon">📁</div>
                    <div>No resources uploaded yet</div>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.resources.map(resource => `
            <div class="resource-item" onclick="classroomManager.openFileViewer('${resource._id}')">
                <div class="resource-header">
                    <div class="resource-icon">${this.getFileIcon(resource.fileType || this.getFileType(resource.filename))}</div>
                    <div class="resource-info">
                        <div class="resource-title">${resource.title}</div>
                        <div class="resource-meta">
                            ${this.formatFileSize(resource.fileSize || 0)} • ${this.formatDate(resource.createdAt || resource.uploadDate)}
                        </div>
                    </div>
                </div>
                ${resource.description ? `<div class="resource-description">${resource.description}</div>` : ''}
                <div class="resource-actions">
                    <button class="resource-btn primary" onclick="event.stopPropagation(); classroomManager.openFileViewer('${resource._id}')">
                        👁️ Preview
                    </button>
                    ${resource.fileUrl ? `
                    <a href="${resource.fileUrl}" target="_blank" class="resource-btn" onclick="event.stopPropagation()">
                        📥 Download
                    </a>` : ''}
                    <button class="resource-btn" onclick="event.stopPropagation(); deleteResource('${resource._id}')">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    openFileViewer(resourceId) {
        const resource = this.resources.find(r => r._id === resourceId);
        if (!resource) return;

        const modal = document.getElementById('chatViewerModal');
        const titleEl = document.getElementById('chatViewerTitle');
        const metaEl = document.getElementById('chatViewerMeta');
        const bodyEl = document.getElementById('chatViewerBody');
        const loadingEl = document.getElementById('chatViewerLoading');
        const errorEl = document.getElementById('chatViewerError');

        if (!modal || !bodyEl) return;

        // Reset state
        bodyEl.innerHTML = '';
        loadingEl.style.display = 'flex';
        errorEl.style.display = 'none';
        modal.classList.add('active');

        // Set header info
        titleEl.textContent = resource.title;
        metaEl.textContent = `${this.formatFileSize(resource.fileSize)} • ${this.formatDate(resource.createdAt)}`;

        // Determine file type and render
        const fileType = resource.fileType || this.getFileType(resource.filename);
        const fileUrl = resource.fileUrl;

        if (fileType.startsWith('image/')) {
            this.renderImage(fileUrl, bodyEl, loadingEl);
        } else if (fileType === 'application/pdf') {
            this.renderPDF(fileUrl, bodyEl, loadingEl, errorEl);
        } else {
            // Fallback for other types
            loadingEl.style.display = 'none';
            bodyEl.innerHTML = `
                <div class="figma-text-viewer">
                    <h3>Cannot preview this file type</h3>
                    <p>This file type (${fileType}) cannot be previewed directly.</p>
                    <a href="${fileUrl}" target="_blank" class="btn-primary" style="display: inline-block; margin-top: 10px;">Download File</a>
                </div>
            `;
        }

        // Bind close button
        const closeBtn = document.getElementById('chatViewerClose');
        if (closeBtn) {
            closeBtn.onclick = () => {
                modal.classList.remove('active');
                bodyEl.innerHTML = ''; // Clear content
            };
        }
    }

    renderImage(url, container, loadingEl) {
        const img = document.createElement('img');
        img.src = url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';
        img.style.objectFit = 'contain';
        img.onload = () => {
            loadingEl.style.display = 'none';
        };
        img.onerror = () => {
            loadingEl.style.display = 'none';
            container.innerHTML = '<div class="error-state">Failed to load image</div>';
        };
        
        const wrapper = document.createElement('div');
        wrapper.className = 'figma-image-viewer';
        wrapper.appendChild(img);
        container.appendChild(wrapper);
    }

    async renderPDF(url, container, loadingEl, errorEl) {
        try {
            // Ensure PDF.js is loaded
            if (!window.pdfjsLib) {
                throw new Error('PDF.js library not loaded');
            }

            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

            const loadingTask = pdfjsLib.getDocument(url);
            const pdf = await loadingTask.promise;
            
            loadingEl.style.display = 'none';
            
            const viewer = document.createElement('div');
            viewer.className = 'figma-pdf-viewer';
            container.appendChild(viewer);

            // Render all pages
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const scale = 1.5;
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-page-canvas';
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport
                };
                
                viewer.appendChild(canvas);
                await page.render(renderContext).promise;
            }

        } catch (error) {
            console.error('Error rendering PDF:', error);
            loadingEl.style.display = 'none';
            errorEl.style.display = 'flex';
            document.getElementById('chatErrorMessage').textContent = 'Failed to load PDF. ' + error.message;
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getFileIcon(fileType) {
        const icons = {
            'application/pdf': '📄',
            'application/msword': '📝',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
            'application/vnd.ms-powerpoint': '📊',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
            'application/vnd.ms-excel': '📈',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📈',
            'text/plain': '📄'
        };
        return icons[fileType] || '📁';
    }
    
    getFileType(fileName) {
        if (!fileName) return 'application/octet-stream';
        const extension = fileName.split('.').pop().toLowerCase();
        const types = {
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            txt: 'text/plain',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp'
        };
        return types[extension] || 'application/octet-stream';
    }

    switchClassroomTab(tabName) {
        // Remove active class from all tabs and panels
        document.querySelectorAll('.classroom-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

        // Add active class to clicked tab and corresponding panel
        const tab = document.querySelector(`[data-tab="${tabName}"]`);
        const panel = document.getElementById(tabName);
        
        if (tab) tab.classList.add('active');
        if (panel) panel.classList.add('active');

        // Load content based on tab
        if (tabName === 'resources') {
            if (this.currentClassroom) {
                this.fetchResources(this.currentClassroom._id || this.currentClassroom.id);
            }
        } else if (tabName === 'members') {
            this.renderMembers();
        }
    }

    async renderMembers() {
        const membersList = document.getElementById('membersList');
        if (!membersList) return;
        
        if (!this.currentClassroom || (!this.currentClassroom.id && !this.currentClassroom._id)) {
            membersList.innerHTML = '<div class="loading-state">No classroom selected</div>';
            return;
        }

        // Show loading state
        membersList.innerHTML = '<div class="loading-state">Loading members...</div>';

        try {
            await this.loadClassroomMembers();
        } catch (error) {
            console.error('Error loading members:', error);
            membersList.innerHTML = '<div class="error-state">Failed to load members</div>';
        }
    }

    async loadClassroomMembers() {
        const token = localStorage.getItem('token');
        if (!token) {
            this.showMessage('Please log in to view members', 'error');
            return;
        }

        const classroomId = this.currentClassroom._id || this.currentClassroom.id;

        try {
            const response = await fetch(`http://localhost:5002/api/classrooms/${classroomId}/members`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load members');
            }

            const data = await response.json();
            this.currentClassroom.members = data.members || [];
            
            // Get current user info
            const currentUser = this.getCurrentUserId();
            const currentUserMember = this.currentClassroom.members.find(m => m._id === currentUser);
            const isCurrentUserAdmin = currentUserMember ? currentUserMember.role === 'admin' : false;
            
            this.displayMembers(isCurrentUserAdmin);
            
        } catch (error) {
            console.error('Error loading members:', error);
            this.showMessage('Failed to load classroom members', 'error');
        }
    }

    displayMembers(isCurrentUserAdmin) {
        const membersList = document.getElementById('membersList');
        if (!membersList) return;
        
        const members = this.currentClassroom.members || [];
        
        if (members.length === 0) {
            membersList.innerHTML = '<div class="loading-state">No members found</div>';
            return;
        }

        membersList.innerHTML = members.map(member => {
            const initials = this.getUserInitials(member.name);
            let roleDisplay = 'User';
            if (member.role === 'admin') roleDisplay = 'Admin';
            else if (member.role === 'sub-admin') roleDisplay = 'Sub-Admin';
            
            const joinTime = member.isCreator ? 'Creator' : this.formatJoinTime(member.joinedAt);
            const adminControls = this.createAdminControls(member, isCurrentUserAdmin);
            
            return `
                <div class="member-item ${member.role === 'admin' ? 'admin' : ''}">
                    <div class="member-avatar">
                        <div class="avatar-circle">${initials}</div>
                    </div>
                    <div class="member-info">
                        <div class="member-name">${member.name}</div>
                        <div class="member-details">
                            <span class="role-badge ${member.role}">${roleDisplay}</span>
                            <span class="join-time">${joinTime}</span>
                        </div>
                    </div>
                    ${adminControls}
                </div>
            `;
        }).join('');
    }

    getCurrentUserId() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.id;
        } catch (error) {
            console.error('Error parsing token:', error);
            return null;
        }
    }

    getUserInitials(name) {
        if (!name) return '??';
        const names = name.split(' ');
        if (names.length >= 2) {
            return (names[0][0] + names[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    formatJoinTime(joinedAt) {
        if (!joinedAt) return 'Unknown';
        
        const joinDate = new Date(joinedAt);
        const now = new Date();
        const diffTime = Math.abs(now - joinDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 1) {
            return joinDate.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
            });
        } else {
            return `${diffDays} days ago`;
        }
    }

    createAdminControls(member, isCurrentUserAdmin) {
        if (!isCurrentUserAdmin || member.isCreator) {
            return '';
        }
        
        const currentUser = this.getCurrentUserId();
        if (member._id === currentUser) {
            return '';
        }
        
        let controls = '<div class="member-controls">';
        
        if (member.role === 'user') {
            controls += `<button class="control-btn promote" onclick="classroomManager.promoteUser('${member._id}')" title="Promote to Sub-Admin"><i class="fas fa-arrow-up"></i></button>`;
        } else if (member.role === 'sub-admin') {
            controls += `<button class="control-btn demote" onclick="classroomManager.demoteUser('${member._id}')" title="Demote to User"><i class="fas fa-arrow-down"></i></button>`;
        }
        
        controls += `<button class="control-btn remove" onclick="classroomManager.removeUser('${member._id}')" title="Remove User"><i class="fas fa-times"></i></button>`;
        controls += '</div>';
        return controls;
    }

    async promoteUser(userId) {
        if (!confirm('Are you sure you want to promote this user to Sub-Admin?')) return;
        
        const token = localStorage.getItem('token');
        const classroomId = this.currentClassroom._id || this.currentClassroom.id;
        
        try {
            const response = await fetch(`http://localhost:5002/api/classrooms/${classroomId}/members/${userId}/promote`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (response.ok) {
                this.showMessage('User promoted successfully', 'success');
                this.loadClassroomMembers();
            } else {
                this.showMessage(data.message || 'Error promoting user', 'error');
            }
        } catch (err) {
            console.error('Promote error:', err);
            this.showMessage('Error promoting user', 'error');
        }
    }

    async demoteUser(userId) {
        if (!confirm('Are you sure you want to demote this user?')) return;
        
        const token = localStorage.getItem('token');
        const classroomId = this.currentClassroom._id || this.currentClassroom.id;
        
        try {
            const response = await fetch(`http://localhost:5002/api/classrooms/${classroomId}/members/${userId}/demote`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (response.ok) {
                this.showMessage('User demoted successfully', 'success');
                this.loadClassroomMembers();
            } else {
                this.showMessage(data.message || 'Error demoting user', 'error');
            }
        } catch (err) {
            console.error('Demote error:', err);
            this.showMessage('Error demoting user', 'error');
        }
    }

    async removeUser(userId) {
        if (!confirm('Are you sure you want to remove this user from the classroom?')) return;
        
        const token = localStorage.getItem('token');
        const classroomId = this.currentClassroom._id || this.currentClassroom.id;
        
        try {
            const response = await fetch(`http://localhost:5002/api/classrooms/${classroomId}/members/${userId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (response.ok) {
                this.showMessage('User removed successfully', 'success');
                this.loadClassroomMembers();
            } else {
                this.showMessage(data.message || 'Error removing user', 'error');
            }
        } catch (err) {
            console.error('Remove error:', err);
            this.showMessage('Error removing user', 'error');
        }
    }

    renderRecentClassrooms() {
        const container = document.getElementById('recentClassrooms');
        if (!container) return;

        if (this.recentClassrooms.length === 0) {
            container.innerHTML = `
                <div class="loading-state">
                    <span>No recent classrooms</span>
                </div>
            `;
            return;
        }

        container.innerHTML = this.recentClassrooms.map(classroom => `
            <div class="recent-classroom-item" onclick="openClassroomView('${classroom._id}')">
                <div class="recent-classroom-header">
                    <div class="recent-classroom-icon">${classroom.role === 'admin' ? '👨‍🏫' : '👨‍🎓'}</div>
                    <div class="recent-classroom-name">${classroom.name}</div>
                    <button class="delete-classroom" onclick="deleteClassroom('${classroom._id}'); event.stopPropagation();">✖</button>
                </div>
                <div class="recent-classroom-subject">${classroom.subject}</div>
                <div class="recent-classroom-meta">
                    <span>Role: ${classroom.role === 'admin' ? 'Teacher' : (classroom.role === 'sub-admin' ? 'Sub-Admin' : 'Student')}</span>
                    <span>${classroom.code ? 'Code: ' + classroom.code : ''}</span>
                </div>
            </div>
        `).join('');
    }

    async deleteClassroom(classroomId) {
        if (!confirm('Are you sure you want to delete this classroom?')) return;

        const token = localStorage.getItem('token');
        if (!token) {
            this.showMessage('Please log in first', 'error');
            return;
        }

        try {
            const response = await fetch(`http://localhost:5002/api/classrooms/${classroomId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to delete classroom');

            this.showMessage('Classroom deleted successfully!', 'success');
            this.fetchClassrooms();
        } catch (err) {
            console.error('Delete classroom error:', err);
            this.showMessage(err.message || 'Error deleting classroom', 'error');
        }
    }

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    showMessage(message, type) {
        const messageEl = document.createElement('div');
        messageEl.className = `message ${type}`;
        messageEl.textContent = message;
        
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            info: '#2196F3'
        };
        
        messageEl.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1001;
            animation: slideIn 0.3s ease-out;
            background: ${colors[type] || '#666'};
        `;

        document.body.appendChild(messageEl);

        setTimeout(() => {
            messageEl.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                messageEl.remove();
            }, 300);
        }, 3000);
    }

    openClassroomView(classroomId) {
        const classroom = this.recentClassrooms.find(c => String(c._id) === String(classroomId));
        if (classroom) {
            this.currentClassroom = classroom;
            
            const titleEl = document.getElementById('classroomTitle');
            if (titleEl) titleEl.textContent = classroom.name;
            
            const subjectEl = document.getElementById('classroomSubject');
            if (subjectEl) subjectEl.textContent = classroom.subject || '-';
            
            const codeEl = document.getElementById('classroomCode');
            if (codeEl) codeEl.textContent = classroom.code || '-';
            
            const memberCountEl = document.getElementById('classroomMemberCount');
            if (memberCountEl) {
                const memberCount = classroom.membersCount || (classroom.members ? classroom.members.length : 0);
                memberCountEl.textContent = `${memberCount} members`;
            }
            
            const roleEl = document.getElementById('classroomRole');
            if (roleEl) roleEl.textContent = classroom.role;
            
            const modal = document.getElementById('classroomViewModal');
            if (modal) modal.classList.add('active');
            
            this.switchClassroomTab('overview');
        }
    }

    closeClassroomView() {
        const modal = document.getElementById('classroomViewModal');
        if (modal) modal.classList.remove('active');
        this.currentClassroom = null;
    }
}

// Global functions for HTML onclick handlers
function openClassroomView(classroomId) {
    if (classroomManager) {
        classroomManager.openClassroomView(classroomId);
    }
}

function closeClassroomView() {
    if (classroomManager) {
        classroomManager.closeClassroomView();
    }
}

function deleteClassroom(classroomId) {
    if (classroomManager) {
        classroomManager.deleteClassroom(classroomId);
    }
}

function deleteResource(resourceId) {
    if (!classroomManager) return;
    
    if (confirm('Are you sure you want to delete this resource?')) {
        const token = localStorage.getItem('token');
        const classroomId = classroomManager.currentClassroom._id || classroomManager.currentClassroom.id;
        
        fetch(`http://localhost:5002/api/classrooms/${classroomId}/resources/${resourceId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.message === 'Resource deleted successfully') {
                classroomManager.fetchResources(classroomId);
                classroomManager.showMessage('Resource deleted successfully!', 'success');
            } else {
                classroomManager.showMessage(data.message || 'Error deleting resource', 'error');
            }
        })
        .catch(err => {
            console.error('Delete error:', err);
            classroomManager.showMessage('Error deleting resource', 'error');
        });
    }
}

// Initialize classroom manager
let classroomManager;
document.addEventListener('DOMContentLoaded', () => {
    classroomManager = new ClassroomManager();
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        closeClassroomView();
    }
});

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);