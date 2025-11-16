import './style.css';

// Simple auth gate: redirect to login if no token
const token = localStorage.getItem('token');
const AUTH_URL = 'http://localhost:5002/frontend/auth/auth.html';
if (!token) {
  window.location.href = AUTH_URL;
}

// Create landing page with chat access
document.querySelector('#app').innerHTML = `
  <div style="
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  ">
    <div style="
      background: white;
      padding: 40px;
      border-radius: 20px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
      width: 90%;
    ">
      <h1 style="
        color: #333;
        margin-bottom: 10px;
        font-size: 32px;
        font-weight: 300;
      ">📝 Paparly</h1>
      <p style="
        color: #666;
        margin-bottom: 30px;
        font-size: 16px;
      ">Modern Note-Sharing & Chat Platform</p>
      
      <button id="chatBtn" style="
        background: linear-gradient(45deg, #f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%);
        color: white;
        border: none;
        padding: 15px 30px;
        border-radius: 25px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.2s;
        margin: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      ">💬 Open Chat</button>
      
      <br><br>
      
      <button id="logoutBtn" style="
        background: #f5f5f5;
        color: #666;
        border: 1px solid #ddd;
        padding: 10px 20px;
        border-radius: 20px;
        font-size: 14px;
        cursor: pointer;
        transition: background-color 0.2s;
      ">Logout</button>
    </div>
  </div>
`;

// Add event listeners
document.getElementById('chatBtn').addEventListener('click', () => {
  window.location.href = '/chat.html';
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { 
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); 
  } catch(_) {}
  localStorage.removeItem('token');
  window.location.href = AUTH_URL;
});

// Add hover effects
const style = document.createElement('style');
style.textContent = `
  #chatBtn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.3);
  }
  
  #logoutBtn:hover {
    background: #e0e0e0;
  }
`;
document.head.appendChild(style);
