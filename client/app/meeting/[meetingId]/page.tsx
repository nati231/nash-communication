"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000";

interface StoredUser {
  id?: string;
  name?: string;
  email?: string;
}

interface MeetingParticipant {
  id: string;
  name: string;
  email: string;
}

interface MeetingJoinResponse {
  success: boolean;
  message?: string;
  meetingId?: string;
  userId?: string;
  participants?: MeetingParticipant[];
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const keys = [
    "token",
    "accessToken",
    "authToken",
    "nash_token",
  ];

  for (const key of keys) {
    const token =
      window.localStorage.getItem(key);

    if (token) {
      return token;
    }
  }

  return null;
}

function getStoredUser(): StoredUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedUser =
    window.localStorage.getItem("nash_user");

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(
      storedUser,
    ) as StoredUser;
  } catch (error) {
    console.error(
      "Failed to parse stored user:",
      error,
    );

    return null;
  }
}

export default function MeetingRoomPage() {
  const params = useParams();

  const meetingId =
    typeof params.meetingId === "string"
      ? params.meetingId
      : "";

  const [socket, setSocket] =
    useState<Socket | null>(null);

  const [joined, setJoined] =
    useState(false);

  const [status, setStatus] =
    useState("Ready to join");

  const [participants, setParticipants] =
    useState<MeetingParticipant[]>([]);

  useEffect(() => {
    return () => {
      socket?.disconnect();
    };
  }, [socket]);

  function joinMeeting() {
    if (joined || socket) {
      return;
    }

    if (!meetingId) {
      setStatus("Meeting ID is missing");
      return;
    }

    const token = getAuthToken();

    if (!token) {
      setStatus(
        "You are not logged in. Please log in first.",
      );
      return;
    }

    const user = getStoredUser();

    if (!user) {
      setStatus(
        "User session is missing. Please log in again.",
      );
      return;
    }

    setStatus("Connecting...");

    const newSocket = io(
      SERVER_URL,
      {
        auth: {
          token,
        },
        transports: ["websocket"],
      },
    );

    newSocket.on(
      "connect",
      () => {
        setStatus("Connected");

        newSocket.emit(
          "meeting:join",
          meetingId,
          {
            name: user.name,
            email: user.email,
          },
          (
            response: MeetingJoinResponse,
          ) => {
            if (!response?.success) {
              setStatus(
                response?.message ||
                  "Failed to join meeting",
              );

              newSocket.disconnect();
              setSocket(null);

              return;
            }

            setJoined(true);

            setParticipants(
              response.participants || [],
            );

            setStatus("Joined meeting");
          },
        );
      },
    );

    newSocket.on(
      "connect_error",
      (error) => {
        console.error(
          "Socket connection error:",
          error,
        );

        setStatus(
          error.message ||
            "Socket authentication failed",
        );

        newSocket.disconnect();
        setSocket(null);
      },
    );

    newSocket.on(
      "meeting:user-joined",
      ({
        participant,
      }: {
        participant: MeetingParticipant;
      }) => {
        if (!participant?.id) {
          return;
        }

        setParticipants(
          (current) => {
            const alreadyExists =
              current.some(
                (item) =>
                  item.id ===
                  participant.id,
              );

            if (alreadyExists) {
              return current;
            }

            return [
              ...current,
              participant,
            ];
          },
        );
      },
    );

    newSocket.on(
      "meeting:user-left",
      ({
        userId,
      }: {
        userId: string;
      }) => {
        if (!userId) {
          return;
        }

        setParticipants(
          (current) =>
            current.filter(
              (participant) =>
                participant.id !==
                userId,
            ),
        );
      },
    );

    setSocket(newSocket);
  }

  function leaveMeeting() {
    if (!socket) {
      setJoined(false);
      setParticipants([]);
      setStatus("Left meeting");
      return;
    }

    socket.emit(
      "meeting:leave",
      meetingId,
      () => {
        socket.disconnect();

        setSocket(null);
        setJoined(false);
        setParticipants([]);
        setStatus("Left meeting");
      },
    );
  }

  return (
    <main
      style={{
        padding: "40px",
      }}
    >
      <h1>Meeting Room</h1>

      <p>Meeting ID:</p>

      <code>
        {meetingId || "Unknown"}
      </code>

      <p>
        Status: {status}
      </p>

      {!joined ? (
        <button
          onClick={joinMeeting}
          disabled={!meetingId}
        >
          Join Meeting
        </button>
      ) : (
        <button
          onClick={leaveMeeting}
        >
          Leave Meeting
        </button>
      )}

      <section
        style={{
          marginTop: "30px",
        }}
      >
        <h2>Participants</h2>

        {participants.length === 0 ? (
          <p>
            No participants yet.
          </p>
        ) : (
          <ul>
            {participants.map(
              (participant) => (
                <li
                  key={participant.id}
                >
                  <strong>
                    {participant.name}
                  </strong>

                  {" — "}

                  {participant.email}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}