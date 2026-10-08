import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

import { prisma } from "./config/prisma.js";
import authRoutes from "./routes/auth.routes.js";
import meetingRoutes from "./routes/meeting.routes.js";
import { registerSocketHandlers } from "./sockets/socket.js";

const app = express();
const httpServer = createServer(app);

const PORT = Number(process.env["PORT"]) || 5000;

const CLIENT_URL =
  process.env["CLIENT_URL"] ||
  "http://localhost:3000";

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  }),
);

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Nash server is running",
    database: "configured",
  });
});

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(
    `Nash server running on http://localhost:${PORT}`,
  );
});