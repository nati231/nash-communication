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
  sharing?: boolean;
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

type ScreenSharePayload = {
  meetingId: string;
  sharing: boolean;
};

type FilesChangedPayload = {
  meetingId?: string;
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

/**
 * Single authoritative implementation of meeting join/leave, chat, screen-share
 * notices, file-change notices and WebRTC signaling relay.
 * registerSocketHandlers.ts calls this once per authenticated socket.
 * Do not register meeting:join / meeting:leave anywhere else.
 */
export function registerMeetingChatHandlers(
  io: Server,
  socket: Socket,
  user: AuthenticatedUser,
) {
  // meetingId -> this socket's participant info for that meeting.
  // Stored on socket.data so other sockets can read display names.
  const joinedMeetings = new Map<string, Participant>();
  socket.data.meetingParticipants = joinedMeetings;

  // Meetings in which this socket is currently sharing its screen.
  const sharingMeetings = new Set<string>();
  socket.data.meetingSharing = sharingMeetings;

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

  // Everyone currently in the meeting room except this socket.
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

      if (!info) continue;

      const otherSharing = (
        other?.data.meetingSharing as Set<string> | undefined
      )?.has(meetingId);

      result.push({ ...info, sharing: Boolean(otherSharing) });
    }

    return result;
  }

  function leaveMeeting(meetingId: string) {
    if (!joinedMeetings.has(meetingId)) return;

    joinedMeetings.delete(meetingId);
    sharingMeetings.delete(meetingId);
    const room = meetingRoom(meetingId);
    void socket.leave(room);

    socket.to(room).emit("meeting:participant-left", {
      meetingId,
      socketId: socket.id,
      userId: user.userId,
    });
  }

  // ---------------------------------------------------------------
  // JOIN
  // Client: socket.emit("meeting:join", { meetingId, name }, ack)
  // ---------------------------------------------------------------
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

      // Joining the room and listing its members happen synchronously
      // (in-memory adapter), so two people joining at the same time can
      // never both miss each other.
      void socket.join(room);

      const participants = listOtherParticipants(meetingId);

      callback?.({ success: true, participants });

      // A repeated join from the same socket must not be announced twice.
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

  // ---------------------------------------------------------------
  // LEAVE
  // Client: socket.emit("meeting:leave", { meetingId })
  // ---------------------------------------------------------------
  socket.on(
    "meeting:leave",
    (payload: MeetingLeavePayload, ack?: () => void) => {
      if (isNonEmptyString(payload?.meetingId)) {
        leaveMeeting(payload.meetingId.trim());
      }

      if (typeof ack === "function") ack();
    },
  );

  // ---------------------------------------------------------------
  // SCREEN SHARE NOTICE
  // Client: socket.emit("meeting:screen-share", { meetingId, sharing })
  // Everyone else in the room gets "meeting:screen-share" with who and whether.
  // The video itself travels over WebRTC, not through this event.
  // ---------------------------------------------------------------
  socket.on("meeting:screen-share", (payload: ScreenSharePayload) => {
    if (
      !isNonEmptyString(payload?.meetingId) ||
      typeof payload.sharing !== "boolean"
    ) {
      return;
    }

    const meetingId = payload.meetingId.trim();
    const participant = joinedMeetings.get(meetingId);

    // Only someone who has joined this meeting can announce a share.
    if (!participant) return;

    if (payload.sharing) {
      sharingMeetings.add(meetingId);
    } else {
      sharingMeetings.delete(meetingId);
    }

    socket.to(meetingRoom(meetingId)).emit("meeting:screen-share", {
      meetingId,
      socketId: socket.id,
      userId: user.userId,
      name: participant.name,
      sharing: payload.sharing,
    });
  });

  // ---------------------------------------------------------------
  // FILES CHANGED NOTICE
  // Client: socket.emit("meeting:files-changed", { meetingId })
  // Everyone else in the room is told to reload the file list.
  // No file details travel through this event: each browser fetches the list
  // from the login-protected HTTP endpoint, so nothing can be faked here.
  // ---------------------------------------------------------------
  socket.on("meeting:files-changed", (payload: FilesChangedPayload) => {
    if (!isNonEmptyString(payload?.meetingId)) return;

    const meetingId = payload.meetingId.trim();
    const participant = joinedMeetings.get(meetingId);

    // Only someone who has joined this meeting can send the notice.
    if (!participant) return;

    socket.to(meetingRoom(meetingId)).emit("meeting:files-changed", {
      meetingId,
      userId: user.userId,
      name: participant.name,
    });
  });

  // ---------------------------------------------------------------
  // CHAT
  // Client: socket.emit("meeting:chat:send", { meetingId, content }, ack)
  // Everyone in the room (including the sender) gets "meeting:chat:new".
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // WEBRTC SIGNALING RELAY
  // Both sender and target must be in the same meeting room.
  // The membership check is synchronous so offer/answer/ICE messages
  // are relayed in the exact order they arrive.
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // DISCONNECT CLEANUP
  // "disconnecting" fires while the socket is still in its rooms.
  // ---------------------------------------------------------------
  socket.on("disconnecting", () => {
    for (const meetingId of joinedMeetings.keys()) {
      socket.to(meetingRoom(meetingId)).emit("meeting:participant-left", {
        meetingId,
        socketId: socket.id,
        userId: user.userId,
      });
    }

    joinedMeetings.clear();
    sharingMeetings.clear();
  });
}