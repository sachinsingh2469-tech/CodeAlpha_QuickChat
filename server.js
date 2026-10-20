const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const JWT_SECRET = 'your_super_secret_jwt_key_123';
const port = Number(process.env.PORT) || 3002;

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Database connection
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'computer',
  database: 'instagram_db',
  waitForConnections: true,
  connectionLimit: 10
});

const demoPosts = [
  { username: 'mira_eats', fullname: 'Mira Kapoor', image: 'photo-1546069901-ba9599a7e63c', caption: 'A little color for lunch today. #food' },
  { username: 'arjun_oncourt', fullname: 'Arjun Mehta', image: 'photo-1461896836934-ffe607ba8211', caption: 'Nothing beats a game under the lights. #sports' },
  { username: 'sana_summits', fullname: 'Sana Ali', image: 'photo-1464822759023-fed622ff2c3b', caption: 'Early start, endless views. #mountains' },
  { username: 'leo_roams', fullname: 'Leo Martin', image: 'photo-1500530855697-b586d89ba3ee', caption: 'Taking the long way around. #travel' },
  { username: 'nina_runs', fullname: 'Nina Patel', image: 'photo-1476480862126-209bfaa8edc8', caption: 'Morning miles and a fresh playlist. #running' },
  { username: 'kai_cycles', fullname: 'Kai Chen', image: 'photo-1517649763962-0c623066013b', caption: 'Found a new favorite route. #cycling' },
  { username: 'tara_bakes', fullname: 'Tara Singh', image: 'photo-1509440159596-0249088772ff', caption: 'Fresh from the oven. #baking' },
  { username: 'devika_trails', fullname: 'Devika Rao', image: 'photo-1470770841072-f978cf4d019e', caption: 'A quiet trail and nowhere else to be. #nature' },
  { username: 'omar_matchday', fullname: 'Omar Haddad', image: 'photo-1522778119026-d647f0596c20', caption: 'Match day energy. #football' },
  { username: 'elena_wanders', fullname: 'Elena Rossi', image: 'photo-1501785888041-af3ef285b470', caption: 'Saving this view for a rainy day. #travel' }
].map((post) => ({ ...post, imageUrl: `https://images.unsplash.com/${post.image}?auto=format&fit=crop&w=1080&q=85` }));

async function seedDemoPosts() {
  for (const post of demoPosts) {
    const [users] = await pool.execute('SELECT id FROM users WHERE username = ?', [post.username]);
    let userId = users[0]?.id;

    if (!userId) {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const avatar = `https://images.unsplash.com/${post.image}?auto=format&fit=crop&w=150&q=80`;
      const [result] = await pool.execute(
        'INSERT INTO users (username, fullname, email, password, avatar) VALUES (?, ?, ?, ?, ?)',
        [post.username, post.fullname, `${post.username}@quickchat.example`, passwordHash, avatar]
      );
      userId = result.insertId;
    }

    const [existingPosts] = await pool.execute(
      'SELECT id FROM posts WHERE user_id = ? AND image_url = ?',
      [userId, post.imageUrl]
    );
    if (existingPosts.length === 0) {
      await pool.execute(
        'INSERT INTO posts (user_id, image_url, caption) VALUES (?, ?, ?)',
        [userId, post.imageUrl, post.caption]
      );
    }
  }
}

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
const avatarUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Please choose an image file.'));
    }
    cb(null, true);
  }
});

// Auth Middleware
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized access' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ----------------- AUTH ROUTES -----------------
app.post('/api/register', async (req, res) => {
  const { username, fullname, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, fullname, email, password) VALUES (?, ?, ?, ?)',
      [username, fullname || username, email, hashedPassword]
    );
    const token = jwt.sign({ id: result.insertId, username }, JWT_SECRET);
    res.json({ token, user: { id: result.insertId, username, fullname: fullname || username } });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    console.error('Account registration failed:', err);
    res.status(500).json({ error: 'Could not create your account. Check that the database is running and configured.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(400).json({ error: 'Invalid credentials' });

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({
      token,
      user: { id: user.id, username: user.username, fullname: user.fullname, avatar: user.avatar }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- POSTS & FEED -----------------
app.post('/api/posts', authenticate, upload.single('image'), async (req, res) => {
  try {
    const imageUrl = `/uploads/${req.file.filename}`;
    const [result] = await pool.execute(
      'INSERT INTO posts (user_id, image_url, caption) VALUES (?, ?, ?)',
      [req.user.id, imageUrl, req.body.caption || '']
    );
    res.json({ id: result.insertId, imageUrl, caption: req.body.caption });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts', authenticate, async (req, res) => {
  try {
    const [posts] = await pool.execute(`
      SELECT p.*, u.username, u.avatar,
        (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
        EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) AS has_liked
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- LIKES & COMMENTS -----------------
app.post('/api/posts/:id/like', authenticate, async (req, res) => {
  const postId = req.params.id;
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM likes WHERE post_id = ? AND user_id = ?',
      [postId, req.user.id]
    );
    if (existing.length > 0) {
      await pool.execute('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
      return res.json({ liked: false });
    } else {
      await pool.execute('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [postId, req.user.id]);
      return res.json({ liked: true });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/posts/:id/comments', authenticate, async (req, res) => {
  try {
    const [comments] = await pool.execute(`
      SELECT c.*, u.username, u.avatar 
      FROM comments c 
      JOIN users u ON c.user_id = u.id 
      WHERE c.post_id = ? 
      ORDER BY c.created_at ASC
    `, [req.params.id]);
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:id/comments', authenticate, async (req, res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: 'Comment text cannot be empty' });
  try {
    const [result] = await pool.execute(
      'INSERT INTO comments (post_id, user_id, comment) VALUES (?, ?, ?)',
      [req.params.id, req.user.id, comment]
    );
    res.json({ id: result.insertId, comment, username: req.user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- USER PROFILE & SEARCH -----------------
app.get('/api/users/me', authenticate, async (req, res) => {
  try {
    const [users] = await pool.execute(`
      SELECT u.id, u.username, u.fullname, u.avatar, u.bio,
        (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS posts_count,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS followers_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) AS following_count
      FROM users u WHERE u.id = ?
    `, [req.user.id]);

    const [userPosts] = await pool.execute(
      'SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json({ profile: users[0], posts: userPosts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/me/bio', authenticate, async (req, res) => {
  const bio = String((req.body || {}).bio ?? '').trim();
  if (bio.length > 255) return res.status(400).json({ error: 'Bio must be 255 characters or fewer.' });
  try {
    await pool.execute('UPDATE users SET bio = ? WHERE id = ?', [bio, req.user.id]);
    res.json({ bio });
  } catch (err) {
    console.error('Bio update failed:', err);
    res.status(500).json({ error: 'Could not update your bio.' });
  }
});

app.post('/api/users/me/avatar', authenticate, (req, res) => {
  avatarUpload.single('avatar')(req, res, async (uploadError) => {
    if (uploadError) return res.status(400).json({ error: uploadError.message });
    if (!req.file) return res.status(400).json({ error: 'Choose an image first.' });

    const avatar = `/uploads/${req.file.filename}`;
    try {
      await pool.execute('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id]);
      res.json({ avatar });
    } catch (err) {
      console.error('Avatar update failed:', err);
      res.status(500).json({ error: 'Could not update your profile photo.' });
    }
  });
});

app.get('/api/search', authenticate, async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  try {
    const [users] = await pool.execute(
      'SELECT id, username, fullname, avatar FROM users WHERE username LIKE ? OR fullname LIKE ? LIMIT 15',
      [q, q]
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found. Restart the server with "npm start".' });
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({ error: 'Request body must be valid JSON.' });
  }
  if (res.headersSent) return next(err);
  console.error('Request failed:', err);
  res.status(500).json({ error: 'The server could not process this request.' });
});

async function start() {
  const schemaConnection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'computer',
    multipleStatements: true
  });

  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await schemaConnection.query(schema);
  } finally {
    await schemaConnection.end();
  }

  await seedDemoPosts();
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

start().catch((err) => {
  console.error('Could not initialize the application database:', err);
  process.exitCode = 1;
});