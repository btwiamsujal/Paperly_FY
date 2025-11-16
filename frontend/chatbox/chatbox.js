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

        // Load messages
        await this.loadMessages(user._id);
    }

    updateChatHeader(user) {
        const header = document.getElementById('chatHeader');
        const isOnline = this.onlineUsers.has(user._id);

        header.innerHTML = `
            <div class="chat-header-avatar">
                ${user.avatar ? `<img src="${user.avatar}" alt="${user.name}">` : user.name.charAt(0).toUpperCase()}
            </div>
            <div class="chat-header-info">
                <div class="chat-header-name">${user.name}</div>
                <div class="chat-header-status" style="color: ${isOnline ? '#28a745' : '#666'};">${isOnline ? 'Online' : 'Last seen recently'}</div>
            </div>
        `;

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
            const { fileUrl, fileName, mimeType, type } = fileEl.dataset;
            this.openFileViewer({ fileUrl, fileName, mimeType, messageType: type });
        };

        messagesContainer.innerHTML = messages.map(message => {
            const isOwn = message.senderId._id === this.currentUser._id;
            const time = this.formatMessageTime(message.createdAt);

            let inner = '';
            if (message.messageType === 'text') {
                inner = `
                    <div class="message-content">
                        <div class="message-text">${this.escapeHtml(message.content)}</div>
                        <div class="message-time">${time}</div>
                    </div>`;
            } else if (message.messageType === 'document') {
                const fileName = message.fileName || 'Document';
            inner = `
                    <div class="message-content">
                        <div class="message-file" data-file-url="${message.fileUrl}" data-file-name="${this.escapeHtml(fileName)}" data-mime-type="${message.mimeType || ''}" data-type="document">
                            <div class="file-icon">📄</div>
                            <div class="message-file-info">
                                <div class="message-file-name">${this.escapeHtml(fileName)}</div>
                                ${message.fileSize ? `<div class="message-file-size">${(message.fileSize/1024/1024).toFixed(2)} MB</div>` : ''}
                            </div>
                        </div>
                        <div class="message-time">${time}</div>
                    </div>`;
            } else if (message.messageType === 'media') {
                const isImage = (message.mimeType || '').startsWith('image/');
                inner = `
                    <div class="message-content">
                        ${isImage ? `<img src="${message.fileUrl}" alt="media" style="max-width: 260px; border-radius: 10px; display:block;">` : `<video src="${message.fileUrl}" controls style="max-width: 260px; border-radius: 10px; display:block;"></video>`}
                        <div class="message-time">${time}</div>
                    </div>`;
            } else if (message.messageType === 'voice') {
                inner = `
                    <div class="message-content">
                        <audio controls src="${message.fileUrl}"></audio>
                        <div class="message-time">${time}</div>
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
        const formData = new FormData();
        formData.append('receiverId', this.currentChat.user._id);
        formData.append('messageType', messageType);
        formData.append('file', file);

        try {
            const response = await this.apiCall('/messages/send', 'POST', formData);
            if (response.success) {
                this.addMessageToUI(response.data);
                this.loadConversations();
            } else {
                this.showError('Failed to send attachment');
            }
        } catch (e) {
            console.error('Attachment send failed:', e);
            this.showError('Failed to send attachment');
        }
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
        title.textContent = fileName;

        // Render by type
        const canvas = document.getElementById('chatViewerBody');
        const show = (elHtml) => {
            body.innerHTML = elHtml;
            loading.style.display = 'none';
            modal.classList.add('active');
            this._viewerScale = 1;
            this.updateViewerZoom();
        };
        const escape = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));

        if (type === 'media') {
            const isImage = mime.startsWith('image/');
            show(isImage 
              ? `<img src="${escape(fileUrl)}" alt="${escape(fileName)}">`
              : `<video src="${escape(fileUrl)}" controls></video>`);
            return;
        }
        if (type === 'voice') {
            show(`<audio controls src="${escape(fileUrl)}"></audio>`);
            return;
        }
        // Document: prefer PDF inline; otherwise iframe fallback
        if ((mime && mime.includes('pdf')) || /\.pdf($|\?)/i.test(fileName)) {
            const proxied = `/api/files/pdf?src=${encodeURIComponent(fileUrl)}`;
            show(`<iframe class="pdf-frame" src="${proxied}"></iframe>`);
            return;
        }
        // Office formats via Office viewer
        if (/\.(docx?|pptx?|xlsx?)($|\?)/i.test(fileName)) {
            const viewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;
            show(`<iframe class="pdf-frame" src="${viewerUrl}"></iframe>`);
            return;
        }
        // Generic iframe fallback
        show(`<iframe class="pdf-frame" src="${escape(fileUrl)}"></iframe>`);
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

        let inner = '';
        if (message.messageType === 'text') {
            inner = `
                <div class="message-content">
                    <div class="message-text">${this.escapeHtml(message.content)}</div>
                    <div class="message-time">${time}</div>
                </div>`;
        } else if (message.messageType === 'document') {
            const fileName = message.fileName || 'Document';
            inner = `
                <div class="message-content">
                    <div class="message-file" data-file-url="${message.fileUrl}" data-file-name="${this.escapeHtml(fileName)}" data-mime-type="${message.mimeType || ''}" data-type="document">
                        <div class="file-icon">📄</div>
                        <div class="message-file-info">
                            <div class="message-file-name">${this.escapeHtml(fileName)}</div>
                            ${message.fileSize ? `<div class="message-file-size">${(message.fileSize/1024/1024).toFixed(2)} MB</div>` : ''}
                        </div>
                    </div>
                    <div class="message-time">${time}</div>
                </div>`;
        } else if (message.messageType === 'media') {
            const isImage = (message.mimeType || '').startsWith('image/');
            inner = `
                <div class="message-content">
                    ${isImage ? `<img src="${message.fileUrl}" alt="media" style="max-width: 260px; border-radius: 10px; display:block;">` : `<video src="${message.fileUrl}" controls style="max-width: 260px; border-radius: 10px; display:block;"></video>`}
                    <div class="message-time">${time}</div>
                </div>`;
        } else if (message.messageType === 'voice') {
            inner = `
                <div class="message-content">
                    <audio controls src="${message.fileUrl}"></audio>
                    <div class="message-time">${time}</div>
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
                this.conversations = response.data;
                this.renderChatList();
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    }

    renderChatList() {
        const chatList = document.getElementById('chatList');
        if (!chatList) return;

        if (this.conversations.length === 0) {
            chatList.innerHTML = `
                <div class="empty-chat-list" style="text-align: center; padding: 40px 20px; color: #666;">
                    <div style="font-size: 2em; margin-bottom: 15px; opacity: 0.5;">💬</div>
                    <div>No conversations yet</div>
                    <div style="font-size: 0.9em; margin-top: 5px;">Start a new chat to begin</div>
                </div>
            `;
            return;
        }

        chatList.innerHTML = this.conversations.map(conv => {
            const time = this.formatMessageTime(conv.lastActivity);
            const preview = this.formatConversationPreview(conv.lastMessage);
            const unreadCount = conv.unreadCount || 0;

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
                        ${unreadCount > 0 ? `<span class="chat-unread">${unreadCount}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // If a chat is already open, ensure it appears active
        if (this.currentChat && this.currentChat.user) {
            this.setActiveChatItem(this.currentChat.user._id);
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

