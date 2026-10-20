const APP_PORT = 3002;
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const APP_ORIGIN = isLocal ? `http://${window.location.hostname}:${APP_PORT}` : window.location.origin;

const token = localStorage.getItem('quickchat_token') || localStorage.getItem('insta_token');
if (!token) window.location.href = `${APP_ORIGIN}/login.html`;

const currentUser = JSON.parse(localStorage.getItem('quickchat_user') || localStorage.getItem('insta_user') || '{}');

const assetUrl = (url) => (url && url.startsWith('/') ? APP_ORIGIN + url : url || '');

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Calls the app server and always returns parsed JSON or throws a readable error
async function api(path, options = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...(options.headers || {}) };
  let res;
  try {
    res = await fetch(APP_ORIGIN + path, { ...options, headers });
  } catch {
    throw new Error(`Cannot reach the app server. Run "npm start" and open ${APP_ORIGIN}.`);
  }

  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new Error(`Server returned a webpage instead of data. Restart it with "npm start" and open ${APP_ORIGIN}.`);
  }
  const data = await res.json();
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('quickchat_token');
    localStorage.removeItem('insta_token');
    window.location.href = `${APP_ORIGIN}/login.html`;
  }
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

const jsonRequest = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

// Navigation handler
const navItems = document.querySelectorAll('.nav-links li[data-view]');
const views = document.querySelectorAll('.view-panel');

navItems.forEach((item) => {
  item.addEventListener('click', () => {
    navItems.forEach((n) => n.classList.remove('active'));
    views.forEach((v) => v.classList.remove('active'));

    item.classList.add('active');
    const viewName = item.dataset.view;
    document.getElementById(`view-${viewName}`).classList.add('active');

    if (viewName === 'feed') loadFeed();
    if (viewName === 'profile') loadProfile();
  });
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('quickchat_token');
  localStorage.removeItem('quickchat_user');
  localStorage.removeItem('insta_token');
  localStorage.removeItem('insta_user');
  window.location.href = `${APP_ORIGIN}/login.html`;
});

// Create Post Modal Controls
const modal = document.getElementById('create-modal');
document.getElementById('open-create-modal').addEventListener('click', () => modal.classList.add('active'));
document.getElementById('close-create-modal').addEventListener('click', () => modal.classList.remove('active'));

document.getElementById('create-post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('post-image-file').files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);
  formData.append('caption', document.getElementById('post-caption').value);

  try {
    await api('/api/posts', { method: 'POST', body: formData });
    modal.classList.remove('active');
    e.target.reset();
    loadFeed();
  } catch (err) {
    alert(err.message);
  }
});

// Load Feed
async function loadFeed() {
  const container = document.getElementById('posts-stream');
  container.innerHTML = '<p style="text-align:center; padding: 2rem;">Loading feed...</p>';

  let posts;
  try {
    posts = await api('/api/posts');
  } catch (err) {
    container.innerHTML = `<p style="text-align:center; padding: 2rem; color: #c0392b;">${escapeHtml(err.message)}</p>`;
    return;
  }

  if (posts.length === 0) {
    container.innerHTML = '<p style="text-align:center; padding: 2rem; color: #888;">No posts yet. Be the first to share!</p>';
    return;
  }

  container.innerHTML = posts.map((p) => `
    <article class="post-card" data-id="${p.id}">
      <div class="post-header">
        <img src="${escapeHtml(assetUrl(p.avatar))}" class="avatar-sm">
        <strong>${escapeHtml(p.username)}</strong>
      </div>
      <img src="${escapeHtml(assetUrl(p.image_url))}" class="post-img">
      <div class="post-actions">
        <button class="action-btn like-btn">${p.has_liked ? '❤️' : '🤍'}</button>
        <button class="action-btn">💬</button>
      </div>
      <div class="post-details">
        <div class="likes-count">${p.likes_count} likes</div>
        <p><strong>${escapeHtml(p.username)}</strong> ${escapeHtml(p.caption)}</p>
        <div class="comments-list" id="comments-${p.id}"></div>
      </div>
      <form class="comment-input-box" onsubmit="submitComment(event, ${p.id})">
        <input type="text" placeholder="Add a comment..." required>
        <button type="submit">Post</button>
      </form>
    </article>
  `).join('');

  document.querySelectorAll('.like-btn').forEach((btn, index) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/posts/${posts[index].id}/like`, { method: 'POST' });
        loadFeed();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

// Add Comment
window.submitComment = async function (e, postId) {
  e.preventDefault();
  const input = e.target.querySelector('input');
  const comment = input.value.trim();
  if (!comment) return;

  try {
    await api(`/api/posts/${postId}/comments`, jsonRequest('POST', { comment }));
    input.value = '';
    loadFeed();
  } catch (err) {
    alert(err.message);
  }
};

// Profile Loader
function showAvatar(url) {
  const src = assetUrl(url);
  document.getElementById('profile-avatar').src = src;
  document.getElementById('story-avatar').src = src;
}

async function loadProfile() {
  try {
    const data = await api('/api/users/me');
    showAvatar(data.profile.avatar);
    document.getElementById('profile-username').textContent = data.profile.username;
    document.getElementById('profile-fullname').textContent = data.profile.fullname;
    document.getElementById('profile-bio').textContent = data.profile.bio || '';
    document.getElementById('stat-posts').textContent = data.profile.posts_count;
    document.getElementById('stat-followers').textContent = data.profile.followers_count;
    document.getElementById('stat-following').textContent = data.profile.following_count;

    document.getElementById('profile-grid').innerHTML = data.posts
      .map((p) => `<img src="${escapeHtml(assetUrl(p.image_url))}">`)
      .join('');
  } catch (err) {
    alert(err.message);
  }
}

// Change profile photo
const avatarFileInput = document.getElementById('avatar-file');
document.getElementById('change-photo-btn').addEventListener('click', () => avatarFileInput.click());

avatarFileInput.addEventListener('change', async () => {
  const file = avatarFileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const data = await api('/api/users/me/avatar', { method: 'POST', body: formData });
    showAvatar(data.avatar);
    currentUser.avatar = data.avatar;
    localStorage.setItem('quickchat_user', JSON.stringify(currentUser));
  } catch (err) {
    alert(err.message);
  } finally {
    avatarFileInput.value = '';
  }
});

// Edit bio
const bioText = document.getElementById('profile-bio');
const bioForm = document.getElementById('bio-form');
const bioInput = document.getElementById('bio-input');
const editBioBtn = document.getElementById('edit-bio-btn');

function setBioEditing(editing) {
  bioForm.hidden = !editing;
  bioText.hidden = editing;
  editBioBtn.hidden = editing;
  if (editing) {
    bioInput.value = bioText.textContent;
    bioInput.focus();
  }
}

editBioBtn.addEventListener('click', () => setBioEditing(true));
document.getElementById('cancel-bio-btn').addEventListener('click', () => setBioEditing(false));

bioForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/users/me/bio', jsonRequest('PUT', { bio: bioInput.value }));
    bioText.textContent = data.bio;
    setBioEditing(false);
  } catch (err) {
    alert(err.message);
  }
});

// Search Users
document.getElementById('search-input').addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  const results = document.getElementById('search-results');
  if (!q) {
    results.innerHTML = '';
    return;
  }
  try {
    const users = await api(`/api/search?q=${encodeURIComponent(q)}`);
    results.innerHTML = users.map((u) => `
      <div class="user-item">
        <img src="${escapeHtml(assetUrl(u.avatar))}" class="avatar-sm">
        <div>
          <strong>${escapeHtml(u.username)}</strong>
          <p style="font-size: 0.8rem; color: #888;">${escapeHtml(u.fullname)}</p>
        </div>
      </div>
    `).join('');
  } catch (err) {
    results.innerHTML = `<p style="color: #c0392b;">${escapeHtml(err.message)}</p>`;
  }
});

// Initial boot
if (currentUser.avatar) document.getElementById('story-avatar').src = assetUrl(currentUser.avatar);
loadFeed();
