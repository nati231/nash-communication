# Nash Architecture

## 1. Overview

Nash is a real-time communication and collaboration platform.

The application consists of a frontend, backend, database, real-time communication layer, and WebRTC media communication.

---

## 2. High-Level Architecture

```text
                         NASH
                           |
             +-------------+-------------+
             |                           |
        FRONTEND                      BACKEND
             |                           |
       Next.js / React             Node.js / Express
       TypeScript                  TypeScript
       Tailwind CSS                Socket.IO
             |                           |
             |                     +-----+------+
             |                     |            |
             |                PostgreSQL    Socket.IO
             |                     |            |
             |                     |       Real-time events
             |                     |
             +---------------------+
                           |
                         WebRTC
                           |
                    Audio / Video
                    Screen Sharing