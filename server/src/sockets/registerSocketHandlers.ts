import type { Server, Socket } from "socket.io";
import { registerMeetingChatHandlers } from "./meeting-chat-handlers.js";

import { prisma } from "../config/prisma.js";
import { authenticateSocket } from "./socket.middleware.js";

import {
  addOnlineUser,
  removeOnlineUser,
  getOnlineUserIds,
} from "./presence.js";

import {
  createConversation,
  addConversationMember,
  getConversationMembers,
  isConversationMember,
  findDirectConversation,
  getUserConversations,
} from "../services/conversation.service.js";

import {
  createMessage,
  getConversationMessages,
} from "../services/message.service.js";

interface SocketUser {
  userId: string;
  email: string;
  name?: string;
}

interface AckResponse {
  success: boolean;
  error?: string;
  message?: unknown;
  conversationId?: string;
  conversation?: unknown;
  conversations?: unknown[];
  members?: unknown[];
  messages?: unknown[];
  userId?: string;
  [key: string]: unknown;
}

type Ack = (response: AckResponse) => void;

interface StartConversationPayload {
  userId?: string;
  targetUserId?: string;
}

interface SendMessagePayload {
  conversationId?: string;
  content?: string;
}

interface AddMemberPayload {
  conversationId?: string;
  userId?: string;
}

function respondError(
  ack: Ack | undefined,
  error: string,
): void {
  ack?.({
    success: false,
    error,
    message: error,
  });
}

function getConversationId(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (
    value !== null &&
    typeof value === "object" &&
    "conversationId" in value
  ) {
    const id = value.conversationId;

    if (typeof id === "string") {
      return id.trim();
    }
  }

  return "";
}

export function registerSocketHandlers(io: Server): void {
  io.use(authenticateSocket);

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as SocketUser | undefined;

    if (!user?.userId || !user.email) {
      socket.disconnect(true);
      return;
    }

    const userId = String(user.userId);
    const userRoom = `user:${userId}`;

    void socket.join(userRoom);

    console.log(
      `Socket authenticated: ${user.email} (${socket.id})`,
    );

    // =====================================================
    // PRESENCE
    // =====================================================

    addOnlineUser(io, userId, socket.id);

    socket.emit("presence:list", {
      userIds: getOnlineUserIds(),
    });

    socket.on("presence:list", () => {
      socket.emit("presence:list", {
        userIds: getOnlineUserIds(),
      });
    });

    // =====================================================
    // MEETINGS
    // =====================================================

    // meeting:join, meeting:leave, meeting:chat:send and the WebRTC
    // offer/answer/ice relay are all handled in meeting-chat-handlers.ts.
    // Do not register meeting:join or meeting:leave anywhere else.
    registerMeetingChatHandlers(io, socket, {
      userId,
      email: user.email,
      name: user.name,
    });

    // =====================================================
    // CONVERSATION LIST
    // =====================================================

    socket.on(
      "conversation:list",
      async (callback?: Ack) => {
        try {
          const conversations = await getUserConversations(userId);

          callback?.({
            success: true,
            conversations,
          });

          socket.emit("conversation:list", {
            success: true,
            conversations,
          });
        } catch (error) {
          console.error("conversation:list failed:", error);
          respondError(
            callback,
            "Could not load conversations.",
          );
        }
      },
    );

    // =====================================================
    // CREATE A CONVERSATION
    // =====================================================

    socket.on(
      "conversation:create",
      async (callback?: Ack) => {
        try {
          const conversation = await createConversation(userId);
          const conversationId = String(conversation.id);

          await socket.join(conversationId);

          callback?.({
            success: true,
            conversation,
            conversationId,
          });
        } catch (error) {
          console.error("conversation:create failed:", error);
          respondError(
            callback,
            "Could not create the conversation.",
          );
        }
      },
    );

    // =====================================================
    // START OR REUSE A DIRECT CONVERSATION
    // =====================================================

    socket.on(
      "conversation:start",
      async (
        payload: StartConversationPayload,
        callback?: Ack,
      ) => {
        try {
          const targetUserId = String(
            payload?.userId ?? payload?.targetUserId ?? "",
          ).trim();

          if (!targetUserId) {
            respondError(
              callback,
              "The other user's ID is required.",
            );
            return;
          }

          if (targetUserId === userId) {
            respondError(
              callback,
              "You cannot start a conversation with yourself.",
            );
            return;
          }

          const targetUser = await prisma.orm.public.User.first({
            id: targetUserId,
          });

          if (!targetUser) {
            respondError(callback, "User not found.");
            return;
          }

          let conversation = await findDirectConversation(
            userId,
            targetUserId,
          );

          if (!conversation) {
            conversation = await createConversation(userId);

            await addConversationMember(
              String(conversation.id),
              targetUserId,
            );
          }

          const conversationId = String(conversation.id);

          await socket.join(conversationId);

          const recipientSockets = await io
            .in(`user:${targetUserId}`)
            .fetchSockets();

          for (const recipientSocket of recipientSockets) {
            await recipientSocket.join(conversationId);

            recipientSocket.emit("conversation:invited", {
              conversation,
              conversationId,
              userId,
              name: user.name || user.email,
              email: user.email,
            });
          }

          callback?.({
            success: true,
            conversation,
            conversationId,
          });

          const senderConversations =
            await getUserConversations(userId);

          socket.emit("conversation:list", {
            success: true,
            conversations: senderConversations,
          });

          const recipientConversations =
            await getUserConversations(targetUserId);

          for (const recipientSocket of recipientSockets) {
            recipientSocket.emit("conversation:list", {
              success: true,
              conversations: recipientConversations,
            });
          }

          console.log(
            `Conversation ${conversationId} opened by ${userId} with ${targetUserId}`,
          );
        } catch (error) {
          console.error("conversation:start failed:", error);
          respondError(
            callback,
            "Could not start the conversation.",
          );
        }
      },
    );

    // =====================================================
    // JOIN A CONVERSATION
    // =====================================================

    socket.on(
      "conversation:join",
      async (
        payload: string | { conversationId: string },
        callback?: Ack,
      ) => {
        try {
          const conversationId = getConversationId(payload);

          if (!conversationId) {
            respondError(
              callback,
              "Conversation ID is required.",
            );
            return;
          }

          const isMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!isMember) {
            respondError(
              callback,
              "You are not a member of this conversation.",
            );
            return;
          }

          await socket.join(conversationId);

          callback?.({
            success: true,
            conversationId,
          });
        } catch (error) {
          console.error("conversation:join failed:", error);
          respondError(
            callback,
            "Could not join the conversation.",
          );
        }
      },
    );

    // =====================================================
    // ADD A MEMBER
    // =====================================================

    socket.on(
      "conversation:add-member",
      async (
        payload: AddMemberPayload,
        callback?: Ack,
      ) => {
        try {
          const conversationId = String(
            payload?.conversationId ?? "",
          ).trim();

          const targetUserId = String(
            payload?.userId ?? "",
          ).trim();

          if (!conversationId || !targetUserId) {
            respondError(
              callback,
              "Conversation ID and user ID are required.",
            );
            return;
          }

          const requesterIsMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!requesterIsMember) {
            respondError(
              callback,
              "You are not a member of this conversation.",
            );
            return;
          }

          const targetUser = await prisma.orm.public.User.first({
            id: targetUserId,
          });

          if (!targetUser) {
            respondError(callback, "User not found.");
            return;
          }

          const alreadyMember = await isConversationMember(
            conversationId,
            targetUserId,
          );

          if (!alreadyMember) {
            await addConversationMember(
              conversationId,
              targetUserId,
            );
          }

          const recipientSockets = await io
            .in(`user:${targetUserId}`)
            .fetchSockets();

          for (const recipientSocket of recipientSockets) {
            await recipientSocket.join(conversationId);

            recipientSocket.emit("conversation:invited", {
              conversationId,
              userId,
              name: user.name || user.email,
              email: user.email,
            });
          }

          callback?.({
            success: true,
            conversationId,
            userId: targetUserId,
          });

          io.to(conversationId).emit(
            "conversation:member-added",
            {
              conversationId,
              userId: targetUserId,
            },
          );
        } catch (error) {
          console.error(
            "conversation:add-member failed:",
            error,
          );

          respondError(
            callback,
            "Could not add the conversation member.",
          );
        }
      },
    );

    // =====================================================
    // GET CONVERSATION MEMBERS
    // =====================================================

    socket.on(
      "conversation:members",
      async (
        payload: string | { conversationId: string },
        callback?: Ack,
      ) => {
        try {
          const conversationId = getConversationId(payload);

          if (!conversationId) {
            respondError(
              callback,
              "Conversation ID is required.",
            );
            return;
          }

          const isMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!isMember) {
            respondError(
              callback,
              "You are not a member of this conversation.",
            );
            return;
          }

          const members =
            await getConversationMembers(conversationId);

          callback?.({
            success: true,
            members,
          });
        } catch (error) {
          console.error(
            "conversation:members failed:",
            error,
          );

          respondError(
            callback,
            "Could not load conversation members.",
          );
        }
      },
    );

    // =====================================================
    // MESSAGE HISTORY
    // =====================================================

    socket.on(
      "message:history",
      async (
        payload: string | { conversationId: string },
        callback?: Ack,
      ) => {
        try {
          const conversationId = getConversationId(payload);

          if (!conversationId) {
            respondError(
              callback,
              "Conversation ID is required.",
            );
            return;
          }

          const isMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!isMember) {
            respondError(
              callback,
              "You are not a member of this conversation.",
            );
            return;
          }

          await socket.join(conversationId);

          const messages =
            await getConversationMessages(conversationId);

          const enrichedMessages = await Promise.all(
            messages.map(async (message) => {
              const sender = await prisma.orm.public.User.first({
                id: String(message.senderId),
              });

              return {
                ...message,
                senderName: sender?.name || sender?.email || "User",
              };
            }),
          );

          callback?.({
            success: true,
            conversationId,
            messages: enrichedMessages,
          });
        } catch (error) {
          console.error("message:history failed:", error);
          respondError(
            callback,
            "Could not load message history.",
          );
        }
      },
    );

    // =====================================================
    // SEND CONVERSATION MESSAGE
    // =====================================================

    socket.on(
      "message:send",
      async (
        payload: SendMessagePayload,
        callback?: Ack,
      ) => {
        try {
          const conversationId = String(
            payload?.conversationId ?? "",
          ).trim();

          const content = String(
            payload?.content ?? "",
          ).trim();

          if (!conversationId || !content) {
            respondError(
              callback,
              "Conversation ID and message content are required.",
            );
            return;
          }

          if (content.length > 5000) {
            respondError(
              callback,
              "Messages cannot exceed 5000 characters.",
            );
            return;
          }

          const isMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!isMember) {
            respondError(
              callback,
              "You are not allowed to send messages in this conversation.",
            );
            return;
          }

          const sender = await prisma.orm.public.User.first({
            id: userId,
          });

          const message = await createMessage({
            conversationId,
            senderId: userId,
            content,
          });

          const messageWithSenderName = {
            ...message,
            senderName: sender?.name || sender?.email || "User",
          };

          io.to(conversationId).emit("message:new", {
            message: messageWithSenderName,
          });

          callback?.({
            success: true,
            message: messageWithSenderName,
          });
        } catch (error) {
          console.error("message:send failed:", error);
          respondError(
            callback,
            "Could not send the message.",
          );
        }
      },
    );

    // =====================================================
    // DISCONNECT
    // =====================================================

    socket.on("disconnect", (reason) => {
      removeOnlineUser(io, userId, socket.id);

      console.log(
        `Socket disconnected: ${user.email} (${socket.id}); reason: ${reason}`,
      );
    });
  });
}