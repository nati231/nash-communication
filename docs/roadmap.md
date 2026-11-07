# Nash Development Roadmap

## Phase 0 — Planning and Architecture

- [x] Define product vision
- [x] Choose product name: Nash
- [x] Create GitHub repository
- [x] Initialize local Git repository
- [x] Create project README
- [x] Document application architecture
- [ ] Define development environment
- [ ] Define initial dependency strategy

---

# Phase 1 — Frontend Foundation

## Goal

Build the visual foundation of Nash before implementing real-time functionality.

### Tasks

- [x] Initialize Next.js
- [x] Configure TypeScript
- [x] Configure Tailwind CSS
- [x] Add Lucide React
- [x] Create application layout
- [x] Create navigation/sidebar
- [x] Create dashboard
- [x] Create meeting cards
- [ ] Create user profile UI
- [ ] Create responsive layout
- [ ] Add dark/light theme
- [x] Create reusable UI components

---

# Phase 2 — Authentication

## Goal

Allow users to securely create accounts and authenticate.

### Tasks

- [ ] Design user authentication flow
- [x] Create registration page
- [x] Create login page
- [ ] Create logout functionality
- [ ] Hash passwords
- [x] Create authentication middleware
- [ ] Protect private routes
- [ ] Create user profile
- [ ] Test authentication

Notes: the meeting and chat pages already redirect to the login page when the
saved token is missing or rejected. Other private routes are not covered yet.

---

# Phase 3 — Database

## Goal

Create persistent application data.

### Tasks

- [x] Set up PostgreSQL
- [x] Configure Prisma
- [ ] Design database schema
- [x] Create User model
- [x] Create Meeting model
- [ ] Create MeetingParticipant model
- [ ] Create File model
- [ ] Run migrations
- [ ] Test database operations

---

# Phase 4 — Backend API

## Goal

Create the backend foundation.

### Tasks

- [x] Initialize Node.js server
- [x] Configure Express
- [x] Configure TypeScript
- [x] Create API structure
- [x] Add environment configuration
- [ ] Add request validation
- [ ] Add error handling
- [x] Create user endpoints
- [x] Create meeting endpoints
- [x] Connect backend to PostgreSQL

---

# Phase 5 — Real-Time Communication

## Goal

Introduce Socket.IO.

### Tasks

- [x] Configure Socket.IO server
- [x] Connect frontend Socket.IO client
- [ ] Understand WebSockets
- [x] Create meeting rooms
- [x] Handle join events
- [x] Handle leave events
- [x] Handle participant events
- [x] Handle disconnect events

---

# Phase 6 — WebRTC Video Calling

## Goal

Implement real-time audio and video.

### Tasks

- [ ] Learn MediaStream
- [x] Request camera permission
- [x] Request microphone permission
- [x] Create RTCPeerConnection
- [ ] Understand SDP
- [x] Implement offers
- [x] Implement answers
- [x] Exchange ICE candidates
- [x] Build one-to-one video call
- [x] Add remote video
- [x] Add local video
- [x] Handle connection errors

Notes: calls use free STUN servers. An optional TURN relay can be switched on
with the NEXT_PUBLIC_TURN_* settings; it has not been tested with a real TURN
server yet.

---

# Phase 7 — Multi-User Meetings

## Goal

Allow multiple participants in the same meeting.

### Tasks

- [ ] Design participant architecture
- [x] Create participant state
- [x] Create video grid
- [x] Handle participants joining
- [x] Handle participants leaving
- [x] Handle peer connections
- [x] Handle connection failures
- [ ] Improve meeting UI

Notes: tested with two participants. Meetings with three or more people have
not been tested yet.

---

# Phase 8 — Screen Sharing

## Goal

Allow users to share their screen.

### Tasks

- [ ] Learn getDisplayMedia
- [x] Request screen capture
- [x] Add screen-sharing controls
- [x] Replace/add video track
- [x] Notify other participants
- [x] Stop screen sharing
- [x] Restore camera
- [x] Handle browser permissions

Notes: a person who joins without a camera can watch a shared screen but cannot
share their own, because their connections are receive-only for video.

---

# Phase 9 — Meeting Chat

## Goal

Create real-time meeting chat.

### Tasks

- [x] Create chat interface
- [x] Create Socket.IO chat events
- [x] Send messages
- [x] Receive messages
- [x] Display timestamps
- [ ] Display participants
- [ ] Handle disconnected users
- [ ] Improve chat UX

---

# Phase 10 — File Sharing

## Goal

Allow meeting participants to securely share files.

### Tasks

- [ ] Design file upload flow
- [ ] Create upload endpoint
- [ ] Validate file types
- [ ] Validate file sizes
- [ ] Store file metadata
- [ ] Implement download endpoint
- [ ] Add authorization checks
- [ ] Create file UI
- [ ] Test unauthorized access

---

# Phase 11 — Collaborative Whiteboard

## Goal

Create a real-time shared whiteboard.

### Tasks

- [ ] Learn HTML Canvas
- [ ] Create drawing surface
- [ ] Implement pointer drawing
- [ ] Implement eraser
- [ ] Implement colors
- [ ] Implement line width
- [ ] Implement shapes
- [ ] Implement text
- [ ] Send drawing events through Socket.IO
- [ ] Synchronize participants
- [ ] Add undo/redo
- [ ] Add clear board

---

# Phase 12 — Security

## Goal

Harden Nash against common security problems.

### Tasks

- [ ] Review authentication
- [ ] Review authorization
- [ ] Review password handling
- [ ] Validate API input
- [ ] Validate WebSocket events
- [ ] Secure file uploads
- [ ] Add rate limiting
- [ ] Review CORS
- [ ] Review cookies/tokens
- [ ] Review XSS protection
- [ ] Review CSRF considerations
- [ ] Review database security
- [ ] Review environment variables
- [ ] Review HTTPS requirements

---

# Phase 13 — Testing

## Goal

Test Nash systematically.

### Tasks

- [ ] Unit tests
- [ ] API tests
- [ ] Authentication tests
- [ ] Authorization tests
- [ ] Socket.IO tests
- [ ] WebRTC manual testing
- [ ] Multi-browser testing
- [ ] Responsive testing
- [ ] Error handling tests

---

# Phase 14 — Production

## Goal

Deploy Nash.

### Tasks

- [ ] Prepare production environment
- [ ] Configure production database
- [ ] Configure backend
- [ ] Configure frontend
- [ ] Configure environment variables
- [ ] Configure HTTPS
- [ ] Configure WebRTC infrastructure
- [ ] Configure TURN if required
- [ ] Deploy
- [ ] Test production
- [ ] Update documentation

---

# Git Workflow

Every major feature should follow this process:

1. Understand the feature
2. Plan the implementation
3. Write the code
4. Run the application
5. Test the feature
6. Fix errors
7. Review the implementation
8. Commit the changes
9. Push to GitHub
10. Document important decisions