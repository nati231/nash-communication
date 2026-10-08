import type { Server } from "socket.io";

const onlineUsers = new Map<string, Set<string>>();

export function addOnlineUser(
  io: Server,
  userId: string,
  socketId: string,
) {
  let sockets = onlineUsers.get(userId);

  if (!sockets) {
    sockets = new Set<string>();
    onlineUsers.set(userId, sockets);
  }

  const wasOffline = sockets.size === 0;

  sockets.add(socketId);

  if (wasOffline) {
    io.emit("presence:online", {
      userId,
    });
  }
}

export function removeOnlineUser(
  io: Server,
  userId: string,
  socketId: string,
) {
  const sockets = onlineUsers.get(userId);

  if (!sockets) {
    return;
  }

  sockets.delete(socketId);

  if (sockets.size === 0) {
    onlineUsers.delete(userId);

    io.emit("presence:offline", {
      userId,
    });
  }
}

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}