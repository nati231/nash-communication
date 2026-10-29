"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Accepts a full meeting link or a bare meeting ID and returns just the ID.
function extractMeetingId(input: string): string {
  const text = input.trim();
  if (!text) return "";

  const marker = "/meeting/";
  const index = text.indexOf(marker);
  const raw = index >= 0 ? text.slice(index + marker.length) : text;

  return raw.split(/[/?#\s]/)[0] || "";
}

export default function JoinMeetingPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const meetingId = extractMeetingId(value);

    if (!meetingId) {
      setError("Enter a meeting ID or paste a meeting link.");
      return;
    }

    setError("");
    router.push(`/meeting/${encodeURIComponent(meetingId)}`);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-slate-900 p-6"
      >
        <h1 className="text-2xl font-bold">Join a meeting</h1>
        <p className="mt-1 text-sm text-slate-400">
          Paste the meeting link or enter the meeting ID.
        </p>

        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError("");
          }}
          placeholder="Meeting link or ID"
          autoFocus
          className="mt-5 w-full rounded-lg bg-slate-800 px-3 py-2 text-sm outline-none"
        />

        {error && <p className="mt-2 text-sm text-red-300">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium"
          >
            Join meeting
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm"
          >
            Back
          </button>
        </div>
      </form>
    </main>
  );
}