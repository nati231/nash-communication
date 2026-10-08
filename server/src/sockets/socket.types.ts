import type { Socket } from "socket.io";

export interface SocketUser {
  userId: string;
  email: string;
}

export interface AuthenticatedSocket extends Socket {
  user: SocketUser;
}