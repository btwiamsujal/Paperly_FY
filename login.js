const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('loginBtn');
const errorEl = document.getElementById('error');

// If already logged in, go to app
const existing = localStorage.getItem('token');
if (existing) {
  window.location.href = '/';
}

loginBtn.addEventListener('click', async () => {
  errorEl.textContent = '';
  const email = (emailInput.value || '').trim();
  const password = passwordInput.value || '';
  if (!email || !password) {
    errorEl.textContent = 'Please enter email and password.';
    return;
  }
  try {
    const res = await fetch('http://localhost:5002/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || 'Login failed');
    }
    if (!data?.token) throw new Error('No token received');
    localStorage.setItem('token', data.token);
    window.location.href = '/';
  } catch (err) {
    errorEl.textContent = err.message || 'Something went wrong';
  }
});