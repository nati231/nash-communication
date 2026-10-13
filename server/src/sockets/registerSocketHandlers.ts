
import type { Server, Socket } from "socket.io";

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

interface MeetingParticipant {
  id: string;
  name: string;
  email: string;
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
  meetingId?: string;
  participants?: MeetingParticipant[];
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

    if (!user?.userId) {
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

    socket.on(
      "meeting:join",
      (
        meetingId: string,
        participant: {
          name?: string;
          email?: string;
        } = {},
        callback?: Ack,
      ) => {
        try {
          if (
            typeof meetingId !== "string" ||
            !meetingId.trim()
          ) {
            return respondError(
              callback,
              "Meeting ID is required.",
            );
          }

          const cleanMeetingId = meetingId.trim();
          const roomName = `meeting:${cleanMeetingId}`;

          const meetingParticipant = {
            name:
              typeof participant?.name === "string" &&
              participant.name.trim()
                ? participant.name.trim()
                : user.name || user.email,
            email:
              typeof participant?.email === "string" &&
              participant.email.trim()
                ? participant.email.trim()
                : user.email,
          };

          socket.data.meetingParticipant = meetingParticipant;

          void socket.join(roomName);

          const room = io.sockets.adapter.rooms.get(roomName);
          const participants: MeetingParticipant[] = [];

          if (room) {
            for (const socketId of room) {
              const participantSocket =
                io.sockets.sockets.get(socketId);

              if (!participantSocket) continue;

              const socketUser = participantSocket.data
                .user as SocketUser | undefined;

              if (!socketUser) continue;

              const profile = participantSocket.data
                .meetingParticipant as
                | { name?: string; email?: string }
                | undefined;

              participants.push({
                id: String(socketUser.userId),
                name:
                  profile?.name ||
                  socketUser.name ||
                  socketUser.email,
                email: profile?.email || socketUser.email,
              });
            }
          }

          callback?.({
            success: true,
            meetingId: cleanMeetingId,
            userId,
            participants,
          });

          socket.to(roomName).emit("meeting:user-joined", {
            participant: {
              id: userId,
              name: meetingParticipant.name,
              email: meetingParticipant.email,
            },
          });
        } catch (error) {
          console.error("Meeting join error:", error);
          respondError(callback, "Failed to join meeting.");
        }
      },
    );

    socket.on(
      "meeting:leave",
      (meetingId: string, callback?: Ack) => {
        try {
          if (
            typeof meetingId !== "string" ||
            !meetingId.trim()
          ) {
            return respondError(
              callback,
              "Meeting ID is required.",
            );
          }

          const cleanMeetingId = meetingId.trim();
          const roomName = `meeting:${cleanMeetingId}`;

          void socket.leave(roomName);

          socket.to(roomName).emit("meeting:user-left", {
            userId,
          });

          callback?.({
            success: true,
            meetingId: cleanMeetingId,
          });
        } catch (error) {
          console.error("Meeting leave error:", error);
          respondError(callback, "Failed to leave meeting.");
        }
      },
    );

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
            return respondError(
              callback,
              "The other user's ID is required.",
            );
          }

          if (targetUserId === userId) {
            return respondError(
              callback,
              "You cannot start a conversation with yourself.",
            );
          }

          const targetUser = await prisma.orm.public.User.first({
            id: targetUserId,
          });

          if (!targetUser) {
            return respondError(callback, "User not found.");
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
            return respondError(
              callback,
              "Conversation ID is required.",
            );
          }

          const isMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!isMember) {
            return respondError(
              callback,
              "You are not a member of this conversation.",
            );
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
            return respondError(
              callback,
              "Conversation ID and user ID are required.",
            );
          }

          const requesterIsMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!requesterIsMember) {
            return respondError(
              callback,
              "You are not a member of this conversation.",
            );
          }

          const targetUser = await prisma.orm.public.User.first({
            id: targetUserId,
          });

          if (!targetUser) {
            return respondError(callback, "User not found.");
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
            return respondError(
              callback,
              "Conversation ID is required.",
            );
          }

          const isMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!isMember) {
            return respondError(
              callback,
              "You are not a member of this conversation.",
            );
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
            return respondError(
              callback,
              "Conversation ID is required.",
            );
          }

          const isMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!isMember) {
            return respondError(
              callback,
              "You are not a member of this conversation.",
            );
          }

          await socket.join(conversationId);

          const messages =
            await getConversationMessages(conversationId);

          // Add each sender's actual profile name to the history.
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
    // SEND MESSAGE
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
            return respondError(
              callback,
              "Conversation ID and message content are required.",
            );
          }

          if (content.length > 5000) {
            return respondError(
              callback,
              "Messages cannot exceed 5000 characters.",
            );
          }

          const isMember = await isConversationMember(
            conversationId,
            userId,
          );

          if (!isMember) {
            return respondError(
              callback,
              "You are not allowed to send messages in this conversation.",
            );
          }

          // Read the sender's name from the authenticated user's DB record.
          const sender = await prisma.orm.public.User.first({
            id: userId,
          });

          const message = await createMessage({
            conversationId,
            senderId: userId,
            content,
          });

          // Include senderName for the receiver's browser.
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
