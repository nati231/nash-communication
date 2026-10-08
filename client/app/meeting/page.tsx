"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";

const SERVER_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:5000";

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
    const token = window.localStorage.getItem(key);

    if (token) {
      return token;
    }
  }

  return null;
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
    useState<string[]>([]);

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
          (
            response: {
              success: boolean;
              message?: string;
              participantIds?: string[];
            },
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
              response.participantIds || [],
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
        userId,
      }: {
        userId: string;
      }) => {
        setParticipants(
          (current) => {
            if (
              current.includes(userId)
            ) {
              return current;
            }

            return [
              ...current,
              userId,
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
        setParticipants(
          (current) =>
            current.filter(
              (id) =>
                id !== userId,
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
              (userId) => (
                <li key={userId}>
                  {userId}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </main>
  );
}
