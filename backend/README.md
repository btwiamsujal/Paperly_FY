# Paparly Chat Backend

A complete real-time chat backend system built with Node.js, Express, MongoDB, and Socket.io, designed to integrate with Instagram-style chat frontend. Supports text, voice, media (images/videos), and document messaging with real-time features.

## ✨ Features

### Core Messaging
- **Four Message Types**: Text, Voice (MP3/WAV), Media (Images/Videos), Documents (PDF/PPT/DOCX)
- **Real-time Communication**: Instant message delivery using Socket.io
- **Message Status Tracking**: Sent → Delivered → Seen status with real-time updates
- **File Upload Support**: Integrated with Cloudinary for secure file storage
- **Message History**: Paginated conversation history with efficient queries

### Advanced Features
- **Typing Indicators**: Real-time typing status updates
- **User Presence**: Online/Offline status tracking
- **Message Deletion**: Soft delete functionality for senders
- **Message Search**: Search across conversations and message types
- **Reply to Messages**: Thread-like message replies
- **Conversation Management**: Organized chat list with unread counts

### Technical Features
- **JWT Authentication**: Secure user authentication and authorization
- **Database Optimization**: Indexed MongoDB queries for performance
- **File Validation**: Comprehensive file type and size validation
- **Error Handling**: Detailed error responses and logging
- **Scalable Architecture**: Modular design ready for production scaling

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Cloudinary account for file storage

## 🚀 Quick Start

### 1. Clone and Install

```bash
# Navigate to backend directory (assuming you're already in Paparly project)
cd backend

# Install dependencies (already installed based on your package.json)
npm install
```

### 2. Environment Setup

Create a `.env` file in the backend directory:

```env
# Server Configuration
PORT=5002

# Database
MONGO_URI=mongodb://localhost:27017/paparly

# JWT Secret (change this to a secure random string)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Cloudinary Configuration (get these from your Cloudinary dashboard)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### 3. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# macOS with Homebrew
brew services start mongodb/brew/mongodb-community

# Windows (if MongoDB is installed as a service)
net start MongoDB

# Linux (systemd)
sudo systemctl start mongod
```

### 4. Seed Sample Data (Optional)

To populate your database with sample users and conversations for testing:

```bash
node utils/sampleData.js
```

This will create 5 sample users with realistic conversations. Login credentials:
- john@example.com / password123
- jane@example.com / password123
- mike@example.com / password123
- sarah@example.com / password123
- david@example.com / password123

### 5. Start the Server

```bash
# Development mode (with nodemon)
npm run dev

# Production mode
npm start
```

The server will start at `http://localhost:5002`

### 6. Verify Setup

Test the server with a simple API call:

```bash
curl http://localhost:5002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

## 📚 API Documentation

Comprehensive API documentation is available in [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md).

### Quick API Overview

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

#### Messages
- `POST /api/messages/send` - Send message (text/file)
- `GET /api/messages/:userId` - Get conversation
- `PATCH /api/messages/:userId/seen` - Mark messages as seen
- `GET /api/messages/conversations` - Get all conversations
- `DELETE /api/messages/:messageId` - Delete message

## 🔧 Configuration

### File Upload Limits

```javascript
// Current limits (configurable in middleware/upload.js)
Voice: 25MB (MP3, WAV, OGG, WebM)
Media: 50MB (JPEG, PNG, GIF, WebP, MP4, WebM, MOV)
Documents: 50MB (PDF, PPT, PPTX, DOC, DOCX, TXT)
```

### Supported File Types

#### Voice Messages
- **Audio formats**: MP3, WAV, OGG, WebM
- **MIME types**: `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/webm`

#### Media Messages
- **Images**: JPEG, PNG, GIF, WebP
- **Videos**: MP4, WebM, MOV
- **MIME types**: `image/*`, `video/mp4`, `video/webm`, `video/quicktime`

#### Document Messages
- **Documents**: PDF, PPT, PPTX, DOC, DOCX, TXT
- **MIME types**: `application/pdf`, `application/vnd.ms-powerpoint`, etc.

## 🧪 Testing

### API Testing with curl

```bash
# Register a user
curl -X POST http://localhost:5002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:5002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Send a text message (replace TOKEN with actual JWT token)
curl -X POST http://localhost:5002/api/messages/send \
  -H "Authorization: Bearer TOKEN" \
  -F "receiverId=USER_ID" \
  -F "messageType=text" \
  -F "content=Hello, this is a test message!"

# Send a voice message
curl -X POST http://localhost:5002/api/messages/send \
  -H "Authorization: Bearer TOKEN" \
  -F "receiverId=USER_ID" \
  -F "messageType=voice" \
  -F "file=@path/to/audio.mp3"
```

### Socket.io Testing

Use a Socket.io client test tool or create a simple HTML page:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Socket.io Test</title>
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
</head>
<body>
    <script>
        const socket = io('http://localhost:5002', {
            auth: {
                token: 'YOUR_JWT_TOKEN'
            }
        });

        socket.on('connect', () => {
            console.log('Connected:', socket.id);
        });

        socket.on('newMessage', (data) => {
            console.log('New message:', data);
        });

        // Send a test message
        socket.emit('sendMessage', {
            receiverId: 'RECEIVER_ID',
            messageType: 'text',
            content: 'Hello from Socket.io!'
        });
    </script>
</body>
</html>
```

## 📁 Project Structure

```
backend/
├── config/
│   ├── cloudinary.js     # Cloudinary configuration
│   └── db.js            # MongoDB connection
├── controllers/
│   ├── authController.js     # Authentication logic
│   ├── messageController.js  # Message handling (NEW)
│   └── ...                  # Other controllers
├── middleware/
│   ├── auth.js              # JWT authentication
│   └── upload.js            # File upload handling (NEW)
├── models/
│   ├── User.js              # User schema
│   ├── Message.js           # Enhanced message schema (NEW)
│   ├── Conversation.js      # Conversation schema (NEW)
│   └── ...                 # Other models
├── routes/
│   ├── authRoutes.js        # Auth endpoints
│   ├── messageRoutes.js     # Message endpoints (NEW)
│   └── ...                 # Other routes
├── socket/
│   └── chatSocket.js        # Socket.io chat logic (NEW)
├── utils/
│   ├── cloudStorage.js      # Cloudinary utilities (NEW)
│   ├── notificationHelper.js # Notification utilities (NEW)
│   └── sampleData.js        # Database seeder (NEW)
├── uploads/                 # Temporary file storage
├── .env                    # Environment variables
├── server.js               # Main server file (UPDATED)
├── API_DOCUMENTATION.md    # Complete API docs (NEW)
└── README.md              # This file (NEW)
```

## 🔒 Security

### Production Security Checklist

- [ ] Change `JWT_SECRET` to a strong, unique value
- [ ] Enable MongoDB authentication
- [ ] Use HTTPS in production
- [ ] Set secure CORS origins (remove wildcards)
- [ ] Implement rate limiting
- [ ] Add request validation and sanitization
- [ ] Use environment variables for all secrets
- [ ] Enable MongoDB connection encryption
- [ ] Set up proper logging and monitoring

### Environment Variables for Production

```env
NODE_ENV=production
PORT=5002
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/paparly
JWT_SECRET=your-very-long-and-secure-jwt-secret-key
CLOUDINARY_CLOUD_NAME=production-cloud-name
CLOUDINARY_API_KEY=production-api-key
CLOUDINARY_API_SECRET=production-api-secret
```

## 🚀 Deployment

### Docker Deployment

Create a `Dockerfile`:

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5002
CMD ["node", "server.js"]
```

### Environment-Specific Configurations

#### Development
- Use local MongoDB
- Enable detailed error logs
- CORS allows all origins

#### Production
- Use MongoDB Atlas or secured MongoDB
- Minimal error logs
- Strict CORS policy
- Enable compression
- Use reverse proxy (nginx)

## 🤝 Integration with Frontend

### Frontend Connection Example

```javascript
// Initialize Socket.io connection
const socket = io('http://localhost:5002', {
  auth: {
    token: localStorage.getItem('authToken')
  }
});

// Join a conversation
function openChat(otherUserId) {
  socket.emit('joinConversation', { otherUserId });
}

// Send a message
function sendMessage(receiverId, content, type = 'text', file = null) {
  const formData = new FormData();
  formData.append('receiverId', receiverId);
  formData.append('messageType', type);
  
  if (type === 'text') {
    formData.append('content', content);
  } else {
    formData.append('file', file);
  }

  fetch('/api/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    },
    body: formData
  });
}

// Listen for new messages
socket.on('newMessage', (data) => {
  displayMessage(data.message);
  updateUnreadCount(data.conversation);
});
```

## 📊 Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String (unique),
  password: String (hashed),
  avatar: String (URL),
  bio: String,
  institution: String,
  classrooms: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

### Messages Collection
```javascript
{
  _id: ObjectId,
  senderId: ObjectId (ref: User),
  receiverId: ObjectId (ref: User),
  messageType: String (text|voice|media|document),
  content: String (for text messages),
  fileUrl: String (for file messages),
  fileName: String,
  fileSize: Number,
  mimeType: String,
  duration: Number (for voice),
  status: String (sent|delivered|seen),
  isDeleted: Boolean,
  deletedAt: Date,
  replyTo: ObjectId (ref: Message),
  createdAt: Date,
  updatedAt: Date
}
```

### Conversations Collection
```javascript
{
  _id: ObjectId,
  participants: [ObjectId] (refs: User),
  lastMessage: ObjectId (ref: Message),
  lastActivity: Date,
  unreadCount: Map (userId -> count),
  isArchived: Boolean,
  archivedBy: [ObjectId],
  createdAt: Date,
  updatedAt: Date
}
```

## 🛠 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   ```
   Solution: Ensure MongoDB is running and connection string is correct
   ```

2. **File Upload Fails**
   ```
   Solution: Check Cloudinary credentials and file size limits
   ```

3. **Socket.io Connection Issues**
   ```
   Solution: Verify JWT token and CORS configuration
   ```

4. **Authentication Errors**
   ```
   Solution: Check JWT_SECRET and token expiration
   ```

### Debug Mode

Enable detailed logging:

```env
NODE_ENV=development
DEBUG=paparly:*
```

### Health Check Endpoint

```bash
curl http://localhost:5002/api/health
```

## 📈 Performance Optimization

### Database Optimization
- MongoDB indexes on frequently queried fields
- Connection pooling
- Aggregation pipelines for complex queries

### File Handling
- Cloudinary automatic optimization
- File compression before upload
- CDN for global file delivery

### Real-time Optimization
- Socket.io clustering with Redis
- Message queuing for high traffic
- Connection throttling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For questions and support:
- Check the [API Documentation](./API_DOCUMENTATION.md)
- Review the troubleshooting section
- Create an issue on GitHub

---

**Ready to integrate with your Instagram-style frontend!** 🎉

The backend now provides all the necessary endpoints and real-time functionality for a complete chat experience. Your frontend can connect to these APIs and Socket.io events to create a seamless messaging interface.