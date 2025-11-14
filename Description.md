# Paperly – Project & Function-Level Documentation

> This document describes the overall purpose and architecture of Paperly and walks through the main modules and functions (backend and frontend) with their primary use cases.

---

## 1. High-Level Overview

**Paperly** is a web-based productivity and collaboration platform focused on learning and study workflows. It combines:

- User authentication and profile management
- Shared **classrooms** with role-based membership (admin/user)
- File & resource management (Cloudinary-backed uploads)
- Personal and shared **notes** with rich media support
- An **AI PDF summarizer** powered by Groq/OpenAI
- Real-time **1:1 messaging** with Socket.IO (text, media, voice, documents)
- A dashboard and home page with UI enhancements and navigation sidebar

The repo is a monorepo consisting of:

- **Root**: Vite-based dev tooling, plus vanilla JS frontend files.
- **`backend/`**: Node.js + Express + MongoDB API server with Socket.IO for real-time chat.
- **`frontend/`**: Static HTML/JS single-page-like experience per feature area (auth, dashboard, notes, classroom, chatbox, AI, settings).

---

## 2. Architecture Overview

### 2.1 Root

**`package.json` (root)**
- Defines Vite dev server and runs backend dev server in parallel via `concurrently`.
- Main scripts:
  - `dev`: runs `vite` (frontend) and `backend` dev server concurrently.
  - `dev:client`: runs the Vite dev server.
  - `dev:server`: runs `npm run dev` inside `backend/`.

### 2.2 Backend Stack

- **Runtime**: Node.js (CommonJS modules).
- **Framework**: Express 5.
- **Database**: MongoDB via Mongoose.
- **Real-time**: Socket.IO (server) for messaging.
- **Auth**: JWT (tokens sent via header and/or HttpOnly cookie).
- **Storage**: Cloudinary (raw/image/video) + local temporary disk storage for uploads.
- **AI**: Groq-compatible OpenAI API for PDF and content summarisation.

Main entrypoint:

- **`backend/server.js`** – bootstraps Express, connects to MongoDB, configures Socket.IO, CORS, auth-protected static frontend, and mounts all API routes.

### 2.3 Frontend Stack

- Vite/vanilla JS, no framework.
- Each feature area gets its own HTML + JS bundle, using:
  - `frontend/common/sidebar.js` for global navigation.
  - `frontend/common/loader.js` for loading overlay.
  - LocalStorage for persisting JWT token and some per-user settings/history.
  - Fetch/XHR to call backend APIs.

---

## 3. Backend – Files, Modules & Functions

### 3.1 Server & Core Config

#### `backend/server.js`

- **`connectDB()`** (imported from `config/db`)
  - Connects to MongoDB using `MONGO_URI` and optional `MONGO_DB_NAME`.
- **`initializeChatSocket(io)`** (imported from `socket/chatSocket`)
  - Attaches Socket.IO authentication middleware.
  - Sets up all real-time chat events (see section 3.7).
- **CORS and Express setup**
  - Defines `ALLOWED_ORIGINS` and configures CORS (origins, methods, headers, credentials).
  - Adds `cookieParser` and `express.json()` middleware.
  - Sets up `/uploads` static directory, creating it if missing.
  - Adds a request logger middleware.
- **Socket.IO auth middleware (legacy)**
  - Middleware that reads JWT token from `socket.handshake.auth.token` or `Authorization` header.
  - Verifies JWT and attaches `socket.user = { id }`.
  - Kept for compatibility with legacy chat flows.
- **`protectHtmlMiddleware(req, res, next)`**
  - Guards direct `GET` requests to `.html` pages.
  - Allows only login/auth pages without token.
  - For other HTML pages, requires a valid `token` cookie (JWT). Redirects to `frontend/auth/auth.html` if missing or invalid.
- **Static frontend serving**
  - Serves files from project root (one level above `backend`).
  - Uses `protectHtmlMiddleware` before `express.static` to gate access.
  - Root `/` redirects to login page.
- **Route mounting**
  - `/api/auth` → `authRoutes`
  - `/api/files` → `fileRoutes`
  - `/api/posts` → `postRoutes`
  - `/api/classrooms` → `classroomRoutes`
  - `/api/chat` → `chatRoutes` (legacy chat)
  - `/api/messages` → `messageRoutes` (new 1:1 messaging system)
  - `/api/users` → `userRoutes`
- **Express error handling**
  - 404 handler returns `{ message: 'API route not found' }`.
  - 500 handler logs error and returns generic error JSON.
- **Server start**
  - Starts HTTP server with Socket.IO at `PORT` (default 5002).

#### `backend/config/db.js`

- **`connectDB()`**
  - Asynchronously connects to MongoDB using Mongoose.
  - Options: `useNewUrlParser`, `useUnifiedTopology`, `dbName` from env or default `paperly`.
  - Logs connected DB name; exits process on failure.

#### `backend/config/cloudinary.js`

- Configures Cloudinary v2 using env vars.
- Exports the configured `cloudinary` instance.

### 3.2 Models (Mongoose)

#### `backend/models/User.js`

- **Schema fields**
  - `name`, `email` (unique, lowercase, trimmed), `password`.
  - `role` in `{ 'user', 'admin' }`, default `user`.
  - Optional `avatar`, `institution`, `bio`.
  - `classrooms`: list of `Classroom` references the user belongs to.
- Used by auth, classroom, messaging, and user search.

#### `backend/models/Classroom.js`

- Represents a classroom owned by a specific user.
- Fields: `name`, `description`, unique `code`, `createdBy` (User), `members`.
- `members` items: `{ user, role ('admin'|'user'), joinedAt }`.

#### `backend/models/ClassroomContent.js`

- Stored content inside/around classrooms (posts, notes, resources).
- Fields:
  - `classroom` (optional): reference to `Classroom`.
  - `type`: `'post' | 'note' | 'resource'` (default `resource`).
  - `title`, `content`, `fileUrl` (Cloudinary URL), optional `fileId`, `fileName`.
  - `createdBy`: User.

#### `backend/models/Resource.js`

- Represents uploaded resources for classrooms (older or simpler resource abstraction).
- Fields: `classroom`, `filename`, `originalName`, `fileUrl`, `uploadedBy`, `uploadedAt`.

#### `backend/models/Note.js`

- Represents user notes.
- Fields:
  - `title`
  - `type`: `'text' | 'image' | 'pdf'`
  - `content` (for text notes)
  - `fileUrl` (for image/pdf via Cloudinary)
  - `tags` array
  - `uploadedBy` (User), `date`

#### `backend/models/File.js`

> Note there is an inconsistency between this model and `fileController.js`. This model represents a general stored file.

- Fields: `name`, `fileUrl`, `size`, `mimetype`, `uploadedBy`, `createdAt`.
- Used by `fileRoutes` (upload + PDF proxy/analyze) and `fileController.js` (classroom file support), though naming differs.

#### `backend/models/Message.js`

- Represents a message in 1:1 messaging.
- Fields:
  - `senderId`, `receiverId` (User references).
  - `messageType`: `'text' | 'voice' | 'media' | 'document'`.
  - `content` for text messages.
  - `fileUrl`, optional `fileName`, `fileSize`, `mimeType`, `duration`.
  - `status`: `'sent' | 'delivered' | 'seen'`.
  - Soft-delete fields: `isDeleted`, `deletedAt`.
  - `replyTo`: optional reference to another `Message`.
  - Timestamps.
- Indexes: conversation query indices, status index.
- **Static methods**:
  - `getConversation(user1Id, user2Id, options)`
    - Returns paginated messages between two users (excluding deleted).
    - Populates `senderId`, `receiverId`, and `replyTo`.
  - `markAsSeen(senderId, receiverId)`
    - Marks all messages from `senderId` to `receiverId` as `seen`.
  - `getUnreadCount(userId)`
    - Counts unread (not `seen` and not deleted) messages for a user.

#### `backend/models/Conversation.js`

- Tracks aggregate conversation state between two users.
- Fields:
  - `participants` (two users, sorted for consistency).
  - `lastMessage`, `lastActivity`.
  - `unreadCount`: `Map<userId, number>` for per-user unread counter.
  - `isArchived`, `archivedBy` (not fully wired yet).
- Hooks & indexes:
  - Pre-save hook sorts `participants`.
  - Indexes on `participants` and `lastActivity`.
- **Statics**:
  - `findOrCreate(user1Id, user2Id)`
    - Finds an existing conversation or creates one with unread counts initialized to 0 for both.
- **Methods**:
  - `getUnreadCountForUser(userId)` → unread count for given user.
  - `incrementUnreadCount(userId)` → increments and saves.
  - `resetUnreadCount(userId)` → resets and saves.

#### `backend/models/chat.js`

- Legacy/alternative chat model for `chatController` and `/api/chat`.
- Fields: `sender` (User), `message` text, `attachments` (array of URLs).

### 3.3 Auth & User Controllers

#### `backend/controllers/authController.js`

- **`setAuthCookie(res, token)`** (internal helper)
  - Sets HttpOnly `token` cookie with appropriate security flags.

- **`register(req, res)`**
  - Validates and normalizes email.
  - Checks for existing user (case-insensitive regex).
  - Hashes password with bcrypt.
  - Creates new `User` with default `role = 'user'`.
  - Creates JWT token, sets cookie, and returns `{token, user}` (without password).

- **`login(req, res)`**
  - Normalizes email and builds a regex tolerant of leading/trailing spaces.
  - Locates user by normalized email.
  - Verifies password with bcrypt.
  - Signs JWT and sets cookie.
  - Returns `{token, user}`.

- **`changePassword(req, res)`**
  - Requires `auth` middleware (user in `req.user`).
  - Verifies current password by comparing with hashed one.
  - Hashes new password and updates user.

- **`deleteAccount(req, res)`**
  - Deletes the current authenticated user.

- **`logout(_req, res)`**
  - Clears `token` cookie and returns confirmation JSON.

- **`me(req, res)`**
  - Fetches current user by `req.user.id` and returns user without password.

- **`updateProfile(req, res)`**
  - Allows updating `name`, `institution`, `bio` for current user.
  - Returns updated user object without password.

#### `backend/routes/authRoutes.js`

- **POST `/register`** → `register`
- **POST `/login`** → `login`
- **POST `/logout`** → `logout`
- **GET `/me`** → `auth` → `me`
- **PUT `/update-profile`** → `auth` → `updateProfile`
- **PUT `/change-password`** → `auth` → `changePassword`
- **DELETE `/delete-account`** → `auth` → `deleteAccount`

#### `backend/routes/userRoutes.js`

- **GET `/search`** → `auth`
  - Query param `q`; searches users by name or email (case-insensitive), excluding the current user.
- **GET `/me`** → `auth`
  - Returns current user profile without password (similar to `auth/me`).
- **GET `/:userId`** → `auth`
  - Returns specific user by ID.

### 3.4 Auth & Classroom Middleware

#### `backend/middleware/auth.js`

- **`auth(req, res, next)`**
  - Reads JWT from `Authorization` header (Bearer) or `token` cookie.
  - Verifies token and sets `req.user` with `id` and `_id`.
  - On failure, returns 401.

#### `backend/middleware/authMiddleware.js`

- **`requireAdmin(getUserById)`** (factory)
  - Returns Express middleware.
  - Fetches user via `getUserById` and ensures `user.role === 'admin'`.
  - Used where a global admin role is required.

#### `backend/middleware/classroomAuth.js`

- **`checkClassroomAdmin(req, res, next)`**
  - Loads classroom by `classroomId` or `id` param.
  - Allows if `createdBy` matches current user or if user is in `members` with role `'admin'`.
  - Sets `req.isClassroomCreator` accordingly.

- **`checkClassroomMember(req, res, next)`**
  - Ensures current user is either creator or listed in `members` of classroom.
  - Sets `req.userRole` and `req.isClassroomCreator`.

#### `backend/middleware/upload.js` (Messaging uploads)

- **`fileFilter(req, file, cb)`**
  - Validates file type according to `messageType` (`voice`, `media`, `document`).
  - Rejects invalid type or unsupported `messageType`.

- **`storage` (multer.diskStorage)**
  - Stores files to `backend/uploads`, generating unique filenames.

- **`upload`**
  - Multer instance with 50MB limit.

- **`uploadSingle`**
  - `upload.single('file')` middleware used in message sending.

- **`handleUploadError(err, req, res, next)`**
  - Converts Multer errors into structured JSON errors (size, unexpected field, etc.).

- **`validateMessageData(req, res, next)`**
  - Ensures `receiverId`, `messageType` present and valid.
  - For `text`, requires `content`; for others, requires `req.file`.

- **`getFileCategory(mimetype)`**
  - Helper to get a high-level category (`voice`, `media`, `document`, `unknown`).

### 3.5 Classroom & Content Controllers

#### `backend/controllers/classroomController.js`

- **Helpers**
  - `generateCode()` – random 3-byte hex string used as join-code.

- **`createClassroom(req, res)`**
  - Requires `auth`.
  - Creates classroom with `name`, `description`, unique code, `createdBy = req.user.id`.
  - Adds creator as member with `role: 'admin'` and links classroom to user.

- **`joinClassroom(req, res)`**
  - Requires `auth`.
  - Looks up classroom by `code` and adds user as member if not already present (role `user`).
  - Also adds classroom to user’s `classrooms` array.

- **`getMyClassrooms(req, res)`**
  - Fetches user and populates `classrooms`, returning them.

- **`deleteClassroom(req, res)`**
  - Only the creator can delete.
  - Deletes all related `ClassroomContent`, removes classroom from members’ `classrooms` list, then deletes classroom.

- **`promoteUser(req, res)`**
  - Classroom admin/creator only.
  - Promotes a member to `role: 'admin'` if currently `user`.

- **`demoteUser(req, res)`**
  - Admin-only, cannot demote creator.
  - Changes `role` from `admin` to `user`.

- **`removeUser(req, res)`**
  - Admin-only, cannot remove creator.
  - Removes member from `members` and from the user’s `classrooms` list.

- **`getClassroomMembers(req, res)`**
  - Returns `members` array with user details and `createdBy` metadata.

#### `backend/controllers/postController.js` (ClassroomContent + AI summarizer)

- **`addContent(req, res)`**
  - Requires `auth`.
  - Creates `ClassroomContent` entry with `type`, `title`, `content`, optional `fileUrl`, `classroom` and `createdBy`.

- **`getClassroomContent(req, res)`**
  - Lists content for a classroom, most recent first.

- **`summarizeContent(req, res)`**
  - Uses Groq/OpenAI chat completion to summarize a given `ClassroomContent` document’s `content`.
  - Returns original content and generated summary.

#### `backend/routes/classroomRoutes.js` & `routes/postRoutes.js`

- `classroomRoutes`:
  - `POST /create` → `createClassroom`
  - `POST /join` → `joinClassroom`
  - `GET /my` → `getMyClassrooms`
  - `POST /:id/add` → `postController.addContent`
  - `DELETE /:id` → `deleteClassroom`
  - `GET /:classroomId/members` → `checkClassroomMember` → `getClassroomMembers`
  - `PATCH /:classroomId/members/:userId/promote` → `checkClassroomAdmin` → `promoteUser`
  - `PATCH /:classroomId/members/:userId/demote` → `checkClassroomAdmin` → `demoteUser`
  - `DELETE /:classroomId/members/:userId` → `checkClassroomAdmin` → `removeUser`

- `postRoutes` (newer content API):
  - `POST /:classroomId/add` → `addContent`
  - `GET /:classroomId` → `getClassroomContent`
  - `POST /summarize/:contentId` → `summarizeContent`

### 3.6 Files, Notes & AI PDF APIs

#### `backend/routes/fileRoutes.js`

This is the main file + note + AI PDF API.

- **Upload** – `POST /upload` (auth)
  - Uses `multer.memoryStorage` to receive file.
  - If image: uploads as `resource_type: 'image'`, with server-side resize + quality optimization.
  - Otherwise: uploads as `resource_type: 'raw'`.
  - Saves metadata in `File` collection and returns `fileUrl` and created `File` record.

- **Notes CRUD**
  - `POST /notes` (auth)
    - Creates a `Note` with `title`, `type`, `content`, `tags`, `fileUrl` and `uploadedBy`.
  - `GET /notes` (auth)
    - Returns all notes (with uploader populated) sorted by `date` desc.
  - `PUT /notes/:id` (auth)
    - Allows note owner to update fields.
  - `DELETE /notes/:id` (auth)
    - Allows note owner to delete a note.

- **`GET /pdf` (auth)**
  - Proxy endpoint to serve remote PDF from a given `src` URL inline, with `Content-Type: application/pdf`.

- **AI Helper functions** (internal):
  - `extractPdfText(fileUrl)` – fetch + pdf-parse a PDF from URL.
  - `askAI(prompt)` – generic Groq chat completion returning plain text.
  - `askAIJson(prompt)` – same but expects strict JSON, with fallback parsing.
  - `chunkTextByParagraphs`, `parseList`, `summarizeLarge(text)` – chunk PDF text and build structured `overview`, `key_points`, `highlights` summary.

- **AI endpoints**
  - `POST /analyze-pdf-url` (auth)
    - Request `{ fileUrl }`; extracts text and runs `summarizeLarge` to return `{ overview, key_points, highlights }`.
  - `POST /analyze-key-points` (auth)
    - Extracts only key points as short bullet sentences.
  - `POST /analyze-highlights` (auth)
    - Extracts only highlight phrases (<= 15 words each).

#### `backend/controllers/fileController.js`

> ES module controller used for classroom-focused file upload & PDF AI analysis. Note the model differs from `File` in `fileRoutes`.

- **`uploadBufferToCloudinary(file)`** (helper)
  - Streams a buffer to Cloudinary as `resource_type: 'raw'` in `paperly_uploads` folder.

- **`uploadFile(req, res)`**
  - Expects a single file (`multer` buffer on `req.file`).
  - Uploads to Cloudinary, logs metadata, and creates a `File` document with `classroomId` param.

- **`getFiles(req, res)`**
  - Lists `File` documents for a given `classroomId`.

- **`analyzePdf(req, res)`**
  - Fetches `File` document by `fileId`.
  - Downloads PDF from its `path` (Cloudinary URL or local path), runs `pdf-parse`, and uses Groq AI to produce structured summary.

### 3.7 Messaging & Real-time Chat

#### `backend/controllers/messageController.js`

- **`sendMessage(req, res)`** – `POST /api/messages/send`
  - Validates receiver exists.
  - Builds `messageData`:
    - For `text`: uses `content`.
    - For file-based messages (voice/media/document): reads uploaded file (from `uploadSingle`), sends to Cloudinary via `uploadToCloudinary`, and stores `fileUrl`, `fileName`, `fileSize`, `mimeType`, `duration`.
  - Optional `replyTo` references another message if valid.
  - Creates `Message`, populates sender/receiver and optional `replyTo`.
  - Updates associated `Conversation` (via `Conversation.findOrCreate`), sets `lastMessage`, increments unread for receiver.
  - Emits `newMessage` via Socket.IO to `user_{receiverId}` room, with `message` and conversation info.
  - If receiver is online (by `onlineUsers` map), upgrades message status to `delivered`.

- **`getMessages(req, res)`** – `GET /api/messages/:userId`
  - Validates other user exists.
  - Uses `Message.getConversation` with pagination (`page`, `limit`, optional `before` timestamp) to fetch messages.
  - Reverses messages to show oldest first and attaches basic conversation info (unread count, `lastActivity`).
  - Marks any `sent` messages from other user to current as `delivered`.

- **`markMessagesAsSeen(req, res)`** – `PATCH /api/messages/:userId/seen`
  - Marks messages from `userId` → current as `seen`.
  - Resets unread count in `Conversation`.
  - Emits `messagesSeen` event to sender’s Socket.IO room.

- **`getConversations(req, res)`** – `GET /api/messages/conversations`
  - Finds all conversations where current user is a participant and `lastMessage` exists.
  - Populates `participants` and `lastMessage`, sorts by `lastActivity` desc.
  - Returns list of `{ id, user (other participant), lastMessage, unreadCount, lastActivity }` with pagination.

- **`deleteMessage(req, res)`** – `DELETE /api/messages/:messageId`
  - Only sender can soft-delete a message (`isDeleted`, `deletedAt`).
  - Emits `messageDeleted` event to receiver.

- **`getUnreadCount(req, res)`** – `GET /api/messages/unread/count`
  - Uses `Message.getUnreadCount` to get total unread messages for current user.

- **`searchMessages(req, res)`** – `GET /api/messages/search`
  - Search query param `query`, optional `userId`, `messageType`, and `limit`.
  - Filters messages where current user is sender or receiver, non-deleted, and `content` matches query (case-insensitive).
  - Optional filter to a specific conversation or message type.

#### `backend/routes/messageRoutes.js`

- Applies `auth` to all routes.
- `POST /send` → `uploadSingle` + `handleUploadError` + `validateMessageData` → `sendMessage`.
- `GET /conversations` → `getConversations`.
- `GET /unread/count` → `getUnreadCount`.
- `GET /search` → `searchMessages`.
- `GET /:userId` → `getMessages`.
- `PATCH /:userId/seen` → `markMessagesAsSeen`.
- `DELETE /:messageId` → `deleteMessage`.

#### `backend/socket/chatSocket.js`

- **`authenticateSocket(socket, next)`**
  - Reads JWT from `handshake.auth.token` or header, verifies, loads `User` and attaches `socket.userId` and `socket.user`.

- **`initializeChatSocket(io)`**
  - Attaches `authenticateSocket` middleware.
  - On `connection`:
    - Adds user to `onlineUsers` map.
    - Joins the user to room `user_{userId}`.
    - Broadcasts `userOnline` event.
    - Emits current `onlineUsers` to the newly connected client.

  - Listens to events:
    - **`joinConversation({ otherUserId })`**
      - Joins per-conversation room, marks pending `sent` messages as `delivered`, and emits `messagesDelivered` to the other user.
    - **`leaveConversation({ otherUserId })`**
      - Leaves conversation room.
    - **`sendMessage(data)`**
      - Backup real-time-only send path (text only). Creates `Message`, updates `Conversation`, increments unread, possibly marks as `delivered`, emits `newMessage` to receiver room, and `messageSent` to sender.
    - **`startTyping({ receiverId })` / `stopTyping({ receiverId })`**
      - Maintains `typingUsers` map and emits `startTyping` / `stopTyping` events to receivers with 3s timeout.
    - **`markAsSeen({ senderId, conversationId })`**
      - Marks messages `seen`, resets unread count, emits `messagesSeen` to sender.
    - **`updateStatus({ status })`**
      - Updates user status (`online`, `away`, `busy`), broadcasts `userStatusUpdate`.
    - **`deleteMessage({ messageId, receiverId })`**
      - Soft-deletes message and notifies receiver and sender.
    - **`initiateCall({ receiverId, callType })` & `callResponse({ callerId, accepted })`**
      - Events reserved for future voice/video calling.
  - On `disconnect`:
    - Clears typing timeout, updates lastSeen, marks user as offline, removes from `onlineUsers`, broadcasts `userOffline`.

- Exports: `initializeChatSocket`, `onlineUsers`, `typingUsers`.

#### `backend/controllers/chatController.js` + `routes/chatRoutes.js` (legacy chat)

- **`getChats(req, res)`** – lists all `Chat` messages with populated sender, sorted oldest-first.
- **`sendChat(req, res)`** – creates `Chat` with text and optional Cloudinary attachments (per-file upload in `chat_attachments` folder).
- Routes:
  - `GET /` (auth) → `getChats`
  - `POST /` (auth, `upload.array('attachments', 5)`) → `sendChat`

### 3.8 Cloudinary & Notification Utilities

#### `backend/utils/cloudStorage.js`

- **`uploadToCloudinary(filePath, messageType, fileName)`**
  - Chooses `resource_type`, folder and transformations based on `messageType` and file extension.
  - Deletes local file after upload.
  - Returns details including `url`, `bytes`, `duration`, etc.

- **`deleteFromCloudinary(publicId, resourceType)`**
  - Deletes a Cloudinary asset.

- **`generateVideoThumbnail(publicId)`**
  - Generates a thumbnail URL for video assets.

- **`getFileInfo(publicId, resourceType)`**
  - Retrieves detailed metadata from Cloudinary.

- **`validateFile(filePath, messageType)`**
  - Checks size limits per message type.

#### `backend/utils/notificationHelper.js`

- Defines notification types constants.
- **`createNotification(type, data, recipientId)`** – returns a notification object (id, type, data, recipientId, timestamps).
- **`sendPushNotification(userId, title, body, data)`** – placeholder for FCM/APNs/etc.
- **`sendEmailNotification(userEmail, subject, htmlContent)`** – placeholder for email providers.
- **`formatMessageForNotification(message)`** – formats message as notification detail (title/body/avatar/messageId).
- **`getUnreadConversationsCount(userId)`** – counts conversations with `unreadCount[userId] > 0`.
- **`markConversationAsRead(userId, conversationId)`** – resets unread count for user in conversation.
- **`getConversationPreview(conversationId, limit)`** – returns conversation w/ last few messages.
- **`generateConversationSummary(userId, otherUserId)`** – returns summary: other user, unreadCount, hasUnread.
- **`batchUpdateMessageStatus(messageIds, status)`** – bulk status update.
- **`cleanupDeletedMessages(daysOld)`** – permanently deletes soft-deleted messages older than `daysOld`.

#### `backend/utils/sampleData.js`

- Provides utilities to seed database with demo users and messages.
- **`sampleUsers`** – array with default demo users.
- **`getSampleMessagesData(users)`** – generates message pairs for those users.
- **`hashPassword(password)`** – bcrypt wrapper.
- **`createSampleUsers()`** – creates users in DB.
- **`createSampleMessages(users)`** – creates messages and conversations.
- **`seedDatabase()`** – clears and seeds DB with sample users/messages.
- **`clearDatabase()`** – deletes all users/messages/conversations.
- **`generateRealisticTimestamp(daysAgo, hoursAgo, minutesAgo)`** – returns older timestamps.
- **`createConversationBetween(user1Id, user2Id, messageCount)`** – generates a conversation with given number of messages.
- If run as a script (`node sampleData.js`), it connects to DB and seeds.

### 3.9 Additional Backend Files

#### `backend/chat-server.js`

- A minimal Socket.IO chat server (likely for early testing):
  - Listens at port 3000.
  - Broadcasts `"chat message"` events to all connected clients.

---

## 4. Frontend – Files, Classes & Methods

All frontend modules are vanilla JS classes or scripts that wire UI to backend APIs.

### 4.1 Common Utilities

#### `frontend/common/loader.js`

- IIFE that injects a full-screen loading overlay and exposes a global `Loader` object:
  - `Loader.show()` / `Loader.hide()` – increments/decrements a counter and toggles overlay visibility.
  - `_forceHide()` – internal helper to hide overlay directly.
- Used in auth and other pages to show loading states.

#### `frontend/common/sidebar.js`

- **`Sidebar` class** – renders left navigation sidebar and manages responsive behavior.
  - `constructor()` – detects mobile state, sets `isCollapsed`, calls init.
  - `initSidebar()` – injects sidebar HTML and marks active nav item based on current route.
  - `initEventListeners()` – binds toggle button, click-outside on mobile, window resize, and hover effects.
  - `toggleSidebar()` – toggles collapsed class and adjusts `.main-content` margin.
  - `handleResize()` – updates collapsed state based on window width.
  - `setActiveNavItem()` – highlights nav item matching current page.
- **`logout()` (global)**
  - POST `/api/auth/logout` (cookies), clears `localStorage` token/user, redirects to `auth.html`.
- On DOMContentLoaded: applies stored theme (light/dark/auto) and instantiates `Sidebar`.

### 4.2 Auth UI

#### `frontend/auth/auth.js`

- **`AuthManager` class**
  - `constructor()` – sets up UI event listeners for tabs and forms.
  - `initEventListeners()` – handles tab clicks and form submissions.
  - `switchTab(tabName)` – switches between login/signup/forgot views with animation.
  - `handleFormSubmit(e)` – generic submit handler that shows loader and delegates to correct auth handler.
  - `processAuth(formType, formData)` – routes to `handleLogin`, `handleSignup`, or `handleForgotPassword`.
  - `handleLogin(formData)` – POST `/api/auth/login` with email/password; stores token and redirects to home.
  - `handleSignup(formData)` – POST `/api/auth/register`; on success, shows message and switches to login tab.
  - `handleForgotPassword(formData)` – dummy handler that simulates sending reset email.
  - `showMessage(message, type)` – reusable toast-style message overlay.
- On DOMContentLoaded: instantiates `AuthManager` and sets `scrollBehavior = 'smooth'`.

#### `login.js` (root)

- Simple login page script (alternative to `auth.js`):
  - Reads email/password and POSTs to `/api/auth/login`.
  - Stores token and redirects to `/` if successful.

### 4.3 AI PDF Summarizer

#### `frontend/ai/ai.js`

- **`AISummarizerManager` class**
  - Manages end-to-end AI PDF summarization flow.
  - **State**: `currentDocument`, `summaryData` (overview, key_points, highlights), `summaryHistory`, `fileUrl`, `_pending` map.
  - `init()` – attaches event listeners, renders history.
  - `fetchWithAuth(url, options)` – wrapper around `fetch` that injects JWT in `Authorization` header and auto-redirects to login on 401.
  - `initEventListeners()` – wires file input, drag-and-drop, tab clicks, download/share buttons.
  - `handleFileUpload(file)` – validates PDF & size, sets `currentDocument`, triggers upload & analysis:
    - Uploads PDF via `POST /api/files/upload`.
    - Extracts `fileUrl` from response.
    - Calls `fetchSummary('overview')` then prefetches key points and highlights.
    - When overview is in, toggles UI from processing to results.
  - `switchSummaryTab(tab)` – switches tab, lazily fetches missing summary data for a tab.
  - `fetchSummary(tab)` – calls backend AI endpoints: `/analyze-pdf-url`, `/analyze-key-points`, `/analyze-highlights` with `fileUrl`.
  - `startProcessing()` / `setProcessingStep(stepIndex)` – manage three-step processing visual.
  - `showResults(summaryData)` – populates results view and writes entry into local history.
  - `populateResults(summaryData)` – updates document info, overview text, key points and highlights sections.
  - History: `saveToHistory`, `renderHistory`, `loadFromHistory` – stored in `localStorage` under `summaryHistory`.
  - Download/share: `downloadSummary()` (downloads JSON), `shareSummary()` (Web Share API if supported).
  - Helpers: `formatFileSize`, `formatDate`, `loadHistory`, `showMessage`, `escapeHtml`.
- On DOMContentLoaded:
  - Ensures token exists; if not, redirects to login.
  - Instantiates `AISummarizerManager` and exposes helper functions globally.

### 4.4 Chatbox (New UI) & Legacy Chat App

#### `frontend/chatbox/chatbox.js` – ChatboxManager

- **`ChatboxManager` class** – production chat UI used for `/frontend/chatbox/chatbox.html`.
  - Holds `socket`, `currentChat`, `currentUser`, `conversations`, `onlineUsers`, `searchTimeout`, `typingTimeout`, and flags.
  - `detectMessageType(mimeType)` – logic to map MIME type to `media`, `voice`, or `document`.
  - `init()` – checks authentication token, initializes Socket.IO, loads current user, sets up event listeners, loads conversations, shows a welcome state.
  - `initializeSocket(token)` – connects to backend Socket.IO; resolves on `connect` or rejects on `connect_error` (e.g. auth failure).
  - `setupSocketEventListeners()` – handles real-time events: `newMessage`, `startTyping`, `stopTyping`, `userOnline`, `userOffline`, `onlineUsers`.
  - `loadCurrentUser()` – GET `/api/users/me` to set `currentUser`.
  - `initEventListeners()` – wires user search, chat search, message input events, send button, file attachment handle.
  - `debounceUserSearch(query)` / `searchUsers(query)` – call `/api/users/search` and render results.
  - `displaySearchResults(users)` – renders clickable user list for starting new chat.
  - `startNewChat(userId, userName, userAvatar)` – convenience to open chat with a selected user.
  - `openChatWithUser(user)` – sets `currentChat`, updates header, joins conversation room via Socket, loads messages.
  - `updateChatHeader(user)` – sets avatar, name, status, and “Loading messages…” placeholder.
  - `loadMessages(userId)` – GET `/api/messages/:userId` and calls `displayMessages`.
  - `displayMessages(messages)` – renders conversation, supports message types (text, media, voice, document) and attaches a unified click handler for file viewing.
  - `sendMessage()` – sends text message via `FormData` POST `/api/messages/send`, optimistic UI update.
  - `sendAttachment(file)` – detects type, posts file to `/api/messages/send`, updates UI.
  - `openFileViewer(meta)` – opens modal viewer supporting media, voice and documents (PDF via `/api/files/pdf?src=...`, Office docs via Microsoft viewer, or direct iframe).
  - `bindViewerControls()` – attaches zoom in/out handlers and close button for viewer.
  - `addMessageToUI(message)` – appends a message element to the chat and scrolls down.
  - `handleNewMessage(message)` – adds message if it belongs to current conversation and marks as seen.
  - `loadConversations()` / `renderChatList()` – GET `/api/messages/conversations` and render conversation items with last message, timestamp and unread badge.
  - `formatConversationPreview(lastMessage)` – returns text/voice/media/document preview string.
  - `formatMessageTime(timestamp)` – returns time or date string.
  - `handleTypingIndicator()` / `stopTyping()` – manage local typing state; emits `startTyping`/`stopTyping` events to server.
  - `showTypingIndicator(userName)` / `hideTypingIndicator()` – toggles header status text.
  - `updateUserStatus(userId, status)` – updates header status for active chat.
  - `markMessagesAsSeen(userId)` – PATCH `/api/messages/:userId/seen`.
  - `searchChats(query)` – filters conversation list by name/last message.
  - `setActiveChatItem(userId)` – marks selected conversation.
  - `scrollToBottom()` – scrolls chat message container.
  - `showWelcomeMessage()` – initial state when no conversation is selected.
  - `showError(message)` – displays error overlay in chat area.
  - `openNewChatModal()` / `closeNewChatModal()` – toggles new chat modal and user search.
  - `escapeHtml(text)` – sanitizes text for safe rendering.
  - `apiCall(endpoint, method, body)` – generic fetch wrapper injecting JWT and handling JSON vs FormData.

- Global helpers: `openNewChatModal`, `closeNewChatModal`, `sendMessage` call into `chatboxManager`.
- On DOMContentLoaded: instantiate `ChatboxManager`, bind viewer controls; additional listener closes modal when clicking overlay.

#### `chat.js` (root ChatApp)

- A more complex, Instagram-style chat UI, similar in responsibility to `ChatboxManager` but with a different layout and behavior.
- Core responsibilities:
  - Manage active chat user, conversations, messages, typing, attachments, status, and logout.
  - Communicate via the same backend messaging API and Socket.IO events as Chatbox.
- Key methods:
  - `init()`, `initializeSocket`, `setupSocketEventListeners`
  - `loadCurrentUser`, `updateCurrentUserUI`
  - `initializeEventListeners` for search, message input, attachments, logout.
  - `searchUsers`, `displaySearchResults`, `openChatWithUser`
  - `loadMessages`, `displayMessages`, `formatMessageContent`
  - `sendMessage`, `addMessageToUI`, `handleNewMessage`
  - `handleTypingIndicator`, `stopTyping`, `showTypingIndicator`, `hideTypingIndicator`
  - `loadConversations`, `displayConversations`, `formatConversationPreview`, `updateConversationsList`
  - File upload modal: `initializeFileUpload`, `openFileUploadModal`, `closeFileUploadModal`, `handleFileSelection`, `uploadSelectedFiles`, `getMessageTypeFromFile`
  - `updateUserStatus`, `removeMessageFromUI`, `showNotification`, `logout`, `apiCall`


### 4.5 Notes UI

#### `frontend/notes/notes.js`

- **`NotesManager` class** – UI controller for listing, creating, editing, deleting and viewing notes, including media and PDF viewer.
  - State: `notes`, `currentView`, `editingNote`, `currentUserId`, filters (`searchQuery`, `selectedType`, `selectedTag`).
  - `getCurrentUserId()` – decodes JWT from localStorage to get user ID.
  - `fetchNotes()` – GET `/api/files/notes` to populate `notes`.
  - `initEventListeners()` – attaches click handlers for grid cards, search and filter inputs, view toggle, and note file preview.
  - `renderNotes(notes)` – renders cards into `#notesGrid`.
  - `getFilteredNotes()` – filters notes by text, type, tag.
  - `refreshList()` – re-renders filtered notes.
  - `createNoteCard(note)` – returns HTML markup for note card with metadata and actions.
  - `escapeHtml`, `formatDate`, `decodeJwt`, `cloudinaryInlineUrl` – helpers.
  - `saveNote()` – handles both create and update; optionally uploads attached file via `uploadWithProgress` and then calls backend note APIs.
  - `uploadWithProgress(url, formData, token)` – XHR-based upload with progress bar.
  - `compressImage(file, maxDimension, quality)` – client-side image compression for faster uploads.
  - `openEdit(noteId)` – opens modal with note values pre-filled.
  - `deleteNote(noteId)` – DELETE `/api/files/notes/:id`.
  - `openViewer(noteId)` – opens full-page viewer for text/image/pdf notes; for pdf, uses PDF.js to render multiple pages and supports zoom and fullscreen.
  - Viewer helpers: `showFigmaLoading`, `hideFigmaLoading`, `showFigmaError`, `toggleFullscreen`, `renderScrollablePdf`, `applyImageZoom`, `ensurePdfJs`, `renderPdfDoc`, `applyPdfZoom`, `adjustZoom`, `updateZoomDisplay`, `closeViewer`.
  - `closeModal()` – resets create/edit modal.

- Globals:
  - `ensureAuth()` – ensures token exists and not expired, else redirect.
  - `openCreateModal`, `closeModal`, `closeViewer`, `handleTypeChange` – wrappers for the manager.
- On DOMContentLoaded: runs `ensureAuth()`, instantiates `NotesManager`, and wires form submit to `saveNote`.

### 4.6 Classroom Frontend

#### `frontend/classroom/classroom.js` – ClassroomManager

- **`ClassroomManager` class** manages join/create flows and a modal-based classroom view with resources and members.
  - Constructor: loads from localStorage (`recentClassrooms`, `resources`), sets `currentClassroom`, then `init()`.
  - `init()` – attaches event listeners, renders recent classrooms, and initialises resource upload drag-and-drop.
  - `initEventListeners()` – binds create & join forms, classroom tab switching, and resource upload form.
  - `initResourceUpload()` – UI and event handlers for selecting/dropping files.
  - `updateFileDisplay(files)` – shows selected file names.
  - `handleCreateClassroom(e)` – POST `/api/classrooms/create` with name/subject; stores in recentClassrooms.
  - `handleJoinClassroom(e)` – POST `/api/classrooms/join` with `code` and adds to recentClassrooms.
  - `handleResourceUpload(e)` – local-only simulation of resource uploading into `resources` list.
  - `resetUploadArea()` – resets upload area text.
  - `getFileType(fileName)` – maps file extension to MIME type.
  - `loadResources`, `saveResources`, `renderResources`, `getFileIcon`, `formatFileSize`, `formatDate` – resource utilities.
  - `switchClassroomTab(tabName)` – toggles between resources and members panel; triggers `renderResources` or `renderMembers`.
  - `renderMembers()` & `loadClassroomMembers()` – integrates with backend `/api/classrooms/:id/members` to fetch and display member list.
  - `displayMembers(isCurrentUserAdmin)` – similar to classroom-view membership UI, with local actions.
  - `getCurrentUserId`, `getUserInitials`, `formatJoinTime`, `createAdminControls`, `promoteUser`, `demoteUser`, `removeUser` – same semantics as backend admin operations.
  - `loadRecentClassrooms`, `saveRecentClassrooms`, `addToRecentClassrooms`, `renderRecentClassrooms` – manage recent classroom cards UI.
  - `deleteClassroom(classroomId)` – DELETE `/api/classrooms/:id` and update local list.
  - `openClassroomView(classroomId)`, `closeClassroomView()` – open/close classroom modal, populate info and render resources.

- Global functions: `openClassroomView`, `closeClassroomView`, `deleteClassroom`, `downloadResource`, `deleteResource` call into `classroomManager`.
- On DOMContentLoaded: instantiate `ClassroomManager` and append CSS keyframes for slide animations.

#### `frontend/classroom/classroom-view.js`

- A more static, document-sharing-oriented classroom view used for a dedicated page.
- Manages:
  - Global `participants`, `documents`, `currentClassroomId`, `currentUserRole`.
  - Drag-and-drop file upload UI and re-rendering of `documents` array.
- Functions:
  - `initializeClassroom()` – sets up file upload area and drag-and-drop.
  - `updateClassDuration()` – updates on-page session duration labels.
  - `updateParticipantCount()` – updates participants count.
  - `handleFileUpload`, `handleDragOver`, `handleDragLeave`, `handleFileDrop`, `uploadDocument(file)` – interact with `/api/files/upload/:classroomId` and update local `documents` list.
  - `updateDocumentsList()`, `createDocumentElement(doc)`, `getFileType(mime)`, `getFileIconClass(type)` – UI helpers to show documents.
  - `downloadFile(filename)` / `viewFile(filename)` – show notifications simulating download/view.
  - Participation UI: `simulateParticipantActivity`, `updateParticipantsList`, `formatJoinTime`, `getUserInitials`, `createAdminControls` (calls `promoteUser`, `demoteUser`, `removeUser` similar to backend), `updateParticipantCount`.
  - Notification helpers: `formatFileSize`, `getCurrentTime`, `showNotification`.
  - `leaveClass()` – prompts and redirects to index.
  - Keyboard shortcuts: Ctrl+U to trigger upload, ESC to leave class.
  - Role management: `initializeClassroomData`, `getClassroomIdFromUrl`, `loadClassroomMembers`, `getCurrentUserId`, `promoteUser`, `demoteUser`, `removeUser` (similar to backend).
  - Tab switching: toggles between Posts/Notes/Resources.
  - `uploadFile(type)` – wrapper to send `POST /api/files/upload/:classroomId` for specific content type.


### 4.7 Dashboard & Home

#### `frontend/dashboard/dashboard.js` – DashboardManager

- **`DashboardManager` class**
  - `initCounters()` – animates numeric counters.
  - `initInteractions()` – binds click/hover interactions for cards.
  - `loadRecentData()` – triggers UI animations and fetches joined classrooms from `/api/classroom/joined` and `/api/classroom/my` (note: there are slight inconsistencies with backend routes; effective integration depends on backend updates).
  - `animateActivityItems`, `animateNoteItems`, `animateUpdateItems` – entry animations.
  - `initAnimations()` – intersection observer to animate sections on scroll.
  - `refreshDashboard()`, `showLoadingState()`, `hideLoadingState()` – refresh behaviours.
- Global functions: `refreshDashboard`, `fetchJoinedClassrooms`, `renderJoinedClassrooms` and a click handler for delete buttons on classroom cards.

#### `frontend/home/home.js` – HomeManager

- **`HomeManager` class**
  - `initAnimations()` – intersection observer for feature cards and stats section.
  - `initInteractions()` – card click animations and CTA button ripple effect.
  - `startCounterAnimation()` – animated counters.
- Adds global CSS for ripple and fade animations and sets `scrollBehavior = 'smooth'`.

### 4.8 Settings UI

#### `frontend/settings/settings.js` – SettingsManager

- **`SettingsManager` class**
  - Manages profile, password, theme, notifications, appearance, privacy, and data export/clear flows.
  - `loadSettings()` / `saveSettings()` – persist to `localStorage`.
  - `loadUserData()` – GET `/api/auth/me`, populates profile form (+ avatar initials).
  - `applySettings()` – sets theme and toggles; `applySettingChange(settingId, value)` for immediate UI effects.
  - `saveProfile()` – combines first/last name into `name`, PUT `/api/auth/update-profile`.
  - `changePassword()` – PUT `/api/auth/change-password` with validation.
  - `changeTheme(theme)` / `setTheme(theme)` – update theme classes.
  - `handleToggleChange(settingId, value)` – updates `settings` object and calls `applySettingChange`.
  - `requestNotificationPermission()` – uses Web Notifications API to request permission and optionally show sample notification.
  - Export methods: `exportNotes`, `exportMessages`, `exportAll` – all currently export from localStorage (notes/messages/AI history/settings) to download JSON files.
  - Clearing methods: `clearMessages`, `clearSummaries`, `clearAllData` – clear related localStorage keys, optionally log out.
  - `deleteAccount()` – DELETE `/api/auth/delete-account`, clears storage, redirects to auth.
  - `showMessage(message, type)` – toast notifications.

- Global helpers: `changeAvatar`, `removeAvatar`, `resetProfile`, and export/clear/delete wrappers that call methods on `settingsManager`.
- Adds CSS for slide-in/out animations, compact mode and animation disabling.

---

## 5. Root Utility Files

#### `counter.js`

- Exports `setupCounter(element)` used by Vite starter demo pages.
- Attaches click handler to increment a counter and display updated count.

---

## 6. Typical Flows & Use Cases

### 6.1 User Authentication & Navigation

1. User opens `frontend/auth/auth.html`.
2. `AuthManager` handles login or signup, calling `/api/auth/login` or `/api/auth/register`.
3. Backend returns JWT; `AuthManager` stores it in `localStorage` and backend also sets HttpOnly `token` cookie.
4. Navigating to any app page (`home`, `dashboard`, `notes`, `chatbox`, `classroom`, `ai`, `settings`) requires the cookie; otherwise `server.js` redirects back to login.
5. `Sidebar` renders on each page, using `logout()` to clear session.

### 6.2 Classrooms & Resources

- Create/join a classroom via `ClassroomManager` (`/api/classrooms/create`, `/api/classrooms/join`).
- Classrooms appear in recent list and dashboard.
- Membership/role is managed through `classroomController` and `classroomAuth` middleware.
- Classroom content/resources can be uploaded via `fileRoutes` or `fileController` and referenced in `ClassroomContent`.

### 6.3 Notes & Documents

- `NotesManager` fetches notes from `/api/files/notes`.
- User can create a note:
  - Text: just `title`, `content`, `tags`.
  - Image or PDF: require upload to `/api/files/upload` then store `fileUrl` in note.
- Notes can be viewed with inline image or PDF viewer (PDF.js), edited or deleted.

### 6.4 AI PDF Summarization

- User navigates to AI page (`frontend/ai/ai.html`).
- Uploads a PDF.
- Browser uploads to `/api/files/upload`, gets back `fileUrl` (Cloudinary).
- `AISummarizerManager` calls /analyze endpoints to get overview, key points, and highlights.
- Results are displayed with tabs and stored in history.

### 6.5 1:1 Messaging

- Chat UI (chatbox or chat app) ensures user is authenticated and obtains JWT token.
- Socket.IO connects with `auth.token`; server authenticates and maps socket to user id.
- Conversations list is loaded from `/api/messages/conversations`.
- Selecting a user loads history from `/api/messages/:userId` and joins the conversation room via Socket.
- Sending a message:
  - Calls `POST /api/messages/send` with `messageType` and either `content` or `file`.
  - The API creates a `Message` and `Conversation` entry, then emits `newMessage` via Socket.IO.
- Typing indicators, unread counts, seen/delivered statuses and deletion are handled via dedicated endpoints and Socket events.

### 6.6 Settings & Data Management

- Settings page allows updating user profile (`/api/auth/update-profile`), changing password, modifying theme and toggles, and clearing or exporting local data.

---

## 7. Notes on Inconsistencies & Integration Points

- There are some inconsistencies between frontend endpoints (e.g. `/api/classroom/...`) and backend routes (`/api/classrooms/...`), and between `File` model shapes in `fileRoutes` vs `fileController`. When wiring new UI features, verify the exact endpoint and payload.
- The legacy chat APIs (`/api/chat`, `Chat` model) coexist with the newer messaging system (`/api/messages`, `Message` + `Conversation`). New features should typically use the newer system.
- AI features rely on environment variables for Groq API key (`GROQ_API_KEY`) and model (`GROQ_MODEL`).

---

This document focuses on the major classes and exported functions and how they fit together. For any new feature, the recommended approach is to reuse:

- **Auth**: `auth` middleware and JWT cookie model.
- **Files**: `fileRoutes` upload and proxy helpers.
- **Messaging**: `Message` + `Conversation` models and `messageController` endpoints.
- **Classrooms**: `classroomController`, `classroomAuth`, and `ClassroomContent`/`Resource` models.
- **AI**: `fileRoutes` AI helper functions (`summarizeLarge`, `askAIJson`) for summarising any large text-based content.
