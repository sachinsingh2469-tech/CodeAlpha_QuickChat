let isSignUp = false;

const form = document.getElementById('auth-form');
const toggleModeBtn = document.getElementById('toggle-mode');
const toggleText = document.getElementById('toggle-text');
const formTitle = document.getElementById('form-title');
const submitBtn = document.getElementById('submit-btn');
const usernameGroup = document.getElementById('username-group');
const fullnameGroup = document.getElementById('fullname-group');
const togglePwdBtn = document.getElementById('toggle-pwd');
const passwordInput = document.getElementById('password');
const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const appOrigin = isLocalDevelopment
  ? `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${window.location.hostname || 'localhost'}:3002`
  : window.location.origin;
const savedToken = localStorage.getItem('quickchat_token') || localStorage.getItem('insta_token');
const savedUser = localStorage.getItem('quickchat_user') || localStorage.getItem('insta_user');
if (savedToken) localStorage.setItem('quickchat_token', savedToken);
if (savedUser) localStorage.setItem('quickchat_user', savedUser);
localStorage.removeItem('insta_token');
localStorage.removeItem('insta_user');

toggleModeBtn.addEventListener('click', (e) => {
  e.preventDefault();
  isSignUp = !isSignUp;

  if (isSignUp) {
    usernameGroup.style.display = 'block';
    fullnameGroup.style.display = 'block';
    document.getElementById('username').required = true;
    passwordInput.autocomplete = 'new-password';
    formTitle.textContent = 'Create Account';
    submitBtn.textContent = 'Sign Up';
    toggleText.textContent = 'Already have an account?';
    toggleModeBtn.textContent = 'Sign In';
  } else {
    usernameGroup.style.display = 'none';
    fullnameGroup.style.display = 'none';
    document.getElementById('username').required = false;
    passwordInput.autocomplete = 'current-password';
    formTitle.textContent = 'Quickchat';
    submitBtn.textContent = 'Sign In';
    toggleText.textContent = 'New to Quickchat?';
    toggleModeBtn.textContent = 'Create Account';
  }
});

togglePwdBtn.addEventListener('click', () => {
  const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
  passwordInput.setAttribute('type', type);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = passwordInput.value;

  if (isSignUp && password.length < 8) {
    alert('Password must be at least 8 characters. Letters, numbers, and symbols are all allowed.');
    passwordInput.focus();
    return;
  }

  const endpoint = isSignUp ? '/api/register' : '/api/login';
  const payload = { email, password };

  if (isSignUp) {
    payload.username = document.getElementById('username').value.trim();
    payload.fullname = document.getElementById('fullname').value.trim();
  }

  try {
    const res = await fetch(`${appOrigin}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('The app server returned a webpage instead of the API response. In the project folder, run "npm start" and open http://localhost:3002/login.html.');
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error('The app server returned invalid JSON. Check the server terminal for errors and try again.');
    }
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    localStorage.setItem('quickchat_token', data.token);
    localStorage.setItem('quickchat_user', JSON.stringify(data.user));
    window.location.href = `${appOrigin}/index.html`;
  } catch (err) {
    alert(err.message);
  }
});