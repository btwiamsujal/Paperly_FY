// Paparly Chatbox - Real Implementation
class ChatboxManager {
    constructor() {
        this.socket = null;
        this.currentChat = null;
        this.currentUser = null;
        this.conversations = [];
        this.onlineUsers = new Map();
        this.searchTimeout = null;
        this.typingTimeout = null;
        this.isTyping = false;
        
        // State for tabs
        this.activeTab = 'chats'; // 'chats' or 'requests'
        this.chats = [];
        this.requests = [];
        
        // API Base URL
        this.API_BASE = 'http://localhost:5002/api';
        this.AUTH_URL = 'http://localhost:5002/frontend/auth/auth.html';
        
        this.init();
    }

    detectMessageType(mimeType) {
        if (!mimeType) return 'document';
        if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return 'media';
        if (mimeType.startsWith('audio/')) return 'voice';
        return 'document';
    }

    async init() {
        // Check authentication
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = this.AUTH_URL;
            return;
        }

        try {
            // Initialize socket connection
            await this.initializeSocket(token);
            
            // Load current user info
            await this.loadCurrentUser();
            
            // Initialize UI event listeners
            this.initEventListeners();
            
            // Load conversations
            await this.loadConversations();
            
            // Show welcome message
            this.showWelcomeMessage();

        } catch (error) {
            console.error('Failed to initialize chat:', error);
            this.showError('Failed to connect to chat server');
        }
    }

    initializeSocket(token) {
        return new Promise((resolve, reject) => {
            this.socket = io('http://localhost:5002', {
                auth: { token }
            });

            this.socket.on('connect', () => {
                console.log('✅ Connected to chat server');
                this.setupSocketEventListeners();
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('❌ Socket connection error:', error);
                if (error.message.includes('Authentication error')) {
                    localStorage.removeItem('token');
                    window.location.href = this.AUTH_URL;
                }
                reject(error);
            });
        });
    }

    setupSocketEventListeners() {
        // New message received
        this.socket.on('newMessage', (data) => {
            this.handleNewMessage(data.message);
            this.loadConversations();
        });


        // Typing indicators
        this.socket.on('startTyping', (data) => {
            if (this.currentChat && data.userId === this.currentChat.user._id) {
                this.showTypingIndicator(data.user.name);
            }
        });

        this.socket.on('stopTyping', () => {
            this.hideTypingIndicator();
        });

        // User presence updates
        this.socket.on('userOnline', (data) => {
            this.onlineUsers.set(data.userId, data.user);
            this.updateUserStatus(data.userId, 'online');
        });

        this.socket.on('userOffline', (data) => {
            this.onlineUsers.delete(data.userId);
            this.updateUserStatus(data.userId, 'offline');
        });

        this.socket.on('onlineUsers', (users) => {
            this.onlineUsers.clear();
            users.forEach(user => {
                this.onlineUsers.set(user.id, user);
            });
        });

        // Message status updates
        this.socket.on('messageDelivered', (data) => {
            this.updateMessageStatus(data.messageId, 'delivered');
        });

        this.socket.on('messagesSeen', (data) => {
            // Update all messages in the conversation to 'seen'
            if (this.currentChat && data.conversationId) {
                this.updateConversationMessagesStatus('seen');
            }
            // Reload conversations to update unread counts
            this.loadConversations();
        });
    }

    async loadCurrentUser() {
        try {
            const response = await this.apiCall('/users/me', 'GET');
            if (response.success && response.data) {
                this.currentUser = response.data;
                return;
            }
            throw new Error('Unable to load current user');
        } catch (error) {
            console.error('Failed to load current user:', error);
            this.showError('Authentication required. Redirecting to login...');
            localStorage.removeItem('token');
            window.location.href = this.AUTH_URL;
        }
    }

    initEventListeners() {
        // Tab switching
        const tabs = document.querySelectorAll('.chat-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active state
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Switch tab
                this.activeTab = tab.dataset.tab;
                this.renderChatList();
            });
        });

        // Search functionality
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            userSearch.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                if (query.length > 0) {
                    this.debounceUserSearch(query);
                } else {
                    this.clearUserSearch();
                }
            });
        }

        // Chat search
        const chatSearch = document.getElementById('chatSearch');
        if (chatSearch) {
            chatSearch.addEventListener('input', (e) => {
                this.searchChats(e.target.value);
            });
        }

        // Message input functionality
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                } else {
                    this.handleTypingIndicator();
                }
            });

            messageInput.addEventListener('input', () => {
                this.handleTypingIndicator();
            });
        }

        // Send button
        const sendButton = document.getElementById('sendButton');
        if (sendButton) {
            sendButton.addEventListener('click', () => this.sendMessage());
        }

        // Attachment button and file input
        const attachBtn = document.getElementById('attachBtn');
        const fileInput = document.getElementById('fileInput');
        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file || !this.currentChat) return;
                try {
                    await this.sendAttachment(file);
                } finally {
                    // Reset the file input so selecting the same file again works
                    e.target.value = '';
                }
            });
        }
    }

    debounceUserSearch(query) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.searchUsers(query);
        }, 300);
    }

    async searchUsers(query) {
        try {
            const response = await this.apiCall(`/users/search?q=${encodeURIComponent(query)}`, 'GET');
            
            if (response.success) {
                this.displaySearchResults(response.data);
            } else {
                this.displaySearchResults([]);
            }
        } catch (error) {
            console.error('Search failed:', error);
            this.displaySearchResults([]);
        }
    }

    displaySearchResults(users) {
        const usersList = document.getElementById('usersList');
        if (!usersList) return;
        
        if (users.length === 0) {
            usersList.innerHTML = '<div class="no-results">No users found</div>';
        } else {
            usersList.innerHTML = users.map(user => `
                <div class="user-item" data-user-id="${user._id}" onclick="chatboxManager.startNewChat('${user._id}', '${user.name}', '${user.avatar || ''}')">
                    <div class="user-avatar" style="background: #007bff; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                        ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">` : user.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="user-info" style="margin-left: 12px;">
                        <div class="user-name" style="font-weight: 600; color: #333;">${user.name}</div>
                        <div class="user-email" style="font-size: 0.9em; color: #666;">${user.email}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    clearUserSearch() {
        const usersList = document.getElementById('usersList');
        if (usersList) {
            usersList.innerHTML = '';
        }
    }

    async startNewChat(userId, userName, userAvatar) {
        const user = {
            _id: userId,
            name: userName,
            avatar: userAvatar
        };

        await this.openChatWithUser(user);
        this.closeNewChatModal();
    }

    async openChatWithUser(user) {
        this.currentChat = { user };

        // Mark active chat in sidebar
        this.setActiveChatItem(user._id);

        // Update chat header
        this.updateChatHeader(user);

        // Join conversation room
        this.socket.emit('joinConversation', { otherUserId: user._id });

        // Mark messages as seen (clears unread badge)
        await this.markMessagesAsSeen(user._id);

        // Load messages
        await this.loadMessages(user._id);
        
        // Reload conversations to update unread badge
        await this.loadConversations();
    }

    updateChatHeader(user) {
        const header = document.getElementById('chatHeader');
        const isOnline = this.onlineUsers.has(user._id);
        
        // Check if this is a request
        const isRequest = this.requests.some(req => req.user._id === user._id);
        const inputArea = document.querySelector('.chat-input-area');

        header.innerHTML = `
            <div class="chat-header-avatar">
                ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : user.name.charAt(0).toUpperCase()}
            </div>
            <div class="chat-header-info">
                <div class="chat-header-name">${user.name}</div>
                <div class="chat-header-status" style="color: ${isOnline ? '#28a745' : '#666'};">${isOnline ? 'Online' : 'Last seen recently'}</div>
            </div>
        `;

        // Handle Request UI
        if (isRequest) {
            if (inputArea) inputArea.style.display = 'none';
            
            // Add request banner to header or messages area
            // We'll add it to the messages container as a sticky header or just append it
            const requestBanner = document.createElement('div');
            requestBanner.className = 'request-banner';
            requestBanner.innerHTML = `
                <div style="padding: 15px; background: #f8f9fa; border-bottom: 1px solid #eee; text-align: center;">
                    <p style="margin-bottom: 10px; color: #666;">${user.name} wants to send you a message.</p>
                    <div style="display: flex; justify-content: center; gap: 10px;">
                        <button class="accept-btn" onclick="chatboxManager.acceptRequest('${this.requests.find(r => r.user._id === user._id).id}')" style="width: auto; padding: 8px 20px; border-radius: 20px;">Accept</button>
                        <button class="decline-btn" onclick="chatboxManager.declineRequest('${this.requests.find(r => r.user._id === user._id).id}')" style="width: auto; padding: 8px 20px; border-radius: 20px;">Decline</button>
                    </div>
                </div>
            `;
            
            // We need to insert this after the header or inside the message area
            // Let's put it in the message area but clear it first
            const messagesContainer = document.getElementById('chatMessages');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
                messagesContainer.appendChild(requestBanner);
                
                // Add a container for messages below the banner
                const msgList = document.createElement('div');
                msgList.id = 'actualMessages';
                messagesContainer.appendChild(msgList);
            }
        } else {
            if (inputArea) inputArea.style.display = 'block';
            
            // Show loading state in messages area while fetching
            const messagesContainer = document.getElementById('chatMessages');
            if (messagesContainer) {
                messagesContainer.innerHTML = `
                    <div style="text-align: center; color: #666;">
                        <div style="margin-bottom: 10px;">💬</div>
                        Loading messages...
                    </div>
                `;
            }
        }
    }

    async loadMessages(userId) {
        try {
            const response = await this.apiCall(`/messages/${userId}?limit=50`, 'GET');
            
            if (response.success && response.data && Array.isArray(response.data.messages)) {
                this.displayMessages(response.data.messages);
            } else {
                this.displayMessages([]);
            }
        } catch (error) {
            console.error('Failed to load messages:', error);
            this.displayMessages([]);
        }
    }

    displayMessages(messages) {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #666;">
                    <div style="font-size: 2em; margin-bottom: 10px;">💬</div>
                    <p>No messages yet. Start the conversation!</p>
                </div>
            `;
            return;
        }

        // Delegate click for file open
        messagesContainer.onclick = (e) => {
            const fileEl = e.target.closest('.message-file');
            if (!fileEl) return;
            const { fileUrl, fileName, mimeType, type, messageId } = fileEl.dataset;
            console.log('File click data:', { fileUrl, fileName, mimeType, type, messageId }); // Debug log
            this.openFileViewer({ fileUrl, fileName, mimeType, messageType: type, messageId });
        };

        messagesContainer.innerHTML = messages.map(message => {
            const isOwn = message.senderId._id === this.currentUser._id;
            const time = this.formatMessageTime(message.createdAt);

            let inner = '';
            const statusIcon = isOwn ? this.getStatusIcon(message.status) : '';
            if (message.messageType === 'text') {
                inner = `
                    <div class="message-content">
                        <div class="message-text">${this.escapeHtml(message.content)}</div>
                        <div class="message-time">${time} ${statusIcon}</div>
                    </div>`;
            } else if (message.messageType === 'document') {
                const fileName = message.fileName || 'Document';
            inner = `
                    <div class="message-content">
                        <div class="message-file" data-file-url="${message.fileUrl}" data-file-name="${this.escapeHtml(fileName)}" data-mime-type="${message.mimeType || ''}" data-type="document" data-message-id="${message._id}">
                            <div class="file-icon">📄</div>
                            <div class="message-file-info">
                                <div class="message-file-name">${this.escapeHtml(fileName)}</div>
                                ${message.fileSize ? `<div class="message-file-size">${(message.fileSize/1024/1024).toFixed(2)} MB</div>` : ''}
                            </div>
                        </div>
                        <div class="message-time">${time} ${statusIcon}</div>
                    </div>`;
            } else if (message.messageType === 'media') {
                const isImage = (message.mimeType || '').startsWith('image/');
                const fileName = message.fileName || (isImage ? 'Image' : 'Video');
                inner = `
                    <div class="message-content">
                        <div class="message-file media-file" data-file-url="${message.fileUrl}" data-file-name="${this.escapeHtml(fileName)}" data-mime-type="${message.mimeType || ''}" data-type="media" data-message-id="${message._id}" style="cursor: pointer;">
                            ${isImage ? `<img src="${message.fileUrl}" alt="media" style="max-width: 260px; border-radius: 10px; display:block;">` : `<video src="${message.fileUrl}" controls style="max-width: 260px; border-radius: 10px; display:block;"></video>`}
                        </div>
                        <div class="message-time">${time} ${statusIcon}</div>
                    </div>`;
            } else if (message.messageType === 'voice') {
                inner = `
                    <div class="message-content">
                        <audio controls src="${message.fileUrl}"></audio>
                        <div class="message-time">${time} ${statusIcon}</div>
                    </div>`;
            }

            return `
                <div class="message ${isOwn ? 'own' : ''}">${inner}</div>
            `;
        }).join('');

        this.scrollToBottom();
    }

    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const content = messageInput.value.trim();
        
        if (!content || !this.currentChat) return;

        try {
            const formData = new FormData();
            formData.append('receiverId', this.currentChat.user._id);
            formData.append('messageType', 'text');
            formData.append('content', content);

            const response = await this.apiCall('/messages/send', 'POST', formData);

            if (response.success) {
                // Clear input
                messageInput.value = '';

                // Add message to UI immediately
                this.addMessageToUI({
                    _id: response.data._id,
                    senderId: { _id: this.currentUser._id, name: this.currentUser.name },
                    messageType: 'text',
                    content: content,
                    status: 'sent',
                    createdAt: new Date().toISOString()
                });

                // Stop typing indicator
                this.stopTyping();
                
                // Update conversations list
                this.loadConversations();
            }
        } catch (error) {
            console.error('Failed to send message:', error);
            this.showError('Failed to send message');
        }
    }

    async sendAttachment(file) {
        if (!this.currentChat) return;
        
        const messageType = this.detectMessageType(file.type);
        
        // 1. Create optimistic message with temporary ID
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const filePreviewUrl = URL.createObjectURL(file);
        
        const optimisticMessage = {
            _id: tempId,
            content: '',
            messageType: messageType,
            fileUrl: filePreviewUrl,
            fileName: file.name,
            mimeType: file.type,
            senderId: { _id: this.currentUser._id, name: this.currentUser.name },
            receiverId: this.currentChat.user._id,
            createdAt: new Date().toISOString(),
            uploading: true,
            uploadProgress: 0,
            tempFile: true
        };
        
        // 2. Display message immediately
        this.addMessageToUI(optimisticMessage);
        
        // 3. Prepare form data
        const formData = new FormData();
        formData.append('receiverId', this.currentChat.user._id);
        formData.append('messageType', messageType);
        formData.append('file', file);
        
        try {
            // 4. Upload with progress tracking
            const response = await this.uploadWithProgress(formData, tempId);
            
            if (response.success) {
                // 5. Replace optimistic message with real message
                this.replaceOptimisticMessage(tempId, response.data);
                URL.revokeObjectURL(filePreviewUrl);
                this.loadConversations();
            } else {
                throw new Error(response.message || 'Upload failed');
            }
        } catch (error) {
            console.error('Attachment upload failed:', error);
            // 6. Mark message as failed
            this.markMessageAsFailed(tempId, error.message);
            URL.revokeObjectURL(filePreviewUrl);
        }
    }
    
    // Upload file with progress tracking
    uploadWithProgress(formData, tempId) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            const token = localStorage.getItem('token');
            
            xhr.open('POST', `${this.API_BASE}/messages/send`, true);
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }
            
            // Track upload progress
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    this.updateMessageProgress(tempId, percentComplete);
                }
            };
            
            xhr.onload = () => {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(response.message || 'Upload failed'));
                    }
                } catch (e) {
                    reject(new Error('Invalid server response'));
                }
            };
            
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send(formData);
        });
    }
    
    // Update progress indicator for uploading message
    updateMessageProgress(tempId, progress) {
        const messageEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (!messageEl) return;
        
        const progressBar = messageEl.querySelector('.upload-progress-bar');
        const progressText = messageEl.querySelector('.upload-progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        if (progressText) {
            progressText.textContent = `${progress}%`;
        }
    }
    
    // Replace optimistic message with real message from server
    replaceOptimisticMessage(tempId, realMessage) {
        const messageEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (!messageEl) return;
        
        // Update the message ID
        messageEl.setAttribute('data-message-id', realMessage._id);
        
        // Remove uploading state
        messageEl.classList.remove('uploading');
        const uploadIndicator = messageEl.querySelector('.upload-indicator');
        if (uploadIndicator) {
            uploadIndicator.remove();
        }
        
        // Update file URL to server URL
        const img = messageEl.querySelector('img[src^="blob:"]');
        if (img && realMessage.fileUrl) {
            img.src = realMessage.fileUrl;
        }
    }
    
    // Mark message as failed with retry option
    markMessageAsFailed(tempId, errorMessage) {
        const messageEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (!messageEl) return;
        
        messageEl.classList.remove('uploading');
        messageEl.classList.add('failed');
        
        const uploadIndicator = messageEl.querySelector('.upload-indicator');
        if (uploadIndicator) {
            uploadIndicator.innerHTML = `
                <div class="upload-error">
                    <span class="error-icon">⚠️</span>
                    <span class="error-text">Upload failed</span>
                    <button class="retry-btn" onclick="chatboxManager.retryUpload('${tempId}')">Retry</button>
                </div>
            `;
        }
    }
    
    // Retry failed upload
    async retryUpload(tempId) {
        // For now, just remove the failed message
        // In a full implementation, we'd store the file and retry
        const messageEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (messageEl) {
            messageEl.remove();
        }
        this.showError('Please try uploading the file again');
    }

    openFileViewer(meta) {
        const modal = document.getElementById('chatViewerModal');
        const title = document.getElementById('chatViewerTitle');
        const body = document.getElementById('chatViewerBody');
        const loading = document.getElementById('chatViewerLoading');
        const errorEl = document.getElementById('chatViewerError');
        if (!modal || !title || !body) return;

        // Reset
        body.innerHTML = '';
        errorEl.style.display = 'none';
        loading.style.display = 'flex';

        const fileUrl = meta.fileUrl;
        const fileName = meta.fileName || 'File';
        const mime = meta.mimeType || '';
        const type = meta.messageType || meta.type;
        const messageId = meta.messageId || ''; // Get message ID for access control
        title.textContent = fileName;

        // Render by type
        const show = (elHtml) => {
            body.innerHTML = elHtml;
            loading.style.display = 'none';
            modal.classList.add('active');
            this._viewerScale = 1;
            this.updateViewerZoom();
        };
        const escape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));

        console.log('Opening file viewer with type:', type); // Debug log

        if (type === 'media') {
            const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
            show(isImage 
              ? `<img src="${escape(fileUrl)}" alt="${escape(fileName)}" style="object-fit: contain;">`
              : `<video src="${escape(fileUrl)}" controls></video>`);
            return;
        }
        if (type === 'voice') {
            show(`<audio controls src="${escape(fileUrl)}"></audio>`);
            return;
        }
        if (type === 'document') {
            // Document files should use our secure file serving endpoint
            console.log('Handling document type file'); // Debug log
        }
        
        // For all other file types (including document), use our new secure file serving endpoint
        if (messageId && fileUrl) {
            // Use our new secure proxy to ensure correct headers and access control
            const proxied = `/api/files/serve?url=${encodeURIComponent(fileUrl)}&messageId=${encodeURIComponent(messageId)}`;
            console.log('Opening file with proxied URL:', proxied); // Debug log
            if ((mime && mime.includes('pdf')) || /\.pdf($|\?)/i.test(fileName)) {
                // PDF files - show in iframe
                show(`<iframe class="pdf-frame" src="${proxied}" style="width:100%; height:100%; border:none;"></iframe>`);
            } else if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
                // Image files - show inline
                show(`<img src="${proxied}" alt="${escape(fileName)}" style="max-width:100%; max-height:100%; object-fit: contain;">`);
            } else if (mime.startsWith('text/') || /\.(txt|md)$/i.test(fileName)) {
                // Text files - show inline
                show(`<iframe src="${proxied}" style="width:100%; height:100%; border:none;"></iframe>`);
            } else {
                // Other files - provide download option with fallback iframe
                show(`
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:20px;">
                        <div style="font-size:4rem;">📄</div>
                        <div style="font-size:1.2rem;">${escape(fileName)}</div>
                        <div style="display:flex; gap:10px;">
                            <a href="${proxied}" target="_blank" download class="viewer-btn" style="text-decoration:none; color:black; padding:10px 20px; background:#f0f0f0; border-radius:8px;">Download</a>
                            <a href="${proxied}" target="_blank" class="viewer-btn" style="text-decoration:none; color:white; padding:10px 20px; background:#000; border-radius:8px;">Open in New Tab</a>
                        </div>
                        <iframe src="${proxied}" style="width:100%; flex:1; border:1px solid #eee; margin-top:20px; border-radius:8px;"></iframe>
                    </div>
                `);
            }
        } else {
            // Fallback for cases where we don't have messageId
            console.log('No messageId available, using direct file URL'); // Debug log
            show(`
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; gap:20px;">
                    <div style="font-size:4rem;">⚠️</div>
                    <div style="font-size:1.2rem;">Unable to preview file</div>
                    <a href="${escape(fileUrl)}" target="_blank" download class="viewer-btn" style="text-decoration:none; color:white; padding:10px 20px; background:#000; border-radius:8px;">Download File</a>
                </div>
            `);
        }
    }

    updateViewerZoom() {
        const disp = document.getElementById('chatZoomDisplay');
        if (disp) disp.textContent = `${Math.round((this._viewerScale || 1)*100)}%`;
    }

    bindViewerControls() {
        const modal = document.getElementById('chatViewerModal');
        const closeBtn = document.getElementById('chatViewerClose');
        const zoomIn = document.getElementById('chatZoomIn');
        const zoomOut = document.getElementById('chatZoomOut');
        const canvas = document.getElementById('chatViewerBody');
        if (!modal || !closeBtn || !zoomIn || !zoomOut || !canvas) return;
        closeBtn.onclick = () => modal.classList.remove('active');
        zoomIn.onclick = () => {
            this._viewerScale = Math.min(3, (this._viewerScale || 1) + 0.1);
            canvas.style.transform = `scale(${this._viewerScale})`;
            this.updateViewerZoom();
        };
        zoomOut.onclick = () => {
            this._viewerScale = Math.max(0.4, (this._viewerScale || 1) - 0.1);
            canvas.style.transform = `scale(${this._viewerScale})`;
            this.updateViewerZoom();
        };
    }

    addMessageToUI(message) {
        const messagesContainer = document.getElementById('chatMessages');
        if (!messagesContainer) return;

        const isOwn = message.senderId._id === this.currentUser._id;
        const time = this.formatMessageTime(message.createdAt);

        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOwn ? 'own' : ''}`;
        
        // Add uploading class if message is being uploaded
        if (message.uploading) {
            messageElement.classList.add('uploading');
        }
        
        if (message._id) {
            messageElement.dataset.messageId = message._id;
        }

        const statusIcon = isOwn ? this.getStatusIcon(message.status) : '';
        let inner = '';
        console.log('Creating message element with type:', message.messageType); // Debug log
        
        // Upload progress indicator (shown for uploading messages)
        const uploadIndicator = message.uploading ? `
            <div class="upload-indicator">
                <div class="upload-spinner"></div>
                <div class="upload-progress">
                    <div class="upload-progress-bar" style="width: ${message.uploadProgress || 0}%"></div>
                </div>
                <div class="upload-progress-text">${message.uploadProgress || 0}%</div>
            </div>
        ` : '';
        
        if (message.messageType === 'text') {
            inner = `
                <div class="message-content">
                    <div class="message-text">${this.escapeHtml(message.content)}</div>
                    <div class="message-time">${time} ${statusIcon}</div>
                </div>`;
        } else if (message.messageType === 'document') {
            const fileName = message.fileName || 'Document';
            console.log('Creating document message with data:', { 
                fileUrl: message.fileUrl, 
                fileName: fileName, 
                mimeType: message.mimeType, 
                messageId: message._id 
            }); // Debug log
            inner = `
                <div class="message-content">
                    <div class="message-file" data-file-url="${message.fileUrl}" data-file-name="${this.escapeHtml(fileName)}" data-mime-type="${message.mimeType || ''}" data-type="document" data-message-id="${message._id}">
                        <div class="file-icon">📄</div>
                        <div class="message-file-info">
                            <div class="message-file-name">${this.escapeHtml(fileName)}</div>
                            ${message.fileSize ? `<div class="message-file-size">${(message.fileSize/1024/1024).toFixed(2)} MB</div>` : ''}
                        </div>
                    </div>
                    ${uploadIndicator}
                    <div class="message-time">${time} ${statusIcon}</div>
                </div>`;
        } else if (message.messageType === 'media') {
            const isImage = (message.mimeType || '').startsWith('image/');
            const fileName = message.fileName || (isImage ? 'Image' : 'Video');
            inner = `
                <div class="message-content">
                    <div class="message-file media-file" data-file-url="${message.fileUrl}" data-file-name="${this.escapeHtml(fileName)}" data-mime-type="${message.mimeType || ''}" data-type="media" data-message-id="${message._id}" style="cursor: pointer;">
                        ${isImage ? `<img src="${message.fileUrl}" alt="media" class="message-image">` : `<video src="${message.fileUrl}" controls class="message-video"></video>`}
                    </div>
                    ${uploadIndicator}
                    <div class="message-time">${time} ${statusIcon}</div>
                </div>`;
        } else if (message.messageType === 'voice') {
            inner = `
                <div class="message-content">
                    <audio controls src="${message.fileUrl}"></audio>
                    ${uploadIndicator}
                    <div class="message-time">${time} ${statusIcon}</div>
                </div>`;
        }

        messageElement.innerHTML = inner;

        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    handleNewMessage(message) {
        // If message is for current active chat, add to UI
        if (this.currentChat && 
            (message.senderId._id === this.currentChat.user._id || message.receiverId._id === this.currentChat.user._id)) {
            this.addMessageToUI(message);
            
            // Mark as seen if chat is active and message is from other user
            if (message.senderId._id === this.currentChat.user._id) {
                this.markMessagesAsSeen(this.currentChat.user._id);
            }
        }

        // Update conversations list
        this.loadConversations();
    }

    async loadConversations() {
        try {
            const response = await this.apiCall('/messages/conversations', 'GET');
            
            if (response.success) {
                this.chats = response.data.chats || [];
                this.requests = response.data.requests || [];
                this.renderChatList();
                this.updateRequestBadge();
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    }

    updateRequestBadge() {
        const requestTab = document.querySelector('.chat-tab[data-tab="requests"]');
        if (requestTab) {
            if (this.requests.length > 0) {
                requestTab.innerHTML = `Requests <span class="badge">${this.requests.length}</span>`;
            } else {
                requestTab.textContent = 'Requests';
            }
        }
    }

    renderChatList() {
        const chatList = document.getElementById('chatList');
        if (!chatList) return;

        const items = this.activeTab === 'chats' ? this.chats : this.requests;

        if (items.length === 0) {
            chatList.innerHTML = `
                <div class="empty-chat-list" style="text-align: center; padding: 40px 20px; color: #666;">
                    <div style="font-size: 2em; margin-bottom: 15px; opacity: 0.5;">💬</div>
                    <div>No ${this.activeTab === 'chats' ? 'conversations' : 'requests'}</div>
                    ${this.activeTab === 'chats' ? '<div style="font-size: 0.9em; margin-top: 5px;">Start a new chat to begin</div>' : ''}
                </div>
            `;
            return;
        }

        chatList.innerHTML = items.map(conv => {
            const time = this.formatMessageTime(conv.lastActivity);
            const preview = this.formatConversationPreview(conv.lastMessage);
            const unreadCount = conv.unreadCount || 0;
            const isRequest = this.activeTab === 'requests';

            return `
                <div class="chat-item" data-user-id="${conv.user._id}"
                     onclick="chatboxManager.openChatWithUser({_id: '${conv.user._id}', name: '${conv.user.name}', avatar: '${conv.user.avatar || ''}'})">
                    <div class="chat-avatar">
                        ${conv.user.avatar ? `<img src="${conv.user.avatar}" alt="${conv.user.name}">` : conv.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${conv.user.name}</div>
                        <div class="chat-last-message">${preview}</div>
                    </div>
                    <div class="chat-meta">
                        <div class="chat-time">${time}</div>
                        ${!isRequest && unreadCount > 0 ? `<span class="chat-unread">${unreadCount}</span>` : ''}
                    </div>
                    ${isRequest ? `
                    <div class="request-actions" onclick="event.stopPropagation()">
                        <button class="accept-btn" onclick="chatboxManager.acceptRequest('${conv.id}')" title="Accept">✓</button>
                        <button class="decline-btn" onclick="chatboxManager.declineRequest('${conv.id}')" title="Decline">✕</button>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // If a chat is already open, ensure it appears active
        if (this.currentChat && this.currentChat.user) {
            this.setActiveChatItem(this.currentChat.user._id);
        }
    }

    async acceptRequest(conversationId) {
        try {
            const response = await this.apiCall(`/messages/requests/${conversationId}/accept`, 'PATCH');
            if (response.success) {
                await this.loadConversations();
                // Switch to chats tab to show the new chat
                const chatsTab = document.querySelector('.chat-tab[data-tab="chats"]');
                if (chatsTab) chatsTab.click();
            }
        } catch (error) {
            console.error('Failed to accept request:', error);
            this.showError('Failed to accept request');
        }
    }

    async declineRequest(conversationId) {
        if (!confirm('Are you sure you want to decline and delete this request?')) return;
        
        try {
            const response = await this.apiCall(`/messages/requests/${conversationId}`, 'DELETE');
            if (response.success) {
                await this.loadConversations();
            }
        } catch (error) {
            console.error('Failed to decline request:', error);
            this.showError('Failed to decline request');
        }
    }

    formatConversationPreview(lastMessage) {
        if (!lastMessage) return 'No messages yet';

        switch (lastMessage.messageType) {
            case 'text':
                return lastMessage.content.length > 50 ? 
                       lastMessage.content.substring(0, 50) + '...' : 
                       lastMessage.content;
            case 'voice':
                return '🎵 Voice message';
            case 'media':
                return '📷 Photo';
            case 'document':
                return `📄 ${lastMessage.fileName || 'Document'}`;
            default:
                return 'New message';
        }
    }

    formatMessageTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString();
        }
    }

    handleTypingIndicator() {
        if (!this.isTyping && this.currentChat) {
            this.isTyping = true;
            this.socket.emit('startTyping', { receiverId: this.currentChat.user._id });
        }

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.stopTyping();
        }, 2000);
    }

    stopTyping() {
        if (this.isTyping && this.currentChat) {
            this.isTyping = false;
            this.socket.emit('stopTyping', { receiverId: this.currentChat.user._id });
        }
    }

    showTypingIndicator(userName) {
        const statusEl = document.querySelector('.chat-header-status');
        if (statusEl) {
            statusEl.textContent = `${userName} is typing...`;
            statusEl.style.color = '#007bff';
        }
    }

    hideTypingIndicator() {
        const statusEl = document.querySelector('.chat-header-status');
        if (statusEl && this.currentChat) {
            const isOnline = this.onlineUsers.has(this.currentChat.user._id);
            statusEl.textContent = isOnline ? 'Online' : 'Last seen recently';
            statusEl.style.color = isOnline ? '#28a745' : '#666';
        }
    }

    updateUserStatus(userId, status) {
        if (this.currentChat && this.currentChat.user._id === userId) {
            const statusEl = document.querySelector('.chat-header-status');
            if (statusEl) {
                statusEl.textContent = status === 'online' ? 'Online' : 'Last seen recently';
                statusEl.style.color = status === 'online' ? '#28a745' : '#666';
            }
        }
    }

    getStatusIcon(status) {
        if (!status) return '';
        switch (status) {
            case 'sent':
                return '<span class="status-icon">✓</span>';
            case 'delivered':
            case 'seen':
                return '<span class="status-icon">✓✓</span>';
            default:
                return '';
        }
    }

    updateMessageStatus(messageId, newStatus) {
        // Find and update the message status in the UI
        const messages = document.querySelectorAll('.message.own');
        messages.forEach(msgEl => {
            // We need to track message IDs in the DOM
            if (msgEl.dataset.messageId === messageId) {
                const statusIcon = msgEl.querySelector('.status-icon');
                if (statusIcon) {
                    statusIcon.textContent = newStatus === 'sent' ? '✓' : '✓✓';
                }
            }
        });
    }

    updateConversationMessagesStatus(newStatus) {
        // Update all own messages in the current conversation
        const messages = document.querySelectorAll('.message.own .status-icon');
        messages.forEach(icon => {
            icon.textContent = '✓✓';
        });
    }

    async markMessagesAsSeen(userId) {
        try {
            await this.apiCall(`/messages/${userId}/seen`, 'PATCH');
        } catch (error) {
            console.error('Failed to mark messages as seen:', error);
        }
    }

    searchChats(query) {
        const chatItems = document.querySelectorAll('.chat-item');

        chatItems.forEach(item => {
            const chatName = item.querySelector('.chat-name')?.textContent.toLowerCase() || '';
            const lastMessage = item.querySelector('.chat-last-message')?.textContent.toLowerCase() || '';

            if (chatName.includes(query.toLowerCase()) || lastMessage.includes(query.toLowerCase())) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    setActiveChatItem(userId) {
        document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
        const activeItem = document.querySelector(`.chat-item[data-user-id="${userId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('chatMessages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    showWelcomeMessage() {
        const header = document.getElementById('chatHeader');
        const messagesContainer = document.getElementById('chatMessages');
        if (header) header.innerHTML = '';
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; color: #666;">
                    <div style="font-size: 4em; margin-bottom: 20px; opacity: 0.3;">💬</div>
                    <h3 style="margin-bottom: 10px; color: #333;">Welcome to Paparly Chat</h3>
                    <p style="margin-bottom: 20px;">Select a conversation to start messaging</p>
                    <button onclick="openNewChatModal()" style="background: #000; color: white; border: none; padding: 12px 24px; border-radius: 25px; cursor: pointer; font-weight: 600;">Start New Chat</button>
                </div>
            `;
        }
    }

    showError(message) {
        const header = document.getElementById('chatHeader');
        const messagesContainer = document.getElementById('chatMessages');
        if (header) header.innerHTML = '';
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; color: #dc3545;">
                    <div style="font-size: 3em; margin-bottom: 20px;">⚠️</div>
                    <h3 style="margin-bottom: 10px;">Error</h3>
                    <p>${this.escapeHtml(message)}</p>
                </div>
            `;
        }
    }

    openNewChatModal() {
        const modal = document.getElementById('newChatModal');
        if (modal) {
            modal.classList.add('active');
            const userSearch = document.getElementById('userSearch');
            if (userSearch) {
                userSearch.focus();
            }
        }
    }

    closeNewChatModal() {
        const modal = document.getElementById('newChatModal');
        if (modal) {
            modal.classList.remove('active');
            const userSearch = document.getElementById('userSearch');
            if (userSearch) {
                userSearch.value = '';
            }
            this.clearUserSearch();
        }
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    async apiCall(endpoint, method = 'GET', body = null) {
        const token = localStorage.getItem('token');
        const config = {
            method,
            headers: {}
        };

        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }

        if (body && !(body instanceof FormData)) {
            config.headers['Content-Type'] = 'application/json';
            config.body = JSON.stringify(body);
        } else if (body) {
            config.body = body;
        }

        const response = await fetch(`${this.API_BASE}${endpoint}`, config);
        
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.href = this.AUTH_URL;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    }
}

// Global functions for HTML onclick handlers
function openNewChatModal() {
    if (window.chatboxManager) {
        window.chatboxManager.openNewChatModal();
    }
}

function closeNewChatModal() {
    if (window.chatboxManager) {
        window.chatboxManager.closeNewChatModal();
    }
}

function sendMessage() {
    if (window.chatboxManager) {
        window.chatboxManager.sendMessage();
    }
}

// Initialize chatbox manager
document.addEventListener('DOMContentLoaded', () => {
    window.chatboxManager = new ChatboxManager();
    // Bind viewer controls once DOM ready
    window.chatboxManager.bindViewerControls();
});

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        closeNewChatModal();
    }
});

