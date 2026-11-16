"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { Socket } from "socket.io-client";

type BoardKind = "pen" | "eraser" | "line" | "rect" | "ellipse" | "text";

type BoardPoint = { x: number; y: number };

type BoardItem = {
  id: string;
  kind: BoardKind;
  color: string;
  width: number;
  points: BoardPoint[];
  text?: string;
  userId?: string;
};

type BoardAck = {
  success: boolean;
  error?: string;
  items?: BoardItem[];
  item?: BoardItem;
};

type ActiveStroke = {
  id: string;
  pointerId: number;
  item: BoardItem;
  last: BoardPoint;
  pending: BoardPoint[];
  timer: number | null;
  failed: boolean;
};

type ShapeKind = "line" | "rect" | "ellipse";

type ActiveShape = {
  pointerId: number;
  kind: ShapeKind;
  start: BoardPoint;
};

type TextDraft = {
  x: number;
  y: number;
  value: string;
  color: string;
  units: number;
  fontPx: number;
};

type Props = {
  meetingId: string;
  socketRef: RefObject<Socket | null>;
  joined: boolean;
  onClose: () => void;
};

// Widths are measured as if the board were this many units wide, so a
// drawing looks the same on a phone and on a large monitor.
const BOARD_UNITS = 1000;

// A little under the server's limit of 2000 points per stroke.
const MAX_POINTS_PER_STROKE = 1990;
const MAX_POINTS_PER_BATCH = 200;
const FLUSH_DELAY_MS = 40;

// How long to wait for the server before giving up on undo, redo or clear.
const ACTION_TIMEOUT_MS = 5000;

// How many undone drawings are kept for redo.
const MAX_REDO_ITEMS = 100;

// Shapes smaller than this many screen pixels are treated as a stray click.
const MIN_SHAPE_PIXELS = 4;

// Same as the server's limit for one line of text.
const MAX_TEXT_LENGTH = 200;

const DEFAULT_COLOR = "#111827";

const TOOLS: { id: BoardKind; label: string }[] = [
  { id: "pen", label: "Pen" },
  { id: "eraser", label: "Eraser" },
  { id: "line", label: "Line" },
  { id: "rect", label: "Rectangle" },
  { id: "ellipse", label: "Oval" },
  { id: "text", label: "Text" },
];

const COLORS = [
  { name: "Black", value: "#111827" },
  { name: "Red", value: "#dc2626" },
  { name: "Blue", value: "#2563eb" },
  { name: "Green", value: "#16a34a" },
  { name: "Orange", value: "#ea580c" },
  { name: "Purple", value: "#9333ea" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  item: BoardItem,
  width: number,
  height: number
) {
  const first = item.points[0];
  if (!first) return;

  const scale = width / BOARD_UNITS;
  const toX = (point: BoardPoint) => point.x * width;
  const toY = (point: BoardPoint) => point.y * height;

  ctx.save();
  ctx.globalCompositeOperation =
    item.kind === "eraser" ? "destination-out" : "source-over";
  ctx.strokeStyle = item.color;
  ctx.fillStyle = item.color;
  ctx.lineWidth = Math.max(1, item.width * scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (item.kind === "pen" || item.kind === "eraser") {
    if (item.points.length === 1) {
      // A single click leaves a dot.
      ctx.beginPath();
      ctx.arc(toX(first), toY(first), ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(toX(first), toY(first));

      for (let index = 1; index < item.points.length; index += 1) {
        const point = item.points[index];
        if (point) ctx.lineTo(toX(point), toY(point));
      }

      ctx.stroke();
    }
  } else if (item.kind === "text") {
    ctx.font = `${Math.max(8, item.width * scale)}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(item.text ?? "", toX(first), toY(first));
  } else {
    const second = item.points[1];

    if (second) {
      const x1 = toX(first);
      const y1 = toY(first);
      const x2 = toX(second);
      const y2 = toY(second);

      if (item.kind === "line") {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      } else if (item.kind === "rect") {
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      } else if (item.kind === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          (x1 + x2) / 2,
          (y1 + y2) / 2,
          Math.abs(x2 - x1) / 2,
          Math.abs(y2 - y1) / 2,
          0,
          0,
          Math.PI * 2
        );
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

export function Whiteboard({ meetingId, socketRef, joined, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const itemsRef = useRef<BoardItem[]>([]);
  const redoStackRef = useRef<BoardItem[]>([]);
  const previewRef = useRef<BoardItem | null>(null);
  const redrawQueuedRef = useRef(false);
  const strokeRef = useRef<ActiveStroke | null>(null);
  const shapeRef = useRef<ActiveShape | null>(null);
  const actionBusyRef = useRef(false);
  const textDraftRef = useRef<TextDraft | null>(null);

  const [tool, setTool] = useState<BoardKind>("pen");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [width, setWidth] = useState(6);
  const [redoCount, setRedoCount] = useState(0);
  const [textDraft, setTextDraftState] = useState<TextDraft | null>(null);
  const [error, setError] = useState("");

  const setTextDraft = useCallback((draft: TextDraft | null) => {
    textDraftRef.current = draft;
    setTextDraftState(draft);
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const item of itemsRef.current) {
      drawItem(ctx, item, canvas.width, canvas.height);
    }

    // The outline of a shape that is still being dragged.
    if (previewRef.current) {
      drawItem(ctx, previewRef.current, canvas.width, canvas.height);
    }
  }, []);

  // Redraws at most once per screen frame, however many events arrive.
  const scheduleRedraw = useCallback(() => {
    if (redrawQueuedRef.current) return;

    redrawQueuedRef.current = true;

    window.requestAnimationFrame(() => {
      redrawQueuedRef.current = false;
      redraw();
    });
  }, [redraw]);

  const resetRedo = useCallback(() => {
    redoStackRef.current = [];
    setRedoCount(0);
  }, []);

  const isDrawing = () =>
    strokeRef.current !== null || shapeRef.current !== null;

  // Keeps the canvas sharp and the right size when the window changes.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const nextWidth = Math.max(1, Math.round(rect.width * ratio));
      const nextHeight = Math.max(1, Math.round(rect.height * ratio));

      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }

      redraw();
    };

    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => observer.disconnect();
  }, [redraw]);

  // Receives other people's drawing and loads the board that already exists.
  useEffect(() => {
    if (!joined) return;

    const socket = socketRef.current;
    if (!socket) return;

    let active = true;

    const onAdd = (data: { meetingId?: string; item?: BoardItem }) => {
      if (data?.meetingId !== meetingId || !data.item) return;

      const incoming = data.item;
      if (itemsRef.current.some((existing) => existing.id === incoming.id)) {
        return;
      }

      itemsRef.current.push(incoming);
      scheduleRedraw();
    };

    const onPoints = (data: {
      meetingId?: string;
      id?: string;
      points?: BoardPoint[];
    }) => {
      if (data?.meetingId !== meetingId || !data.id || !data.points) return;

      for (let index = itemsRef.current.length - 1; index >= 0; index -= 1) {
        const item = itemsRef.current[index];

        if (item && item.id === data.id) {
          item.points.push(...data.points);
          scheduleRedraw();
          return;
        }
      }
    };

    const onRemove = (data: { meetingId?: string; id?: string }) => {
      if (data?.meetingId !== meetingId || !data.id) return;

      itemsRef.current = itemsRef.current.filter((item) => item.id !== data.id);
      scheduleRedraw();
    };

    const onCleared = (data: { meetingId?: string }) => {
      if (data?.meetingId !== meetingId) return;

      itemsRef.current = [];
      redoStackRef.current = [];
      setRedoCount(0);
      scheduleRedraw();
    };

    socket.on("whiteboard:item:add", onAdd);
    socket.on("whiteboard:item:points", onPoints);
    socket.on("whiteboard:item:remove", onRemove);
    socket.on("whiteboard:cleared", onCleared);

    socket.emit("whiteboard:sync", { meetingId }, (response: BoardAck) => {
      if (!active) return;

      if (!response?.success) {
        setError(response?.error || "Could not load the whiteboard.");
        return;
      }

      itemsRef.current = Array.isArray(response.items) ? response.items : [];
      scheduleRedraw();
    });

    return () => {
      active = false;
      socket.off("whiteboard:item:add", onAdd);
      socket.off("whiteboard:item:points", onPoints);
      socket.off("whiteboard:item:remove", onRemove);
      socket.off("whiteboard:cleared", onCleared);
    };
  }, [joined, meetingId, socketRef, scheduleRedraw]);

  // Stops any half-finished drawing if the board is closed.
  useEffect(() => {
    return () => {
      const stroke = strokeRef.current;

      if (stroke && stroke.timer !== null) {
        window.clearTimeout(stroke.timer);
      }

      strokeRef.current = null;
      shapeRef.current = null;
      previewRef.current = null;
    };
  }, []);

  // Sends the points collected since the last send.
  const flushStroke = useCallback(
    (stroke: ActiveStroke) => {
      if (stroke.timer !== null) {
        window.clearTimeout(stroke.timer);
        stroke.timer = null;
      }

      const socket = socketRef.current;

      while (stroke.pending.length > 0) {
        const points = stroke.pending.splice(0, MAX_POINTS_PER_BATCH);

        if (stroke.failed || !socket?.connected) continue;

        socket.emit(
          "whiteboard:item:points",
          { meetingId, id: stroke.id, points },
          (response: BoardAck) => {
            if (!response?.success) {
              stroke.failed = true;
              setError(response?.error || "Could not send your drawing.");
            }
          }
        );
      }
    },
    [meetingId, socketRef]
  );

  // Adds a finished shape or piece of text to the board and sends it to
  // everyone else. If the server refuses it, it is taken off the board again.
  const sendNewItem = useCallback(
    (item: BoardItem) => {
      const socket = socketRef.current;

      if (!socket?.connected) {
        setError("You're not connected to the meeting.");
        return;
      }

      itemsRef.current.push(item);
      resetRedo();
      scheduleRedraw();

      socket.emit("whiteboard:item:add", { meetingId, item }, (response: BoardAck) => {
        if (!response?.success) {
          itemsRef.current = itemsRef.current.filter(
            (existing) => existing.id !== item.id
          );
          scheduleRedraw();
          setError(response?.error || "Could not send your drawing.");
        }
      });
    },
    [meetingId, resetRedo, scheduleRedraw, socketRef]
  );

  // Undo, redo and clear share these checks. They wait for the server's answer
  // and give up after a few seconds, so a dropped connection can't leave the
  // buttons stuck.
  const startAction = useCallback((): Socket | null => {
    if (strokeRef.current || shapeRef.current || actionBusyRef.current) {
      return null;
    }

    const socket = socketRef.current;

    if (!joined || !socket?.connected) {
      setError("You're not connected to the meeting.");
      return null;
    }

    actionBusyRef.current = true;
    setError("");

    return socket;
  }, [joined, socketRef]);

  const undo = useCallback(() => {
    const socket = startAction();
    if (!socket) return;

    socket
      .timeout(ACTION_TIMEOUT_MS)
      .emit(
        "whiteboard:undo",
        { meetingId },
        (timeoutError: Error | null, response?: BoardAck) => {
          actionBusyRef.current = false;

          if (timeoutError) {
            setError("The server didn't answer. Check your connection.");
            return;
          }

          if (!response?.success || !response.item) {
            setError(response?.error || "Nothing to undo.");
            return;
          }

          const removed = response.item;

          itemsRef.current = itemsRef.current.filter(
            (item) => item.id !== removed.id
          );

          redoStackRef.current.push(removed);

          if (redoStackRef.current.length > MAX_REDO_ITEMS) {
            redoStackRef.current.shift();
          }

          setRedoCount(redoStackRef.current.length);
          scheduleRedraw();
        }
      );
  }, [meetingId, scheduleRedraw, startAction]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;

    const socket = startAction();
    if (!socket) return;

    const item = redoStackRef.current.pop();

    if (!item) {
      actionBusyRef.current = false;
      return;
    }

    setRedoCount(redoStackRef.current.length);

    socket
      .timeout(ACTION_TIMEOUT_MS)
      .emit(
        "whiteboard:item:add",
        { meetingId, item },
        (timeoutError: Error | null, response?: BoardAck) => {
          actionBusyRef.current = false;

          if (timeoutError || !response?.success) {
            // Keep it available, so the person can try again.
            redoStackRef.current.push(item);
            setRedoCount(redoStackRef.current.length);
            setError(
              timeoutError
                ? "The server didn't answer. Check your connection."
                : response?.error || "Could not redo that drawing."
            );
            return;
          }

          if (!itemsRef.current.some((existing) => existing.id === item.id)) {
            itemsRef.current.push(item);
          }

          scheduleRedraw();
        }
      );
  }, [meetingId, scheduleRedraw, startAction]);

  const clearBoard = useCallback(() => {
    if (strokeRef.current || shapeRef.current || actionBusyRef.current) return;

    const confirmed = window.confirm(
      "Clear the whole whiteboard for everyone in the meeting? This can't be undone."
    );

    if (!confirmed) return;

    const socket = startAction();
    if (!socket) return;

    socket
      .timeout(ACTION_TIMEOUT_MS)
      .emit(
        "whiteboard:clear",
        { meetingId },
        (timeoutError: Error | null, response?: BoardAck) => {
          actionBusyRef.current = false;

          if (timeoutError || !response?.success) {
            setError(
              timeoutError
                ? "The server didn't answer. Check your connection."
                : response?.error || "Could not clear the board."
            );
            return;
          }

          itemsRef.current = [];
          resetRedo();
          scheduleRedraw();
        }
      );
  }, [meetingId, resetRedo, scheduleRedraw, startAction]);

  // Places the text the person typed. Safe to call twice: the second call
  // finds nothing left to place.
  const commitText = useCallback(() => {
    const draft = textDraftRef.current;
    if (!draft) return;

    setTextDraft(null);

    const text = draft.value.trim();
    if (!text) return;

    sendNewItem({
      id: crypto.randomUUID(),
      kind: "text",
      color: draft.color,
      width: draft.units,
      points: [{ x: draft.x, y: draft.y }],
      text: text.slice(0, MAX_TEXT_LENGTH),
    });
  }, [sendNewItem, setTextDraft]);

  const pointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ): BoardPoint | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isDrawing() || actionBusyRef.current) return;

    // Text is placed by a click, handled in handleCanvasClick.
    if (tool === "text") return;

    const socket = socketRef.current;

    if (!joined || !socket?.connected) {
      setError("You're not connected to the meeting.");
      return;
    }

    const point = pointFromEvent(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);

    // Shapes: show an outline while dragging, send the shape on release.
    if (tool === "line" || tool === "rect" || tool === "ellipse") {
      shapeRef.current = { pointerId: event.pointerId, kind: tool, start: point };
      previewRef.current = {
        id: "preview",
        kind: tool,
        color,
        width,
        points: [point, point],
      };

      setError("");
      scheduleRedraw();
      return;
    }

    const item: BoardItem = {
      id: crypto.randomUUID(),
      kind: tool,
      color: tool === "eraser" ? "#ffffff" : color,
      width: tool === "eraser" ? Math.min(60, width * 3) : width,
      points: [point],
    };

    itemsRef.current.push(item);

    // Drawing something new ends the redo history.
    resetRedo();

    const stroke: ActiveStroke = {
      id: item.id,
      pointerId: event.pointerId,
      item,
      last: point,
      pending: [],
      timer: null,
      failed: false,
    };

    strokeRef.current = stroke;
    setError("");
    scheduleRedraw();

    // A copy is sent, because the original keeps growing as the pen moves.
    socket.emit(
      "whiteboard:item:add",
      { meetingId, item: { ...item, points: [point] } },
      (response: BoardAck) => {
        if (!response?.success) {
          stroke.failed = true;
          itemsRef.current = itemsRef.current.filter(
            (existing) => existing.id !== item.id
          );
          scheduleRedraw();
          setError(response?.error || "Could not start your drawing.");
        }
      }
    );
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const shape = shapeRef.current;

    if (shape) {
      if (shape.pointerId !== event.pointerId) return;

      const end = pointFromEvent(event);
      const preview = previewRef.current;
      if (!end || !preview) return;

      previewRef.current = { ...preview, points: [shape.start, end] };
      scheduleRedraw();
      return;
    }

    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    if (stroke.failed) return;
    if (stroke.item.points.length >= MAX_POINTS_PER_STROKE) return;

    const point = pointFromEvent(event);
    if (!point) return;

    // Skip tiny movements: they add points without changing the line.
    const rect = event.currentTarget.getBoundingClientRect();
    const moved = Math.hypot(
      (point.x - stroke.last.x) * rect.width,
      (point.y - stroke.last.y) * rect.height
    );

    if (moved < 1.5) return;

    stroke.last = point;
    stroke.item.points.push(point);
    stroke.pending.push(point);
    scheduleRedraw();

    if (stroke.timer === null) {
      stroke.timer = window.setTimeout(() => flushStroke(stroke), FLUSH_DELAY_MS);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const shape = shapeRef.current;

    if (shape) {
      if (shape.pointerId !== event.pointerId) return;

      const preview = previewRef.current;
      const end = pointFromEvent(event) ?? preview?.points[1] ?? null;
      const rect = event.currentTarget.getBoundingClientRect();

      shapeRef.current = null;
      previewRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      if (!preview || !end) {
        scheduleRedraw();
        return;
      }

      const moved = Math.hypot(
        (end.x - shape.start.x) * rect.width,
        (end.y - shape.start.y) * rect.height
      );

      // A stray click with a shape tool draws nothing.
      if (moved < MIN_SHAPE_PIXELS) {
        scheduleRedraw();
        return;
      }

      sendNewItem({
        id: crypto.randomUUID(),
        kind: shape.kind,
        color: preview.color,
        width: preview.width,
        points: [shape.start, end],
      });

      return;
    }

    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;

    flushStroke(stroke);
    strokeRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // The browser took the pointer away (for example a touch turned into a
  // scroll). A shape in progress is dropped; a pen stroke is kept as drawn.
  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const shape = shapeRef.current;

    if (shape && shape.pointerId === event.pointerId) {
      shapeRef.current = null;
      previewRef.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      scheduleRedraw();
      return;
    }

    handlePointerUp(event);
  };

  // Clicking with the Text tool opens a box where the text will go.
  const handleCanvasClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (tool !== "text") return;
    if (isDrawing() || actionBusyRef.current) return;

    const socket = socketRef.current;

    if (!joined || !socket?.connected) {
      setError("You're not connected to the meeting.");
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = clamp((event.clientX - rect.left) / rect.width, 0, 0.96);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 0.94);

    const units = Math.min(120, Math.max(16, width * 4));
    const fontPx = Math.max(10, units * (rect.width / BOARD_UNITS));

    setError("");
    setTextDraft({ x, y, value: "", color, units, fontPx });
  };

  return (
    <div className="mt-6 rounded-xl bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Whiteboard</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm"
        >
          Close
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {TOOLS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTool(option.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                tool === option.id ? "bg-blue-600" : "bg-slate-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-label={option.name}
              title={option.name}
              onClick={() => {
                setColor(option.value);
                // Picking a color after using the eraser goes back to the pen.
                if (tool === "eraser") setTool("pen");
              }}
              style={{ backgroundColor: option.value }}
              className={`h-6 w-6 rounded-full border-2 ${
                tool !== "eraser" && color === option.value
                  ? "border-white"
                  : "border-transparent"
              }`}
            />
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          Size
          <input
            type="range"
            min={2}
            max={40}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          />
          <span className="w-6 text-xs text-slate-400">{width}</span>
        </label>

        <div className="flex gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!joined}
            title="Take back the last thing you drew"
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!joined || redoCount === 0}
            title="Put back what you undid"
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={clearBoard}
            disabled={!joined}
            title="Clear the board for everyone"
            className="rounded-lg bg-red-800 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>

      {tool === "text" && (
        <p className="mt-2 text-xs text-slate-400">
          Click on the board where the text should go, type, then press Enter.
          Press Escape to cancel.
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-300">
          {error}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setError("")}
          >
            Dismiss
          </button>
        </p>
      )}

      <div
        ref={containerRef}
        className="relative mt-3 aspect-video w-full overflow-hidden rounded-lg bg-white"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleCanvasClick}
          className={`absolute inset-0 h-full w-full touch-none ${
            tool === "text" ? "cursor-text" : "cursor-crosshair"
          }`}
        />

        {textDraft && (
          <input
            autoFocus
            type="text"
            value={textDraft.value}
            maxLength={MAX_TEXT_LENGTH}
            onChange={(event) => {
              const current = textDraftRef.current;
              if (current) {
                setTextDraft({ ...current, value: event.target.value });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitText();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setTextDraft(null);
              }
            }}
            onBlur={commitText}
            placeholder="Type…"
            style={{
              left: `${textDraft.x * 100}%`,
              top: `${textDraft.y * 100}%`,
              maxWidth: `${(1 - textDraft.x) * 100}%`,
              width: "40%",
              minWidth: "6rem",
              fontSize: `${textDraft.fontPx}px`,
              color: textDraft.color,
            }}
            className="absolute bg-transparent p-0 leading-tight outline-1 outline-dashed outline-slate-400"
          />
        )}
      </div>
    </div>
  );
}