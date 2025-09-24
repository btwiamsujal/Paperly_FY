import { io } from 'socket.io-client';
import './style.css';

// Simple auth gate: redirect to login if no token
const token = localStorage.getItem('token');
const AUTH_URL = 'http://localhost:5002/frontend/auth/auth.html';
if (!token) {
  window.location.href = AUTH_URL;
}

// Connect to backend server with JWT in handshake
const socket = io('http://localhost:5002', {
  auth: { token }
}); // Make sure backend is running on port 5002
const roomId = 'global';

document.querySelector('#app').innerHTML = `
  <div class="chat-container">
    <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px;">
      <h2 style="margin:0;">📢 Paperly Chat Room</h2>
      <button id="logoutBtn" title="Logout">Logout</button>
    </div>
    <div class="messages" style="height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; margin-bottom: 10px;"></div>
    <input id="messageInput" placeholder="Type a message..." style="width: 70%;" />
    <button id="sendBtn">Send</button>
  </div>
`;

// Join the chat room when connected
socket.on('connect', () => {
  console.log('✅ Connected to server');
  socket.emit('joinRoom', roomId);
});

socket.on('connect_error', (err) => {
  console.error('Socket connect error:', err?.message || err);
if (err?.message === 'Unauthorized') {
    localStorage.removeItem('token');
    window.location.href = AUTH_URL;
  }
});

// Log disconnect
socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
});

// Show incoming messages
socket.on('chatMessage', (data) => {
  const messagesDiv = document.querySelector('.messages');

  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message');

  const senderName = data?.sender?.name || (data?.sender?.id === socket.id ? 'You' : 'User');
  messageDiv.innerHTML = `<strong>${senderName}:</strong> ${data.message}`;

  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

// Send message logic
const sendBtn = document.getElementById('sendBtn');
const messageInput = document.getElementById('messageInput');

sendBtn.addEventListener('click', () => {
  const message = messageInput.value.trim();
  if (message) {
    socket.emit('chatMessage', {
      roomId,
      message
    });
    messageInput.value = '';
  }
});

messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendBtn.click();
  }
});

// Logout
const logoutBtn = document.getElementById('logoutBtn');
logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = AUTH_URL;
});
