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

// ---------------------------------------------------------------
// WHITEBOARD TYPES
// Positions are fractions of the board (0 to 1), so a drawing lines up on any
// screen size. Widths and text sizes are in "board units": the client scales
// them as if the board were 1000 units wide.
// ---------------------------------------------------------------
type BoardKind = "pen" | "eraser" | "line" | "rect" | "ellipse" | "text";

type BoardPoint = { x: number; y: number };

type BoardItem = {
  id: string;
  kind: BoardKind;
  color: string;
  width: number;
  points: BoardPoint[];
  text?: string;
  userId: string;
};

type BoardState = {
  items: BoardItem[];
  totalPoints: number;
};

type BoardAck = (response: {
  success: boolean;
  error?: string;
  items?: BoardItem[];
  item?: BoardItem;
}) => void;

type BoardMeetingPayload = {
  meetingId?: string;
};

type BoardAddPayload = {
  meetingId?: string;
  item?: unknown;
};

type BoardPointsPayload = {
  meetingId?: string;
  id?: unknown;
  points?: unknown;
};

const MAX_MEETING_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 5000;

const MAX_BOARD_ITEMS = 500;
const MAX_POINTS_PER_ITEM = 2000;
const MAX_POINTS_PER_BATCH = 200;
const MAX_TOTAL_POINTS = 60000;
const MAX_BOARD_TEXT_LENGTH = 200;
const MAX_BOARD_EVENTS_PER_SECOND = 120;

const BOARD_KINDS = new Set<string>([
  "pen",
  "eraser",
  "line",
  "rect",
  "ellipse",
  "text",
]);
const BOARD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const BOARD_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// One whiteboard per meeting, kept in server memory only.
// It is removed when the last person leaves the meeting.
const boards = new Map<string, BoardState>();

const meetingRoom = (meetingId: string) => `meeting:${meetingId}`;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundCoordinate(value: number) {
  return Math.round(clamp(value, 0, 1) * 10000) / 10000;
}

function cleanPoint(value: unknown): BoardPoint | null {
  if (!isRecord(value)) return null;

  const { x, y } = value;

  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }

  return { x: roundCoordinate(x), y: roundCoordinate(y) };
}

function cleanPoints(value: unknown, max: number): BoardPoint[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    return null;
  }

  const result: BoardPoint[] = [];

  for (const entry of value) {
    const point = cleanPoint(entry);
    if (!point) return null;
    result.push(point);
  }

  return result;
}

// Checks an item sent by a browser and returns a clean copy, or null if
// anything about it is wrong. The sender's real user ID is always used.
function cleanBoardItem(value: unknown, userId: string): BoardItem | null {
  if (!isRecord(value)) return null;

  const { id, kind, color, width, points, text } = value;

  if (typeof id !== "string" || !BOARD_ID_PATTERN.test(id)) return null;
  if (typeof kind !== "string" || !BOARD_KINDS.has(kind)) return null;
  if (typeof color !== "string" || !BOARD_COLOR_PATTERN.test(color)) {
    return null;
  }
  if (typeof width !== "number" || !Number.isFinite(width)) return null;

  const boardKind = kind as BoardKind;
  const cleanedPoints = cleanPoints(points, MAX_POINTS_PER_ITEM);

  if (!cleanedPoints) return null;

  if (
    (boardKind === "line" ||
      boardKind === "rect" ||
      boardKind === "ellipse") &&
    cleanedPoints.length !== 2
  ) {
    return null;
  }

  if (boardKind === "text" && cleanedPoints.length !== 1) return null;

  const item: BoardItem = {
    id,
    kind: boardKind,
    color: color.toLowerCase(),
    width:
      boardKind === "text" ? clamp(width, 8, 120) : clamp(width, 1, 60),
    points: cleanedPoints,
    userId,
  };

  if (boardKind === "text") {
    if (typeof text !== "string") return null;

    const cleanedText = text
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, MAX_BOARD_TEXT_LENGTH);

    if (!cleanedText) return null;

    item.text = cleanedText;
  }

  return item;
}

/**
 * Single authoritative implementation of meeting join/leave, chat, screen-share
 * notices, file-change notices, whiteboard and WebRTC signaling relay.
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

  // Light protection against a browser flooding the whiteboard events.
  let boardWindowStart = Date.now();
  let boardEventCount = 0;

  function boardEventAllowed(): boolean {
    const now = Date.now();

    if (now - boardWindowStart >= 1000) {
      boardWindowStart = now;
      boardEventCount = 0;
    }

    boardEventCount += 1;
    return boardEventCount <= MAX_BOARD_EVENTS_PER_SECOND;
  }

  // Returns the meeting ID only if this socket has joined that meeting.
  function joinedBoardMeeting(payload: BoardMeetingPayload): string {
    if (!isNonEmptyString(payload?.meetingId)) return "";

    const meetingId = payload.meetingId.trim();
    return joinedMeetings.has(meetingId) ? meetingId : "";
  }

  // Forgets the board once nobody else is left in the meeting.
  function dropBoardIfEmpty(meetingId: string) {
    const members = io.sockets.adapter.rooms.get(meetingRoom(meetingId));
    let others = 0;

    if (members) {
      for (const socketId of members) {
        if (socketId !== socket.id) others += 1;
      }
    }

    if (others === 0) boards.delete(meetingId);
  }

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

    dropBoardIfEmpty(meetingId);

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
  // WHITEBOARD
  //
  // Client -> server:
  //   whiteboard:sync        { meetingId }                    ack: { items }
  //   whiteboard:item:add    { meetingId, item }              ack
  //   whiteboard:item:points { meetingId, id, points }        ack
  //   whiteboard:undo        { meetingId }                    ack: { item }
  //   whiteboard:clear       { meetingId }                    ack
  //
  // Server -> everyone else in the meeting:
  //   whiteboard:item:add    { meetingId, item }
  //   whiteboard:item:points { meetingId, id, points }
  //   whiteboard:item:remove { meetingId, id }
  //   whiteboard:cleared     { meetingId, userId, name }
  //
  // The sender draws locally, so it is not sent its own events.
  // Redo is done by the client sending whiteboard:item:add again with the
  // item that undo returned.
  // ---------------------------------------------------------------

  // Sends the current board to someone who has just opened it.
  socket.on("whiteboard:sync", (payload: BoardMeetingPayload, ack?: BoardAck) => {
    const callback = typeof ack === "function" ? ack : undefined;

    if (!boardEventAllowed()) {
      callback?.({ success: false, error: "Too many requests. Slow down." });
      return;
    }

    const meetingId = joinedBoardMeeting(payload);

    if (!meetingId) {
      callback?.({
        success: false,
        error: "Join the meeting before using the whiteboard.",
      });
      return;
    }

    callback?.({ success: true, items: boards.get(meetingId)?.items ?? [] });
  });

  // Adds a complete item (a shape, text, a redone item) or the first part of a
  // pen or eraser stroke. More of a stroke follows in whiteboard:item:points.
  socket.on("whiteboard:item:add", (payload: BoardAddPayload, ack?: BoardAck) => {
    const callback = typeof ack === "function" ? ack : undefined;

    if (!boardEventAllowed()) {
      callback?.({ success: false, error: "Too many requests. Slow down." });
      return;
    }

    const meetingId = joinedBoardMeeting(payload);

    if (!meetingId) {
      callback?.({
        success: false,
        error: "Join the meeting before using the whiteboard.",
      });
      return;
    }

    const item = cleanBoardItem(payload.item, user.userId);

    if (!item) {
      callback?.({ success: false, error: "That drawing could not be used." });
      return;
    }

    let board = boards.get(meetingId);

    if (!board) {
      board = { items: [], totalPoints: 0 };
      boards.set(meetingId, board);
    }

    if (board.items.length >= MAX_BOARD_ITEMS) {
      callback?.({
        success: false,
        error: "The board is full. Clear it to keep drawing.",
      });
      return;
    }

    if (board.totalPoints + item.points.length > MAX_TOTAL_POINTS) {
      callback?.({
        success: false,
        error: "The board has too much on it. Clear it to keep drawing.",
      });
      return;
    }

    if (board.items.some((existing) => existing.id === item.id)) {
      callback?.({ success: false, error: "That drawing already exists." });
      return;
    }

    board.items.push(item);
    board.totalPoints += item.points.length;

    socket.to(meetingRoom(meetingId)).emit("whiteboard:item:add", {
      meetingId,
      item,
    });

    callback?.({ success: true });
  });

  // Adds more points to a pen or eraser stroke the sender is still drawing.
  socket.on(
    "whiteboard:item:points",
    (payload: BoardPointsPayload, ack?: BoardAck) => {
      const callback = typeof ack === "function" ? ack : undefined;

      if (!boardEventAllowed()) {
        callback?.({ success: false, error: "Too many requests. Slow down." });
        return;
      }

      const meetingId = joinedBoardMeeting(payload);

      if (!meetingId) {
        callback?.({
          success: false,
          error: "Join the meeting before using the whiteboard.",
        });
        return;
      }

      if (typeof payload.id !== "string" || !BOARD_ID_PATTERN.test(payload.id)) {
        callback?.({ success: false, error: "That drawing could not be used." });
        return;
      }

      const points = cleanPoints(payload.points, MAX_POINTS_PER_BATCH);

      if (!points) {
        callback?.({ success: false, error: "Those points could not be used." });
        return;
      }

      const board = boards.get(meetingId);
      let target: BoardItem | undefined;

      if (board) {
        // Newest first: the stroke being drawn is almost always the last one.
        for (let index = board.items.length - 1; index >= 0; index -= 1) {
          const candidate = board.items[index];

          if (candidate && candidate.id === payload.id) {
            target = candidate;
            break;
          }
        }
      }

      // Only the person who started a pen or eraser stroke can extend it.
      if (
        !board ||
        !target ||
        target.userId !== user.userId ||
        (target.kind !== "pen" && target.kind !== "eraser")
      ) {
        callback?.({ success: false, error: "That stroke can't be changed." });
        return;
      }

      if (
        target.points.length + points.length > MAX_POINTS_PER_ITEM ||
        board.totalPoints + points.length > MAX_TOTAL_POINTS
      ) {
        callback?.({
          success: false,
          error: "That stroke is too long. Lift the pen and start a new one.",
        });
        return;
      }

      target.points.push(...points);
      board.totalPoints += points.length;

      socket.to(meetingRoom(meetingId)).emit("whiteboard:item:points", {
        meetingId,
        id: target.id,
        points,
      });

      callback?.({ success: true });
    },
  );

  // Removes the sender's most recent item. The removed item is returned so the
  // browser can offer it again as a redo.
  socket.on("whiteboard:undo", (payload: BoardMeetingPayload, ack?: BoardAck) => {
    const callback = typeof ack === "function" ? ack : undefined;

    if (!boardEventAllowed()) {
      callback?.({ success: false, error: "Too many requests. Slow down." });
      return;
    }

    const meetingId = joinedBoardMeeting(payload);

    if (!meetingId) {
      callback?.({
        success: false,
        error: "Join the meeting before using the whiteboard.",
      });
      return;
    }

    const board = boards.get(meetingId);
    let removeAt = -1;

    if (board) {
      for (let index = board.items.length - 1; index >= 0; index -= 1) {
        if (board.items[index]?.userId === user.userId) {
          removeAt = index;
          break;
        }
      }
    }

    if (!board || removeAt < 0) {
      callback?.({ success: false, error: "Nothing to undo." });
      return;
    }

    const [removed] = board.items.splice(removeAt, 1);

    if (!removed) {
      callback?.({ success: false, error: "Nothing to undo." });
      return;
    }

    board.totalPoints = Math.max(0, board.totalPoints - removed.points.length);

    socket.to(meetingRoom(meetingId)).emit("whiteboard:item:remove", {
      meetingId,
      id: removed.id,
    });

    callback?.({ success: true, item: removed });
  });

  // Wipes the board for everyone.
  socket.on("whiteboard:clear", (payload: BoardMeetingPayload, ack?: BoardAck) => {
    const callback = typeof ack === "function" ? ack : undefined;

    if (!boardEventAllowed()) {
      callback?.({ success: false, error: "Too many requests. Slow down." });
      return;
    }

    const meetingId = joinedBoardMeeting(payload);
    const participant = meetingId ? joinedMeetings.get(meetingId) : undefined;

    if (!meetingId || !participant) {
      callback?.({
        success: false,
        error: "Join the meeting before using the whiteboard.",
      });
      return;
    }

    boards.delete(meetingId);

    socket.to(meetingRoom(meetingId)).emit("whiteboard:cleared", {
      meetingId,
      userId: user.userId,
      name: participant.name,
    });

    callback?.({ success: true });
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
      dropBoardIfEmpty(meetingId);

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