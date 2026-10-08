import type { Server } from "socket.io";

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

export function registerSocketHandlers(
  io: Server,
) {
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const user =
      socket.data.user as SocketUser;

    console.log(
      `Socket authenticated: ${user.email} (${socket.id})`,
    );

    // =========================
    // PRESENCE
    // =========================

    addOnlineUser(
      io,
      user.userId,
      socket.id,
    );

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
              message:
                "Meeting ID is required",
            });
          }

          const cleanMeetingId =
            meetingId.trim();

          const roomName =
            `meeting:${cleanMeetingId}`;

          // Save this user's meeting information
          // on the socket.
          socket.data.meetingParticipant = {
            name:
              typeof participant?.name ===
                "string" &&
              participant.name.trim()
                ? participant.name.trim()
                : "User",

            email:
              typeof participant?.email ===
                "string" &&
              participant.email.trim()
                ? participant.email.trim()
                : user.email,
          };

          socket.join(roomName);

          const room =
            io.sockets.adapter.rooms.get(
              roomName,
            );

          const participants: MeetingParticipant[] =
            [];

          if (room) {
            for (const socketId of room) {
              const participantSocket =
                io.sockets.sockets.get(
                  socketId,
                );

              if (!participantSocket) {
                continue;
              }

              const socketUser =
                participantSocket.data
                  .user as
                  | SocketUser
                  | undefined;

              if (!socketUser) {
                continue;
              }

              const meetingParticipant =
                participantSocket.data
                  .meetingParticipant as
                  | {
                      name?: string;
                      email?: string;
                    }
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

          // Tell existing participants
          // that this user joined.
          socket
            .to(roomName)
            .emit(
              "meeting:user-joined",
              {
                participant: {
                  id: user.userId,
                  name:
                    socket.data
                      .meetingParticipant
                      ?.name ||
                    user.email,
                  email:
                    socket.data
                      .meetingParticipant
                      ?.email ||
                    user.email,
                },
              },
            );

          console.log(
            `User ${user.email} joined meeting ${cleanMeetingId}`,
          );
        } catch (error) {
          console.error(
            "Meeting join error:",
            error,
          );

          callback?.({
            success: false,
            message:
              "Failed to join meeting",
          });
        }
      },
    );

    socket.on(
      "meeting:leave",
      (
        meetingId: string,
        callback,
      ) => {
        try {
          if (
            typeof meetingId !== "string" ||
            !meetingId.trim()
          ) {
            return callback?.({
              success: false,
              message:
                "Meeting ID is required",
            });
          }

          const cleanMeetingId =
            meetingId.trim();

          const roomName =
            `meeting:${cleanMeetingId}`;

          socket.leave(roomName);

          socket
            .to(roomName)
            .emit(
              "meeting:user-left",
              {
                userId: user.userId,
              },
            );

          callback?.({
            success: true,
            meetingId: cleanMeetingId,
          });

          console.log(
            `User ${user.email} left meeting ${cleanMeetingId}`,
          );
        } catch (error) {
          console.error(
            "Meeting leave error:",
            error,
          );

          callback?.({
            success: false,
            message:
              "Failed to leave meeting",
          });
        }
      },
    );

    // =========================
    // CONVERSATIONS
    // =========================

    socket.on(
      "conversation:create",
      async (callback) => {
        try {
          const conversation =
            await createConversation(
              user.userId,
            );

          const conversationId =
            String(conversation.id);

          socket.join(conversationId);

          callback?.({
            success: true,
            conversation,
          });
        } catch {
          callback?.({
            success: false,
            message:
              "Failed to create conversation",
          });
        }
      },
    );

    socket.on(
      "conversation:join",
      async (
        conversationId: string,
        callback,
      ) => {
        try {
          const member =
            await isConversationMember(
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

          socket.join(conversationId);

          callback?.({
            success: true,
            conversationId,
          });
        } catch {
          callback?.({
            success: false,
            message:
              "Failed to join conversation",
          });
        }
      },
    );

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
          const requesterIsMember =
            await isConversationMember(
              data.conversationId,
              user.userId,
            );

          if (!requesterIsMember) {
            return callback?.({
              success: false,
              message:
                "You are not a member of this conversation",
            });
          }

          await addConversationMember(
            data.conversationId,
            data.userId,
          );

          callback?.({
            success: true,
          });

          io.to(
            data.conversationId,
          ).emit(
            "conversation:member-added",
            {
              conversationId:
                data.conversationId,
              userId: data.userId,
            },
          );
        } catch {
          callback?.({
            success: false,
            message:
              "Failed to add member",
          });
        }
      },
    );

    socket.on(
      "conversation:members",
      async (
        conversationId: string,
        callback,
      ) => {
        try {
          const member =
            await isConversationMember(
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

          const members =
            await getConversationMembers(
              conversationId,
            );

          callback?.({
            success: true,
            members,
          });
        } catch {
          callback?.({
            success: false,
            message:
              "Failed to get conversation members",
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
          if (
            !data?.conversationId ||
            !data?.content ||
            typeof data.content !== "string"
          ) {
            return callback?.({
              success: false,
              message:
                "Conversation ID and message content are required",
            });
          }

          const content =
            data.content.trim();

          if (!content) {
            return callback?.({
              success: false,
              message:
                "Message cannot be empty",
            });
          }

          const member =
            await isConversationMember(
              data.conversationId,
              user.userId,
            );

          if (!member) {
            return callback?.({
              success: false,
              message:
                "You are not a member of this conversation",
            });
          }

          const message =
            await createMessage({
              conversationId:
                data.conversationId,
              senderId: user.userId,
              content,
            });

          io.to(
            data.conversationId,
          ).emit(
            "message:new",
            {
              message,
            },
          );

          callback?.({
            success: true,
            message,
          });
        } catch {
          callback?.({
            success: false,
            message:
              "Failed to send message",
          });
        }
      },
    );

    socket.on(
      "message:history",
      async (
        conversationId: string,
        callback,
      ) => {
        try {
          const member =
            await isConversationMember(
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

          const messages =
            await getConversationMessages(
              conversationId,
            );

          callback?.({
            success: true,
            messages,
          });
        } catch {
          callback?.({
            success: false,
            message:
              "Failed to get message history",
          });
        }
      },
    );

    // =========================
    // DISCONNECT
    // =========================

    socket.on(
      "disconnect",
      () => {
        removeOnlineUser(
          io,
          user.userId,
          socket.id,
        );

        console.log(
          `Socket disconnected: ${user.email} (${socket.id})`,
        );
      },
    );
  });
}