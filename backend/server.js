require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const classroomRoutes = require('./routes/classroomRoutes');
const postRoutes = require('./routes/postRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const userRoutes = require('./routes/userRoutes');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { initializeChatSocket } = require('./socket/chatSocket');

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

// Initialize enhanced chat socket functionality
initializeChatSocket(io);

// Legacy socket authentication - now handled in chatSocket.js
// Keep for backward compatibility with existing chat
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
app.use(cookieParser());
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

// Make io and onlineUsers accessible to controllers
app.set('io', io);
app.set('onlineUsers', io.onlineUsers);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/chat', chatRoutes); // Keep old chat for backward compatibility
app.use('/api/messages', messageRoutes); // New enhanced messaging system
app.use('/api/users', userRoutes); // User management and search
app.use('/api/ai-summary', require('./routes/aiSummaryRoutes')); // AI Summaries

// Protect frontend HTML pages by requiring a valid auth cookie on all HTML except the auth page
const LOGIN_PAGE = '/frontend/auth/auth.html';
function protectHtmlMiddleware(req, res, next) {
  // Only guard direct requests for HTML documents
  if (req.method === 'GET' && req.path.endsWith('.html')) {
    const isPublic = req.path === LOGIN_PAGE || req.path === '/login.html';
    if (isPublic) return next();
    const token = req.cookies?.token;
    if (!token) {
      return res.redirect(LOGIN_PAGE);
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Optionally attach user for templates (not used here)
      req.user = { id: decoded.id };
      return next();
    } catch (e) {
      return res.redirect(LOGIN_PAGE);
    }
  }
  next();
}

// Serve frontend
const frontendPath = path.join(__dirname, '..');
// Apply protection BEFORE static serving so HTML is gated by auth cookie
app.use(protectHtmlMiddleware);
// Serve static without implicit index; redirect root to explicit auth page under /frontend/auth/auth.html
app.use(express.static(frontendPath, { index: false }));
app.get('/', (req, res) => {
  res.redirect(LOGIN_PAGE);
});

// --- Legacy Socket.IO Chat Logic (commented out, replaced by enhanced version) ---
// let onlineUsers = new Map();
//
// io.on('connection', (socket) => {
//   console.log('🟢 A user connected:', socket.id);
//
//   // Register user when they connect (optional payload enrich)
//   socket.on('registerUser', (user) => {
//     const merged = { id: socket.user?.id, name: user?.name || 'User' };
//     socket.user = merged;
//     onlineUsers.set(merged.id, merged);
//     io.emit('userOnline', merged);
//     console.log(`✅ User registered: ${merged.name} (${merged.id})`);
//   });
//
//   // Join specific rooms if needed
//   socket.on('joinRoom', (roomId) => {
//     socket.join(roomId);
//     console.log(`User ${socket.id} joined room ${roomId}`);
//   });
//
//   // Handle chat messages (must be authenticated)
//   socket.on('chatMessage', ({ roomId, message }) => {
//     if (!socket.user?.id) return; // ignore if not authed
//     const chat = {
//       sender: socket.user,
//       message,
//       time: new Date().toISOString()
//     };
//     io.to(roomId || 'global').emit('chatMessage', chat);
//   });
//
//   // Typing indicators
//   socket.on('typing', () => {
//     if (!socket.user?.id) return;
//     socket.broadcast.emit('typing', socket.user);
//   });
//   socket.on('stopTyping', () => {
//     if (!socket.user?.id) return;
//     socket.broadcast.emit('stopTyping', socket.user);
//   });
//
//   // Disconnect
//   socket.on('disconnect', () => {
//     if (socket.user?.id) {
//       onlineUsers.delete(socket.user.id);
//       io.emit('userOffline', socket.user);
//       console.log(`🔴 User disconnected: ${socket.user.name || socket.user.id}`);
//     } else {
//       console.log(`🔴 Socket disconnected: ${socket.id}`);
//     }
//   });
// });

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
