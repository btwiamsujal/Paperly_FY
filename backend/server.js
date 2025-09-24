require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const classroomRoutes = require('./routes/classroomRoutes');
const postRoutes = require('./routes/postRoutes');
const chatRoutes = require('./routes/chatRoutes');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Load .env variables
console.log("🔑 MONGO_URI:", process.env.MONGO_URI ? "✅ Loaded" : "❌ Missing");

// Connect to MongoDB
connectDB();

// Initialize Express app
const app = express();

// Allowed origins (dev and live server)
const ALLOWED_ORIGINS = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:5173',
  'http://localhost:5173'
];

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  }
});

// Require JWT on socket connections
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || (socket.handshake.headers?.authorization || '').replace('Bearer ', '');
    if (!token) return next(new Error('Unauthorized'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id };
    return next();
  } catch (e) {
    return next(new Error('Unauthorized'));
  }
});

// --- CORS & Middleware ---
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

// Debug logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/chat', chatRoutes);

// Serve frontend
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath, { index: false }));
app.get('/', (req, res) => {
// Redirect to auth page
  res.redirect('/auth.html');
});

// --- Socket.IO Chat Logic ---
let onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('🟢 A user connected:', socket.id);

  // Register user when they connect (optional payload enrich)
  socket.on('registerUser', (user) => {
    const merged = { id: socket.user?.id, name: user?.name || 'User' };
    socket.user = merged;
    onlineUsers.set(merged.id, merged);
    io.emit('userOnline', merged);
    console.log(`✅ User registered: ${merged.name} (${merged.id})`);
  });

  // Join specific rooms if needed
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Handle chat messages (must be authenticated)
  socket.on('chatMessage', ({ roomId, message }) => {
    if (!socket.user?.id) return; // ignore if not authed
    const chat = {
      sender: socket.user,
      message,
      time: new Date().toISOString()
    };
    io.to(roomId || 'global').emit('chatMessage', chat);
  });

  // Typing indicators
  socket.on('typing', () => {
    if (!socket.user?.id) return;
    socket.broadcast.emit('typing', socket.user);
  });
  socket.on('stopTyping', () => {
    if (!socket.user?.id) return;
    socket.broadcast.emit('stopTyping', socket.user);
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.user?.id) {
      onlineUsers.delete(socket.user.id);
      io.emit('userOffline', socket.user);
      console.log(`🔴 User disconnected: ${socket.user.name || socket.user.id}`);
    } else {
      console.log(`🔴 Socket disconnected: ${socket.id}`);
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('🔥 Internal server error:', err);
  res.status(500).json({ message: 'Something went wrong' });
});

// Start server
const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
