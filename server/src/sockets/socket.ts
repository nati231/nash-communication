
import type { Server } from "socket.io";

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
} from "../services/conversation.service.js";

import {
  createMessage,
  getConversationMessages,
} from "../services/message.service.js";

type SocketUser = {
  userId: string;
  email: string;
};

type MeetingParticipant = {
  id: string;
  name: string;
  email: string;
};

type SocketResponse = {
  success: boolean;
  message?: string;
  conversationId?: string;
  conversation?: { id: string };
  members?: unknown[];
  messages?: unknown[];
  [key: string]: unknown;
};

export function registerSocketHandlers(io: Server) {
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const user = socket.data.user as SocketUser;

    console.log(
      `Socket authenticated: ${user.email} (${socket.id})`,
    );

    // =========================
    // PRESENCE
    // =========================

    addOnlineUser(io, user.userId, socket.id);

    socket.emit("presence:list", {
      userIds: getOnlineUserIds(),
    });

    socket.on("presence:list", () => {
      socket.emit("presence:list", {
        userIds: getOnlineUserIds(),
      });
    });

    // =========================
    // MEETINGS
    // =========================

    socket.on(
      "meeting:join",
      (
        meetingId: string,
        participant: {
          name?: string;
          email?: string;
        },
        callback,
      ) => {
        try {
          if (
            typeof meetingId !== "string" ||
            !meetingId.trim()
          ) {
            return callback?.({
              success: false,
              message: "Meeting ID is required",
            });
          }

          const cleanMeetingId = meetingId.trim();
          const roomName = `meeting:${cleanMeetingId}`;

          socket.data.meetingParticipant = {
            name:
              typeof participant?.name === "string" &&
              participant.name.trim()
                ? participant.name.trim()
                : "User",
            email:
              typeof participant?.email === "string" &&
              participant.email.trim()
                ? participant.email.trim()
                : user.email,
          };

          socket.join(roomName);

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

              const meetingParticipant =
                participantSocket.data.meetingParticipant as
                  | { name?: string; email?: string }
                  | undefined;

              participants.push({
                id: socketUser.userId,
                name:
                  meetingParticipant?.name ||
                  socketUser.email,
                email:
                  meetingParticipant?.email ||
                  socketUser.email,
              });
            }
          }

          callback?.({
            success: true,
            meetingId: cleanMeetingId,
            userId: user.userId,
            participants,
          });

          socket.to(roomName).emit("meeting:user-joined", {
            participant: {
              id: user.userId,
              name:
                (
                  socket.data.meetingParticipant as
                    | { name?: string }
                    | undefined
                )?.name || user.email,
              email:
                (
                  socket.data.meetingParticipant as
                    | { email?: string }
                    | undefined
                )?.email || user.email,
            },
          });

          console.log(
            `User ${user.email} joined meeting ${cleanMeetingId}`,
          );
        } catch (error) {
          console.error("Meeting join error:", error);

          callback?.({
            success: false,
            message: "Failed to join meeting",
          });
        }
      },
    );

    socket.on(
      "meeting:leave",
      (meetingId: string, callback) => {
        try {
          if (
            typeof meetingId !== "string" ||
            !meetingId.trim()
          ) {
            return callback?.({
              success: false,
              message: "Meeting ID is required",
            });
          }

          const cleanMeetingId = meetingId.trim();
          const roomName = `meeting:${cleanMeetingId}`;

          socket.leave(roomName);

          socket.to(roomName).emit("meeting:user-left", {
            userId: user.userId,
          });

          callback?.({
            success: true,
            meetingId: cleanMeetingId,
          });

          console.log(
            `User ${user.email} left meeting ${cleanMeetingId}`,
          );
        } catch (error) {
          console.error("Meeting leave error:", error);

          callback?.({
            success: false,
            message: "Failed to leave meeting",
          });
        }
      },
    );

    // =========================
    // CONVERSATIONS
    // =========================

    // Create a conversation containing the current user.
    socket.on(
      "conversation:create",
      async (callback) => {
        try {
          const conversation = await createConversation(
            user.userId,
          );

          const conversationId = String(conversation.id);

          socket.join(conversationId);

          callback?.({
            success: true,
            conversation,
          });
        } catch (error) {
          console.error("Conversation create error:", error);

          callback?.({
            success: false,
            message: "Failed to create conversation",
          });
        }
      },
    );

    // Start a shared conversation with another registered user.
    socket.on(
      "conversation:start",
      async (
        data: { userId: string },
        callback,
      ) => {
        try {
          const targetUserId =
            typeof data?.userId === "string"
              ? data.userId.trim()
              : "";

          if (!targetUserId) {
            return callback?.({
              success: false,
              message: "The other user's ID is required",
            });
          }

          if (targetUserId === user.userId) {
            return callback?.({
              success: false,
              message: "You cannot start a conversation with yourself",
            });
          }

          // Verify that the recipient exists.
          const targetUser = await prisma.orm.public.User.first({
            id: targetUserId,
          });

          if (!targetUser) {
            return callback?.({
              success: false,
              message: "User not found",
            });
          }

          // Create the conversation with the current user.
          const conversation = await createConversation(
            user.userId,
          );

          const conversationId = String(conversation.id);

          // Add the selected user to the same conversation.
          await addConversationMember(
            conversationId,
            targetUserId,
          );

          // Join the initiator's current socket to the room.
          socket.join(conversationId);

          // Join the recipient's currently connected sockets
          // and notify them that a conversation was started.
          for (const connectedSocket of io.sockets.sockets.values()) {
            const connectedUser = connectedSocket.data
              .user as SocketUser | undefined;

            if (connectedUser?.userId === targetUserId) {
              connectedSocket.join(conversationId);

              connectedSocket.emit("conversation:invited", {
                conversation,
                conversationId,
                userId: user.userId,
                name: user.email,
              });
            }
          }

          callback?.({
            success: true,
            conversation,
            conversationId,
          });

          console.log(
            `Conversation ${conversationId} started by ${user.email} with ${targetUser.email}`,
          );
        } catch (error) {
          console.error("Conversation start error:", error);

          callback?.({
            success: false,
            message: "Failed to start conversation",
          });
        }
      },
    );

    // Join an existing conversation only if the user is a member.
    socket.on(
      "conversation:join",
      async (
        conversationId: string,
        callback,
      ) => {
        try {
          if (
            typeof conversationId !== "string" ||
            !conversationId.trim()
          ) {
            return callback?.({
              success: false,
              message: "Conversation ID is required",
            });
          }

          const cleanId = conversationId.trim();

          const member = await isConversationMember(
            cleanId,
            user.userId,
          );

          if (!member) {
            return callback?.({
              success: false,
              message:
                "You are not a member of this conversation",
            });
          }

          socket.join(cleanId);

          callback?.({
            success: true,
            conversationId: cleanId,
          });
        } catch (error) {
          console.error("Conversation join error:", error);

          callback?.({
            success: false,
            message: "Failed to join conversation",
          });
        }
      },
    );

    // Add a member to an existing conversation.
    socket.on(
      "conversation:add-member",
      async (
        data: {
          conversationId: string;
          userId: string;
        },
        callback,
      ) => {
        try {
          const conversationId =
            typeof data?.conversationId === "string"
              ? data.conversationId.trim()
              : "";

          const targetUserId =
            typeof data?.userId === "string"
              ? data.userId.trim()
              : "";

          if (!conversationId || !targetUserId) {
            return callback?.({
              success: false,
              message: "Conversation ID and user ID are required",
            });
          }

          const requesterIsMember =
            await isConversationMember(
              conversationId,
              user.userId,
            );

          if (!requesterIsMember) {
            return callback?.({
              success: false,
              message:
                "You are not a member of this conversation",
            });
          }

          const targetUser = await prisma.orm.public.User.first({
            id: targetUserId,
          });

          if (!targetUser) {
            return callback?.({
              success: false,
              message: "User not found",
            });
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

          // Join connected sockets for the newly added user.
          for (const connectedSocket of io.sockets.sockets.values()) {
            const connectedUser = connectedSocket.data
              .user as SocketUser | undefined;

            if (connectedUser?.userId === targetUserId) {
              connectedSocket.join(conversationId);

              connectedSocket.emit("conversation:invited", {
                conversationId,
                userId: user.userId,
                name: user.email,
              });
            }
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
          console.error("Add conversation member error:", error);

          callback?.({
            success: false,
            message: "Failed to add member",
          });
        }
      },
    );

    // Get conversation members.
    socket.on(
      "conversation:members",
      async (
        conversationId: string,
        callback,
      ) => {
        try {
          if (
            typeof conversationId !== "string" ||
            !conversationId.trim()
          ) {
            return callback?.({
              success: false,
              message: "Conversation ID is required",
            });
          }

          const cleanId = conversationId.trim();

          const member = await isConversationMember(
            cleanId,
            user.userId,
          );

          if (!member) {
            return callback?.({
              success: false,
              message:
                "You are not a member of this conversation",
            });
          }

          const members = await getConversationMembers(cleanId);

          callback?.({
            success: true,
            members,
          });
        } catch (error) {
          console.error("Get conversation members error:", error);

          callback?.({
            success: false,
            message: "Failed to get conversation members",
          });
        }
      },
    );

    // =========================
    // MESSAGES
    // =========================

    socket.on(
      "message:send",
      async (
        data: {
          conversationId: string;
          content: string;
        },
        callback,
      ) => {
        try {
          const conversationId =
            typeof data?.conversationId === "string"
              ? data.conversationId.trim()
              : "";

          const content =
            typeof data?.content === "string"
              ? data.content.trim()
              : "";

          if (!conversationId || !content) {
            return callback?.({
              success: false,
              message:
                "Conversation ID and message content are required",
            });
          }

          if (content.length > 5000) {
            return callback?.({
              success: false,
              message: "Message cannot exceed 5000 characters",
            });
          }

          const member = await isConversationMember(
            conversationId,
            user.userId,
          );

          if (!member) {
            return callback?.({
              success: false,
              message:
                "You are not a member of this conversation",
            });
          }

          const message = await createMessage({
            conversationId,
            senderId: user.userId,
            content,
          });

          io.to(conversationId).emit("message:new", {
            message,
          });

          callback?.({
            success: true,
            message,
          });
        } catch (error) {
          console.error("Send message error:", error);

          callback?.({
            success: false,
            message: "Failed to send message",
          });
        }
      },
    );

    // Load message history.
    socket.on(
      "message:history",
      async (
        conversationId: string,
        callback,
      ) => {
        try {
          if (
            typeof conversationId !== "string" ||
            !conversationId.trim()
          ) {
            return callback?.({
              success: false,
              message: "Conversation ID is required",
            });
          }

          const cleanId = conversationId.trim();

          const member = await isConversationMember(
            cleanId,
            user.userId,
          );

          if (!member) {
            return callback?.({
              success: false,
              message:
                "You are not a member of this conversation",
            });
          }

          const messages = await getConversationMessages(cleanId);

          callback?.({
            success: true,
            messages,
          });
        } catch (error) {
          console.error("Message history error:", error);

          callback?.({
            success: false,
            message: "Failed to get message history",
          });
        }
      },
    );

    // =========================
    // DISCONNECT
    // =========================

    socket.on("disconnect", () => {
      removeOnlineUser(io, user.userId, socket.id);

      console.log(
        `Socket disconnected: ${user.email} (${socket.id})`,
      );
    });
  });
}