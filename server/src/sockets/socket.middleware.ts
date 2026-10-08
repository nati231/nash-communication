import jwt from "jsonwebtoken";
import type { ExtendedError } from "socket.io";

import type { SocketUser } from "./socket.types.js";
import type { Socket } from "socket.io";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined");
}

export function authenticateSocket(
  socket: Socket,
  next: (err?: ExtendedError) => void,
) {
  try {
    const token =
      typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token
        : undefined;

    if (!token) {
      return next(new Error("Authentication token is required"));
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.userId !== "string" ||
      typeof decoded.email !== "string"
    ) {
      return next(new Error("Invalid token payload"));
    }

    const user: SocketUser = {
      userId: decoded.userId,
      email: decoded.email,
    };

    socket.data.user = user;

    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
}