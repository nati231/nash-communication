import type { Server, Socket } from "socket.io";
import { randomUUID } from "node:crypto";

type AuthenticatedUser = {
  userId: string;
  email?: string;
  name?: string;
};

type Participant = {
  socketId: string;
  userId: string;
  name: string;
  email?: string;
};

type MeetingMessage = {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
};

type Ack = (response: {
  success: boolean;
  error?: string;
  message?: MeetingMessage;
  participants?: Participant[];
}) => void;

type MeetingJoinPayload = {
  meetingId: string;
  name?: string;
};

type MeetingLeavePayload = {
  meetingId?: string;
};

type ChatSendPayload = {
  meetingId: string;
  content: string;
};

type SignalPayload = {
  meetingId: string;
  to: string;
  offer?: unknown;
  answer?: unknown;
  candidate?: unknown;
};

type SignalEvent =
  | "meeting:webrtc:offer"
  | "meeting:webrtc:answer"
  | "meeting:webrtc:ice";

const MAX_MEETING_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 5000;

const meetingRoom = (meetingId: string) => `meeting:${meetingId}`;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function registerMeetingChatHandlers(
  io: Server,
  socket: Socket,
  user: AuthenticatedUser,
) {
  const joinedMeetings = new Map<string, Participant>();
  socket.data.meetingParticipants = joinedMeetings;

  function buildParticipant(name?: string): Participant {
    return {
      socketId: socket.id,
      userId: user.userId,
      name:
        (typeof name === "string" ? name.trim().slice(0, MAX_NAME_LENGTH) : "") ||
        user.name?.trim() ||
        user.email ||
        "Participant",
      email: user.email,
    };
  }

  function listOtherParticipants(meetingId: string): Participant[] {
    const members = io.sockets.adapter.rooms.get(meetingRoom(meetingId));
    const result: Participant[] = [];
    if (!members) return result;

    for (const socketId of members) {
      if (socketId === socket.id) continue;

      const other = io.sockets.sockets.get(socketId);
      const info = (
        other?.data.meetingParticipants as
          | Map<string, Participant>
          | undefined
      )?.get(meetingId);

      if (info) result.push(info);
    }

    return result;
  }

  function leaveMeeting(meetingId: string) {
    if (!joinedMeetings.has(meetingId)) return;

    joinedMeetings.delete(meetingId);
    const room = meetingRoom(meetingId);
    void socket.leave(room);

    socket.to(room).emit("meeting:participant-left", {
      meetingId,
      socketId: socket.id,
      userId: user.userId,
    });
  }

  // JOIN: socket.emit("meeting:join", { meetingId, name }, ack)
  socket.on("meeting:join", (payload: MeetingJoinPayload, ack?: Ack) => {
    const callback = typeof ack === "function" ? ack : undefined;

    try {
      if (
        !isNonEmptyString(payload?.meetingId) ||
        payload.meetingId.trim().length > MAX_MEETING_ID_LENGTH
      ) {
        callback?.({ success: false, error: "A valid meetingId is required." });
        return;
      }

      const meetingId = payload.meetingId.trim();
      const room = meetingRoom(meetingId);
      const participant = buildParticipant(payload.name);
      const alreadyJoined = joinedMeetings.has(meetingId);

      joinedMeetings.set(meetingId, participant);

      void socket.join(room);

      const participants = listOtherParticipants(meetingId);

      callback?.({ success: true, participants });

      if (!alreadyJoined) {
        socket.to(room).emit("meeting:participant-joined", {
          meetingId,
          participant,
        });
      }
    } catch (error) {
      console.error("meeting:join failed:", error);
      callback?.({ success: false, error: "Failed to join the meeting." });
    }
  });

  // LEAVE: socket.emit("meeting:leave", { meetingId })
  socket.on(
    "meeting:leave",
    (payload: MeetingLeavePayload, ack?: () => void) => {
      if (isNonEmptyString(payload?.meetingId)) {
        leaveMeeting(payload.meetingId.trim());
      }

      if (typeof ack === "function") ack();
    },
  );

  // CHAT: socket.emit("meeting:chat:send", { meetingId, content }, ack)
  socket.on("meeting:chat:send", (payload: ChatSendPayload, ack?: Ack) => {
    const callback = typeof ack === "function" ? ack : undefined;

    if (
      !isNonEmptyString(payload?.meetingId) ||
      !isNonEmptyString(payload?.content)
    ) {
      callback?.({
        success: false,
        error: "A meetingId and message content are required.",
      });
      return;
    }

    const meetingId = payload.meetingId.trim();
    const content = payload.content.trim();

    const participant = joinedMeetings.get(meetingId);

    if (!participant) {
      callback?.({
        success: false,
        error: "Join the meeting before sending messages.",
      });
      return;
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      callback?.({
        success: false,
        error: `Messages cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
      });
      return;
    }

    const message: MeetingMessage = {
      id: randomUUID(),
      meetingId,
      senderId: user.userId,
      senderName: participant.name,
      content,
      createdAt: new Date().toISOString(),
    };

    io.to(meetingRoom(meetingId)).emit("meeting:chat:new", {
      meetingId,
      message,
    });

    callback?.({ success: true, message });
  });

  // WEBRTC SIGNALING RELAY
  function relaySignal(eventName: SignalEvent, payload: SignalPayload) {
    if (
      !isNonEmptyString(payload?.meetingId) ||
      !isNonEmptyString(payload?.to)
    ) {
      return;
    }

    const meetingId = payload.meetingId.trim();
    const targetSocketId = payload.to.trim();

    if (!joinedMeetings.has(meetingId)) return;
    if (targetSocketId === socket.id) return;

    const members = io.sockets.adapter.rooms.get(meetingRoom(meetingId));
    if (!members?.has(targetSocketId)) return;

    const forwarded: Record<string, unknown> = {
      meetingId,
      from: socket.id,
      to: targetSocketId,
    };

    if (eventName === "meeting:webrtc:offer") {
      if (!payload.offer) return;
      forwarded.offer = payload.offer;
    } else if (eventName === "meeting:webrtc:answer") {
      if (!payload.answer) return;
      forwarded.answer = payload.answer;
    } else {
      if (!payload.candidate) return;
      forwarded.candidate = payload.candidate;
    }

    io.to(targetSocketId).emit(eventName, forwarded);
  }

  socket.on("meeting:webrtc:offer", (payload: SignalPayload) => {
    relaySignal("meeting:webrtc:offer", payload);
  });

  socket.on("meeting:webrtc:answer", (payload: SignalPayload) => {
    relaySignal("meeting:webrtc:answer", payload);
  });

  socket.on("meeting:webrtc:ice", (payload: SignalPayload) => {
    relaySignal("meeting:webrtc:ice", payload);
  });

  // DISCONNECT CLEANUP
  socket.on("disconnecting", () => {
    for (const meetingId of joinedMeetings.keys()) {
      socket.to(meetingRoom(meetingId)).emit("meeting:participant-left", {
        meetingId,
        socketId: socket.id,
        userId: user.userId,
      });
    }

    joinedMeetings.clear();
  });
}