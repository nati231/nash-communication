import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Socket, ExtendedError } from "socket.io";
import type { SocketUser } from "./socket.types.js";

function getJwtSecret(): string {
  const secret = process.env["JWT_SECRET"];

  if (!secret) {
    throw new Error("JWT_SECRET is not defined");
  }

  return secret;
}

export function authenticateSocket(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): void {
  try {
    const token = socket.handshake.auth?.token;

    if (typeof token !== "string" || !token) {
      next(new Error("Authentication token is required"));
      return;
    }

    const decoded = jwt.verify(token, getJwtSecret());

    if (typeof decoded === "string") {
      next(new Error("Invalid token payload"));
      return;
    }

    const payload = decoded as JwtPayload & {
      userId?: unknown;
      email?: unknown;
    };

    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string"
    ) {
      next(new Error("Invalid token payload"));
      return;
    }

    const user: SocketUser = {
      userId: payload.userId,
      email: payload.email,
    };

    socket.data.user = user;
    next();
  } catch (error) {
    console.error("Socket authentication failed:", error);
    next(new Error("Invalid or expired token"));
  }
}