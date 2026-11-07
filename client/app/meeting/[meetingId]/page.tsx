"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

type Participant = {
  socketId: string;
  userId: string;
  name: string;
  email?: string;
  sharing?: boolean;
};

type ChatMessage = {
  id: string;
  meetingId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
};

type Ack = {
  success: boolean;
  error?: string;
  participants?: Participant[];
  message?: ChatMessage;
};

type Signal = {
  meetingId: string;
  from: string;
  to?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

// Optional TURN relay, used when two networks cannot connect directly.
// Set these three values in client/.env.local to turn it on.
const TURN_URL = process.env.NEXT_PUBLIC_TURN_URL || "";
const TURN_USERNAME = process.env.NEXT_PUBLIC_TURN_USERNAME || "";
const TURN_CREDENTIAL = process.env.NEXT_PUBLIC_TURN_CREDENTIAL || "";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

if (TURN_URL && TURN_USERNAME && TURN_CREDENTIAL) {
  ICE_SERVERS.push({
    urls: TURN_URL.split(",")
      .map((url) => url.trim())
      .filter(Boolean),
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  });
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
};

function getToken() {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("nash_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    ""
  );
}

function clearSavedLogin() {
  if (typeof window === "undefined") return;
  [
    "nash_token",
    "nash_user",
    "token",
    "accessToken",
    "authToken",
  ].forEach((key) => localStorage.removeItem(key));
}

function getName() {
  if (typeof window === "undefined") return "Guest";
  try {
    const user = JSON.parse(
      localStorage.getItem("nash_user") ||
        localStorage.getItem("user") ||
        "{}"
    );
    return (
      user.name ||
      user.username ||
      user.email ||
      localStorage.getItem("name") ||
      "Guest"
    );
  } catch {
    return localStorage.getItem("name") || "Guest";
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function describeMediaError(name: string): string {
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera/microphone permission was blocked. Allow access in the browser address bar and reload.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera or microphone was found on this device.";
    case "NotReadableError":
    case "AbortError":
      return "Your camera or microphone is being used by another app or browser tab. Close it and reload this page.";
    default:
      return "Could not access your camera or microphone.";
  }
}

// Gets the local camera/microphone. Retries when the device is briefly busy
// (for example when React Strict Mode runs the page effect twice in development).
async function acquireMedia(
  isCancelled: () => boolean
): Promise<{ stream: MediaStream | null; problem: string }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      stream: null,
      problem:
        "This browser cannot access the camera. Camera access needs HTTPS or localhost.",
    };
  }

  const attempts: MediaStreamConstraints[] = [
    { video: true, audio: true },
    { audio: true },
    { video: true },
  ];

  let firstErrorName = "";

  for (const constraints of attempts) {
    let lastName = "";

    for (let i = 0; i < 3; i++) {
      if (isCancelled()) return { stream: null, problem: "" };
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        const missingVideo = stream.getVideoTracks().length === 0;
        return {
          stream,
          problem: missingVideo
            ? describeMediaError(firstErrorName || "NotFoundError")
            : "",
        };
      } catch (e) {
        lastName = e instanceof Error ? e.name : "";
        if (!firstErrorName) firstErrorName = lastName;
        if (lastName === "NotReadableError" || lastName === "AbortError") {
          await sleep(700);
          continue;
        }
        break;
      }
    }

    if (lastName === "NotAllowedError" || lastName === "SecurityError") break;
  }

  return { stream: null, problem: describeMediaError(firstErrorName) };
}

// One remote participant's video. Keeps its own element attached to its stream.
// A shared screen is shown whole ("contain"); a camera fills the tile ("cover").
function RemoteVideo({
  stream,
  fit,
}: {
  stream: MediaStream | undefined;
  fit: "cover" | "contain";
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream ?? null;
    if (stream) void video.play().catch(() => {});
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className={`aspect-video w-full rounded-lg bg-black ${
        fit === "contain" ? "object-contain" : "object-cover"
      }`}
    />
  );
}

export default function MeetingPage() {
  const router = useRouter();
  const params = useParams<{ meetingId: string }>();
  const meetingId = String(params?.meetingId || "");

  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const remoteStreamsRef = useRef(new Map<string, MediaStream>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const participantsRef = useRef(new Map<string, Participant>());
  const joinedRef = useRef(false);
  const sharingRef = useRef(false);
  const shareStartingRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<
    Record<string, MediaStream>
  >({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connecting…");

  const shownStatus = meetingId ? status : "Meeting ID is missing.";

  const refreshParticipants = useCallback(() => {
    setParticipants([...participantsRef.current.values()]);
  }, []);

  const closePeer = useCallback(
    (id: string) => {
      const peer = peersRef.current.get(id);
      if (peer) {
        peer.ontrack = null;
        peer.onicecandidate = null;
        peer.onconnectionstatechange = null;
        peer.close();
      }
      peersRef.current.delete(id);
      remoteStreamsRef.current.delete(id);
      pendingIceRef.current.delete(id);
      participantsRef.current.delete(id);
      setRemoteStreams((old) => {
        const next = { ...old };
        delete next[id];
        return next;
      });
      refreshParticipants();
    },
    [refreshParticipants]
  );

  const closeAllPeers = useCallback(() => {
    peersRef.current.forEach((peer) => {
      peer.ontrack = null;
      peer.onicecandidate = null;
      peer.onconnectionstatechange = null;
      peer.close();
    });
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingIceRef.current.clear();
    participantsRef.current.clear();
    setRemoteStreams({});
    setParticipants([]);
  }, []);

  const stopLocalMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  }, []);

  const createPeer = useCallback(
    (id: string) => {
      const existing = peersRef.current.get(id);
      if (existing) return existing;

      const peer = new RTCPeerConnection(RTC_CONFIG);
      peersRef.current.set(id, peer);

      const local = localStreamRef.current;
      const screenTrack = screenStreamRef.current?.getVideoTracks()[0];

      // Send our tracks. While sharing, the screen is sent instead of the camera.
      // For any kind we cannot send (no camera or mic), still ask to receive it
      // so we can see and hear the other person.
      (["audio", "video"] as const).forEach((kind) => {
        const tracks =
          kind === "video" && screenTrack
            ? [screenTrack]
            : local
              ? kind === "audio"
                ? local.getAudioTracks()
                : local.getVideoTracks()
              : [];

        if (local && tracks.length) {
          tracks.forEach((track) => peer.addTrack(track, local));
        } else {
          peer.addTransceiver(kind, { direction: "recvonly" });
        }
      });

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current?.emit("meeting:webrtc:ice", {
            meetingId,
            to: id,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      peer.ontrack = (event) => {
        let stream = remoteStreamsRef.current.get(id);
        if (!stream) {
          stream = new MediaStream();
          remoteStreamsRef.current.set(id, stream);
        }
        if (!stream.getTracks().some((t) => t.id === event.track.id)) {
          stream.addTrack(event.track);
        }
        const finalStream = stream;
        setRemoteStreams((old) => ({ ...old, [id]: finalStream }));
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setError(
            TURN_URL
              ? "Video connection failed, even through the relay server. Check your network and the TURN settings."
              : "Video connection failed. These two networks may need a TURN relay server to connect."
          );
        }
      };

      return peer;
    },
    [meetingId]
  );

  const flushIce = useCallback(
    async (id: string, peer: RTCPeerConnection) => {
      const queued = pendingIceRef.current.get(id) || [];
      pendingIceRef.current.delete(id);
      for (const candidate of queued) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("Could not add queued ICE candidate", e);
        }
      }
    },
    []
  );

  const sendOffer = useCallback(
    async (id: string) => {
      const socket = socketRef.current;
      if (!socket?.connected || !joinedRef.current) return;

      try {
        const peer = createPeer(id);
        if (peer.signalingState !== "stable") return;
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("meeting:webrtc:offer", {
          meetingId,
          to: id,
          offer: peer.localDescription,
        });
      } catch (e) {
        console.error("Offer failed", e);
        setError("Could not start video. Try rejoining.");
      }
    },
    [createPeer, meetingId]
  );

  // Swaps the video we send on every active call (camera <-> screen).
  // replaceTrack needs no new offer/answer, so the calls keep running.
  const replaceOutgoingVideo = useCallback(
    async (track: MediaStreamTrack) => {
      for (const peer of peersRef.current.values()) {
        const transceiver = peer
          .getTransceivers()
          .find(
            (t) =>
              t.receiver.track.kind === "video" &&
              t.direction !== "recvonly"
          );

        if (!transceiver) continue;

        try {
          await transceiver.sender.replaceTrack(track);
        } catch (e) {
          console.warn("Could not swap the outgoing video", e);
        }
      }
    },
    []
  );

  const stopScreenShare = useCallback(
    async (notify = true) => {
      const screen = screenStreamRef.current;
      if (!screen && !sharingRef.current) return;

      screenStreamRef.current = null;
      sharingRef.current = false;

      screen?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });

      const camera = localStreamRef.current?.getVideoTracks()[0];
      if (camera) await replaceOutgoingVideo(camera);

      setSharing(false);

      if (notify) {
        socketRef.current?.emit("meeting:screen-share", {
          meetingId,
          sharing: false,
        });
      }
    },
    [meetingId, replaceOutgoingVideo]
  );

  const startScreenShare = useCallback(async () => {
    if (sharingRef.current || shareStartingRef.current) return;

    if (!joinedRef.current) {
      setError("Join the meeting before sharing your screen.");
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(
        "This browser can't share your screen. Try Chrome or Edge on a computer."
      );
      return;
    }

    if (!localStreamRef.current?.getVideoTracks().length) {
      setError(
        "You joined without a camera, so screen sharing isn't available in this meeting. Connect a camera and reload the page to enable it."
      );
      return;
    }

    shareStartingRef.current = true;

    try {
      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        setError(
          name === "NotAllowedError"
            ? "Screen sharing was cancelled or blocked. Click Share screen to try again."
            : "Could not start screen sharing."
        );
        return;
      }

      const track = stream.getVideoTracks()[0];

      // The person may have left the meeting while the picker was open.
      if (!track || !joinedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      screenStreamRef.current = stream;
      sharingRef.current = true;

      // The browser's own "Stop sharing" bar ends the track.
      track.onended = () => {
        void stopScreenShare();
      };

      await replaceOutgoingVideo(track);

      setSharing(true);
      setError("");

      socketRef.current?.emit("meeting:screen-share", {
        meetingId,
        sharing: true,
      });
    } finally {
      shareStartingRef.current = false;
    }
  }, [meetingId, replaceOutgoingVideo, stopScreenShare]);

  // Keep the local preview attached to the local stream.
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [cameraOn, micOn]);

  useEffect(() => {
    if (!meetingId) return;

    let cancelled = false;
    let socket: Socket | null = null;
    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    // Clears the saved login and sends the person to the login page.
    const redirectToLogin = (message: string) => {
      clearSavedLogin();
      setConnected(false);
      setStatus("Signing you out…");
      setError(message);
      if (redirectTimer) clearTimeout(redirectTimer);
      redirectTimer = setTimeout(() => {
        router.replace("/login");
      }, 1500);
    };

    const onConnect = () => {
      if (cancelled) return;
      setConnected(true);
      setStatus("Joining meeting…");

      // After a reconnect we get a new socket id, so start from a clean slate.
      closeAllPeers();

      socket?.timeout(10000).emit(
        "meeting:join",
        { meetingId, name: getName() },
        (timeoutError: Error | null, response: Ack) => {
          if (cancelled) return;
          if (timeoutError || !response?.success) {
            setStatus("Could not join meeting.");
            setError(
              timeoutError
                ? "Server did not acknowledge the join."
                : response?.error || "Meeting join failed."
            );
            return;
          }

          joinedRef.current = true;
          setJoined(true);
          setStatus("Joined meeting");

          const others = (response.participants || []).filter(
            (p) => p.socketId !== socket?.id
          );

          for (const participant of others) {
            participantsRef.current.set(participant.socketId, participant);
          }
          refreshParticipants();

          // The newcomer sends the offers to everyone already in the room.
          for (const participant of others) {
            void sendOffer(participant.socketId);
          }
        }
      );
    };

    const onParticipantJoined = (data: {
      meetingId: string;
      participant: Participant;
    }) => {
      if (data?.meetingId !== meetingId || !data.participant?.socketId) return;
      if (data.participant.socketId === socket?.id) return;
      participantsRef.current.set(data.participant.socketId, data.participant);
      refreshParticipants();
      // The newcomer sends us an offer after its join acknowledgement.
    };

    const onParticipantLeft = (data: {
      meetingId: string;
      socketId: string;
    }) => {
      if (data?.meetingId === meetingId && data.socketId) {
        closePeer(data.socketId);
      }
    };

    const onScreenShare = (data: {
      meetingId: string;
      socketId: string;
      sharing: boolean;
    }) => {
      if (data?.meetingId !== meetingId || !data.socketId) return;

      const existing = participantsRef.current.get(data.socketId);
      if (!existing) return;

      participantsRef.current.set(data.socketId, {
        ...existing,
        sharing: Boolean(data.sharing),
      });
      refreshParticipants();
    };

    const onOffer = async (data: Signal) => {
      if (data?.meetingId !== meetingId || !data.from || !data.offer) return;
      try {
        const peer = createPeer(data.from);
        if (peer.signalingState !== "stable") return;
        await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushIce(data.from, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket?.emit("meeting:webrtc:answer", {
          meetingId,
          to: data.from,
          answer: peer.localDescription,
        });
      } catch (e) {
        console.error("Offer handling failed", e);
      }
    };

    const onAnswer = async (data: Signal) => {
      if (data?.meetingId !== meetingId || !data.from || !data.answer) return;
      const peer = peersRef.current.get(data.from);
      if (!peer) return;
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushIce(data.from, peer);
      } catch (e) {
        console.error("Answer handling failed", e);
      }
    };

    const onIce = async (data: Signal) => {
      if (data?.meetingId !== meetingId || !data.from || !data.candidate) return;
      const peer = peersRef.current.get(data.from);
      if (!peer || !peer.remoteDescription) {
        const queue = pendingIceRef.current.get(data.from) || [];
        queue.push(data.candidate);
        pendingIceRef.current.set(data.from, queue);
        return;
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.warn("ICE candidate failed", e);
      }
    };

    const onChat = (data: ChatMessage | { message?: ChatMessage }) => {
      const message =
        "message" in data && data.message ? data.message : (data as ChatMessage);
      if (message?.meetingId !== meetingId || !message.id) return;
      setMessages((old) =>
        old.some((m) => m.id === message.id) ? old : [...old, message]
      );
    };

    const onConnectError = (e: Error) => {
      if (cancelled) return;

      // The server says the saved login is no good: send the person to log in.
      if (
        e.message === "Invalid or expired token" ||
        e.message === "Authentication token is required" ||
        e.message === "Invalid token payload"
      ) {
        socket?.disconnect();
        redirectToLogin("Your session has ended. Taking you to the login page…");
        return;
      }

      setConnected(false);
      setStatus("Connection failed");
      setError(e.message);
    };

    const onDisconnect = () => {
      if (cancelled) return;
      setConnected(false);
      setJoined(false);
      joinedRef.current = false;
      setStatus("Disconnected. Trying to reconnect…");
      // The server forgets a share when the socket drops, so end ours too.
      void stopScreenShare(false);
      // Our socket id is gone, so every peer connection is stale.
      closeAllPeers();
    };

    const initialize = async () => {
      await Promise.resolve();
      if (cancelled) return;

      const token = getToken();
      if (!token) {
        redirectToLogin("Please sign in to join this meeting. Taking you to the login page…");
        return;
      }

      // Media is optional: do not block joining if the camera is busy.
      const { stream, problem } = await acquireMedia(() => cancelled);

      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = stream;
      setCameraOn(!!stream?.getVideoTracks().length);
      setMicOn(!!stream?.getAudioTracks().length);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      if (problem) setError(problem);

      socket = io(API_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;

      socket.on("connect", onConnect);
      socket.on("connect_error", onConnectError);
      socket.on("disconnect", onDisconnect);
      socket.on("meeting:participant-joined", onParticipantJoined);
      socket.on("meeting:participant-left", onParticipantLeft);
      socket.on("meeting:screen-share", onScreenShare);
      socket.on("meeting:webrtc:offer", onOffer);
      socket.on("meeting:webrtc:answer", onAnswer);
      socket.on("meeting:webrtc:ice", onIce);
      socket.on("meeting:chat:new", onChat);
    };

    void initialize();

    return () => {
      cancelled = true;
      joinedRef.current = false;
      if (redirectTimer) clearTimeout(redirectTimer);

      if (socket) {
        socket.off("connect", onConnect);
        socket.off("connect_error", onConnectError);
        socket.off("disconnect", onDisconnect);
        socket.off("meeting:participant-joined", onParticipantJoined);
        socket.off("meeting:participant-left", onParticipantLeft);
        socket.off("meeting:screen-share", onScreenShare);
        socket.off("meeting:webrtc:offer", onOffer);
        socket.off("meeting:webrtc:answer", onAnswer);
        socket.off("meeting:webrtc:ice", onIce);
        socket.off("meeting:chat:new", onChat);
        if (socket.connected) socket.emit("meeting:leave", { meetingId });
        socket.disconnect();
      }

      socketRef.current = null;

      // Release the shared screen as well as the camera.
      screenStreamRef.current?.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      screenStreamRef.current = null;
      sharingRef.current = false;

      closeAllPeers();
      stopLocalMedia();
    };
  }, [
    meetingId,
    router,
    closePeer,
    closeAllPeers,
    createPeer,
    flushIce,
    refreshParticipants,
    sendOffer,
    stopLocalMedia,
    stopScreenShare,
  ]);

  const sendMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    const socket = socketRef.current;
    if (!content || !socket?.connected || sending) return;

    setSending(true);
    setError("");

    socket.timeout(10000).emit(
      "meeting:chat:send",
      { meetingId, content },
      (timeoutError: Error | null, response: Ack) => {
        setSending(false);
        if (timeoutError) {
          setError("Chat server did not respond. Check your connection.");
          return;
        }
        if (!response?.success) {
          setError(response?.error || "Message could not be sent.");
          return;
        }
        setDraft("");
      }
    );
  };

  const leaveMeeting = () => {
    const socket = socketRef.current;
    if (socket) {
      if (socket.connected) socket.emit("meeting:leave", { meetingId });
      socket.disconnect();
    }
    socketRef.current = null;
    joinedRef.current = false;

    screenStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    screenStreamRef.current = null;
    sharingRef.current = false;
    setSharing(false);

    setJoined(false);
    setConnected(false);
    setStatus("You left the meeting.");
    closeAllPeers();
    stopLocalMedia();
    setCameraOn(false);
    setMicOn(false);
  };

  const toggleTrack = (kind: "audio" | "video") => {
    const tracks =
      kind === "audio"
        ? localStreamRef.current?.getAudioTracks()
        : localStreamRef.current?.getVideoTracks();

    if (!tracks?.length) {
      setError(
        `No ${kind === "audio" ? "microphone" : "camera"} track is available. Reload to retry access.`
      );
      return;
    }
    const next = !tracks[0].enabled;
    tracks.forEach((track) => {
      track.enabled = next;
    });
    if (kind === "audio") setMicOn(next);
    else setCameraOn(next);
  };

  const toggleScreenShare = () => {
    if (sharing) void stopScreenShare();
    else void startScreenShare();
  };

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white md:p-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meeting room</h1>
          <p className="text-sm text-slate-400">Meeting ID: {meetingId}</p>
        </div>
        <div className="text-sm">
          <span className={connected ? "text-green-400" : "text-amber-300"}>
            {connected ? "● Connected" : "● Not connected"}
          </span>
          <p className="text-slate-400">{shownStatus}</p>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {error}
          <button className="ml-3 underline" onClick={() => setError("")}>
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-900 p-3">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="aspect-video w-full rounded-lg bg-black object-cover"
              />
              <p className="mt-2 text-sm">
                You{" "}
                {sharing
                  ? "(sharing your screen)"
                  : cameraOn
                    ? ""
                    : "(camera off)"}
              </p>
            </div>

            {participants.map((person) => (
              <div
                key={person.socketId}
                className={`rounded-xl bg-slate-900 p-3 ${
                  person.sharing ? "sm:col-span-2" : ""
                }`}
              >
                <RemoteVideo
                  stream={remoteStreams[person.socketId]}
                  fit={person.sharing ? "contain" : "cover"}
                />
                <p className="mt-2 text-sm">
                  {person.name || "Participant"}
                  {person.sharing ? " is sharing their screen" : ""}
                </p>
              </div>
            ))}
          </div>

          {joined && participants.length === 0 && (
            <p className="mt-4 text-sm text-slate-400">
              You’re in the meeting. Waiting for others to join…
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => toggleTrack("audio")}
              className="rounded-lg bg-slate-800 px-4 py-2"
            >
              {micOn ? "Mute mic" : "Turn mic on"}
            </button>
            <button
              onClick={() => toggleTrack("video")}
              className="rounded-lg bg-slate-800 px-4 py-2"
            >
              {cameraOn ? "Turn camera off" : "Turn camera on"}
            </button>
            <button
              onClick={toggleScreenShare}
              disabled={!joined}
              className={`rounded-lg px-4 py-2 disabled:opacity-50 ${
                sharing ? "bg-emerald-700" : "bg-slate-800"
              }`}
            >
              {sharing ? "Stop sharing" : "Share screen"}
            </button>
            <button
              onClick={leaveMeeting}
              className="rounded-lg bg-red-700 px-4 py-2"
            >
              Leave meeting
            </button>
          </div>

          {sharing && (
            <p className="mt-3 text-sm text-emerald-300">
              You’re sharing your screen. Everyone in the meeting can see it.
            </p>
          )}
        </section>

        <aside className="flex min-h-[420px] flex-col rounded-xl bg-slate-900 p-4">
          <h2 className="mb-3 text-lg font-semibold">Meeting chat</h2>
          <div className="flex-1 space-y-3 overflow-y-auto">
            {messages.map((message) => (
              <div key={message.id} className="rounded-lg bg-slate-800 p-3">
                <p className="text-xs font-semibold text-sky-300">
                  {message.senderName}
                </p>
                <p className="break-words text-sm">{message.content}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} className="mt-4 flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a message…"
              className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none"
            />
            <button
              disabled={!draft.trim() || sending || !joined}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}