"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { io, type Socket } from "socket.io-client";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

type User = {
  id: string;
  userId?: string;
  name?: string;
  username?: string;
  email?: string;
};

type Message = {
  id?: string;
  _id?: string;
  conversationId: string;
  senderId: string | number;
  senderName?: string;
  sender?: {
    id?: string;
    name?: string;
    email?: string;
  };
  content?: string;
  text?: string;
  createdAt?: string;
  timestamp?: string;
};

type Conversation = {
  id: string;
  conversationId?: string;
  name?: string;
  title?: string;
  members?: User[];
  users?: User[];
  participants?: User[];
  otherUser?: User;
  recipient?: User;
};

type Ack = {
  success?: boolean;
  error?: string;
  message?: Message | string;
  messages?: Message[];
  conversationId?: string;
  conversation?: Conversation;
  conversations?: Conversation[];
  [key: string]: unknown;
};

type SearchPayload = {
  error?: string;
  message?: string;
  users?: User[];
  data?: User[] | { users?: User[] };
};

function tokenFromStorage() {
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

function currentUserFromStorage() {
  if (typeof window === "undefined") return "";

  const stored =
    localStorage.getItem("nash_user_id") ||
    localStorage.getItem("userId") ||
    localStorage.getItem("user_id");

  if (stored) return stored;

  try {
    const token = tokenFromStorage();
    const payload = token.split(".")[1];
    if (!payload) return "";

    const decoded = JSON.parse(
      atob(
        payload
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(payload.length / 4) * 4, "=")
      )
    );

    return String(decoded.userId ?? decoded.id ?? decoded.sub ?? "");
  } catch {
    return "";
  }
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function conversationIdOf(conversation?: Conversation) {
  return String(conversation?.id || conversation?.conversationId || "");
}

function userIdOf(user: User) {
  return String(user.id || user.userId || "");
}

function messageIdOf(message: Message) {
  return String(
    message.id ||
      message._id ||
      `${message.conversationId}-${message.senderId}-${message.createdAt || message.timestamp || message.content || message.text || ""}`
  );
}

function messageText(message: Message) {
  return message.content ?? message.text ?? "";
}

function errorText(response?: Ack, fallback = "Something went wrong.") {
  if (typeof response?.error === "string") return response.error;
  if (typeof response?.message === "string") return response.message;
  return fallback;
}

function otherUserOf(conversation: Conversation, currentId: string) {
  if (conversation.otherUser) return conversation.otherUser;
  if (conversation.recipient) return conversation.recipient;

  const members =
    conversation.members ||
    conversation.users ||
    conversation.participants ||
    [];

  return members.find((member) => userIdOf(member) !== currentId);
}

function displayName(user?: User) {
  return user?.name || user?.username || user?.email || "User";
}

// Reads the list of users out of the different shapes the search API may return.
function extractUsers(data: unknown): User[] {
  if (Array.isArray(data)) return data as User[];
  if (!data || typeof data !== "object") return [];

  const payload = data as SearchPayload;

  if (Array.isArray(payload.users)) return payload.users;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.users)) {
    return payload.data.users;
  }

  return [];
}

export default function ChatPage() {
  const router = useRouter();
  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef("");
  const openingRef = useRef("");

  const [connected, setConnected] = useState(false);

  const currentUserId = useSyncExternalStore(
    subscribeToStorage,
    currentUserFromStorage,
    () => ""
  );

  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");

  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const searchActive = search.trim().length >= 2;
  const visibleUsers = searchActive ? users : [];

  const addMessage = useCallback((incoming: Message) => {
    if (!incoming?.conversationId || incoming.senderId == null) return;

    setMessages((previous) => {
      const id = messageIdOf(incoming);
      const index = previous.findIndex((item) => messageIdOf(item) === id);

      if (index >= 0) {
        const copy = [...previous];
        copy[index] = { ...copy[index], ...incoming };
        return copy;
      }

      return [...previous, incoming].sort((a, b) => {
        const at = new Date(a.createdAt || a.timestamp || 0).getTime();
        const bt = new Date(b.createdAt || b.timestamp || 0).getTime();
        return at - bt;
      });
    });
  }, []);

  const upsertConversation = useCallback((conversation: Conversation) => {
    const id = conversationIdOf(conversation);
    if (!id) return;

    setConversations((previous) => {
      const exists = previous.some((item) => conversationIdOf(item) === id);

      return exists
        ? previous.map((item) =>
            conversationIdOf(item) === id ? { ...item, ...conversation, id } : item
          )
        : [{ ...conversation, id }, ...previous];
    });
  }, []);

  const openConversation = useCallback(
    (rawId: string) => {
      const id = String(rawId || "").trim();
      const socket = socketRef.current;

      if (!id) {
        setError("This conversation has no valid ID.");
        return;
      }

      if (!socket?.connected) {
        setError("Chat server is disconnected. Check the server and try again.");
        return;
      }

      if (openingRef.current === id) return;

      openingRef.current = id;
      activeIdRef.current = id;
      setActiveConversationId(id);
      setMessages([]);
      setLoadingMessages(true);
      setError("");
      setNotice("");

      socket.emit("conversation:join", id, (joinResponse?: Ack) => {
        if (activeIdRef.current !== id) return;

        if (!joinResponse?.success) {
          openingRef.current = "";
          setLoadingMessages(false);
          setError(errorText(joinResponse, "Could not open this conversation."));
          return;
        }

        socket.emit("message:history", id, (historyResponse?: Ack) => {
          if (activeIdRef.current !== id) return;

          openingRef.current = "";
          setLoadingMessages(false);

          if (!historyResponse?.success) {
            setError(errorText(historyResponse, "Could not load message history."));
            return;
          }

          setMessages(
            Array.isArray(historyResponse.messages)
              ? historyResponse.messages
              : []
          );
        });
      });
    },
    []
  );

  const startConversation = useCallback(
    (targetId: string) => {
      const socket = socketRef.current;
      const id = String(targetId || "").trim();

      if (!id) return;

      if (!socket?.connected) {
        setError("Chat server is disconnected.");
        return;
      }

      if (id === currentUserId) {
        setError("You cannot start a conversation with yourself.");
        return;
      }

      setStarting(true);
      setError("");
      setSearchError("");

      socket.emit("conversation:start", { userId: id }, (response?: Ack) => {
        setStarting(false);

        if (!response?.success) {
          setError(errorText(response, "Could not start the conversation."));
          return;
        }

        const conversationId =
          response.conversationId ||
          conversationIdOf(response.conversation as Conversation | undefined);

        if (!conversationId) {
          setError("The server did not return a conversation ID.");
          return;
        }

        const selectedUser = users.find((user) => userIdOf(user) === id);

        upsertConversation({
          ...(response.conversation as Conversation | undefined),
          id: conversationId,
          otherUser: selectedUser,
          name: displayName(selectedUser),
        });

        openConversation(conversationId);
      });
    },
    [currentUserId, openConversation, upsertConversation, users]
  );

  useEffect(() => {
    const token = tokenFromStorage();

    // No saved login: go straight to the login page.
    if (!token) {
      router.replace("/login");
      return;
    }

    let redirectTimer: ReturnType<typeof setTimeout> | null = null;

    const socket = io(API_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      setError("");

      socket.emit("presence:list");

      socket.emit("conversation:list", (response?: Ack) => {
        if (response?.success && Array.isArray(response.conversations)) {
          setConversations(response.conversations);
        }
      });
    };

    const onDisconnect = () => setConnected(false);

    const onConnectError = (err: Error) => {
      console.error("Chat socket connection failed:", err);
      setConnected(false);

      // The server says the saved login is no good: send the person to log in.
      if (
        err.message === "Invalid or expired token" ||
        err.message === "Authentication token is required" ||
        err.message === "Invalid token payload"
      ) {
        socket.disconnect();
        clearSavedLogin();
        setError("Your session has ended. Taking you to the login page…");

        if (redirectTimer) clearTimeout(redirectTimer);
        redirectTimer = setTimeout(() => {
          router.replace("/login");
        }, 1500);
        return;
      }

      setError(`Cannot connect to chat server: ${err.message}`);
    };

    const onNewMessage = (payload: { message?: Message } & Partial<Message>) => {
      const message = payload?.message ?? (payload as Message);

      if (
        message?.conversationId &&
        String(message.conversationId) === activeIdRef.current
      ) {
        addMessage(message);
      }
    };

    const onConversationList = (payload: Ack) => {
      if (payload?.success && Array.isArray(payload.conversations)) {
        setConversations(payload.conversations);
      }
    };

    const onInvited = (payload: {
      conversationId?: string;
      conversation?: Conversation;
      userId?: string;
      name?: string;
      email?: string;
    }) => {
      const id =
        payload.conversationId ||
        conversationIdOf(payload.conversation);

      if (!id) return;

      upsertConversation({
        ...(payload.conversation || {}),
        id,
        otherUser: {
          id: payload.userId || "",
          name: payload.name,
          email: payload.email,
        },
      });

      setNotice("You have been added to a conversation.");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("message:new", onNewMessage);
    socket.on("conversation:list", onConversationList);
    socket.on("conversation:invited", onInvited);

    return () => {
      if (redirectTimer) clearTimeout(redirectTimer);

      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("message:new", onNewMessage);
      socket.off("conversation:list", onConversationList);
      socket.off("conversation:invited", onInvited);
      socket.disconnect();

      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [addMessage, upsertConversation, router]);

  useEffect(() => {
    const query = search.trim();

    // Too short to search: nothing to fetch (the list is hidden by `searchActive`).
    if (query.length < 2) return;

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setSearchError("");
      setSearchLoading(true);

      try {
        const token = tokenFromStorage();
        const response = await fetch(
          `${API_URL}/api/users/search?q=${encodeURIComponent(query)}`,
          {
            credentials: "include",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: controller.signal,
          }
        );

        const raw = await response.text();
        let data: unknown = {};

        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { message: raw };
        }

        if (!response.ok) {
          const payload = (
            data && typeof data === "object" ? data : {}
          ) as SearchPayload;

          throw new Error(
            payload.error ||
              payload.message ||
              `Search failed (${response.status}).`
          );
        }

        setUsers(
          extractUsers(data).filter(
            (user) => user?.id && userIdOf(user) !== currentUserId
          )
        );
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setSearchError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, currentUserId]);

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const content = messageInput.trim();
    const conversationId = activeIdRef.current;
    const socket = socketRef.current;

    if (!content || !conversationId || sending || loadingMessages) return;

    if (!socket?.connected) {
      setError("Chat server is disconnected.");
      return;
    }

    setSending(true);
    setError("");

    socket.emit(
      "message:send",
      { conversationId, content },
      (response?: Ack) => {
        setSending(false);

        if (!response?.success) {
          setError(errorText(response, "Message could not be sent."));
          return;
        }

        setMessageInput("");

        if (
          response.message &&
          typeof response.message === "object" &&
          "conversationId" in response.message
        ) {
          addMessage(response.message as Message);
        }
      }
    );
  };

  const activeConversation = conversations.find(
    (conversation) => conversationIdOf(conversation) === activeConversationId
  );

  const activeUser = activeConversation
    ? otherUserOf(activeConversation, currentUserId)
    : undefined;

  return (
    <main className="flex h-screen min-h-0 bg-gray-950 text-white">
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-800 bg-gray-900 sm:w-80">
        <div className="border-b border-gray-800 p-5">
          <h1 className="text-2xl font-bold">Nash</h1>
          <p className={`mt-1 text-sm ${connected ? "text-green-400" : "text-red-400"}`}>
            {connected ? "Connected" : "Disconnected"}
          </p>
        </div>

        <div className="border-b border-gray-800 p-4">
          <label htmlFor="user-search" className="mb-2 block text-sm font-medium">
            Find someone
          </label>

          <input
            id="user-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 outline-none focus:border-blue-500"
          />

          {searchActive && searchLoading && (
            <p className="mt-2 text-sm text-gray-400">Searching…</p>
          )}
          {searchActive && searchError && (
            <p className="mt-2 break-words text-sm text-red-300">{searchError}</p>
          )}

          {visibleUsers.map((user) => (
            <button
              key={userIdOf(user)}
              type="button"
              disabled={!connected || starting}
              onClick={() => startConversation(userIdOf(user))}
              className="mt-2 flex w-full items-center justify-between rounded-lg bg-gray-800 p-3 text-left hover:bg-gray-700 disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{displayName(user)}</span>
                <span className="block truncate text-xs text-gray-400">{user.email}</span>
              </span>
              <span className="ml-2 text-sm text-blue-300">{starting ? "…" : "Chat"}</span>
            </button>
          ))}

          {searchActive &&
            !searchLoading &&
            !searchError &&
            visibleUsers.length === 0 && (
              <p className="mt-2 text-sm text-gray-500">No users found.</p>
            )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Conversations
          </p>

          {conversations.length === 0 ? (
            <p className="text-sm text-gray-500">Search for someone to start chatting.</p>
          ) : (
            conversations.map((conversation) => {
              const id = conversationIdOf(conversation);
              if (!id) return null;

              const person = otherUserOf(conversation, currentUserId);

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openConversation(id)}
                  className={`w-full rounded-lg p-3 text-left ${
                    activeConversationId === id
                      ? "bg-blue-600"
                      : "bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  <span className="block truncate font-medium">
                    {displayName(person) || conversation.title || conversation.name || "User"}
                  </span>
                  <span className="block truncate text-xs text-gray-300">
                    {person?.email || ""}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-gray-800 px-4 py-4 sm:px-6">
          <h2 className="truncate font-semibold">
            {activeUser
              ? displayName(activeUser)
              : activeConversation
                ? activeConversation.title || activeConversation.name || "Chat"
                : "Welcome to Nash"}
          </h2>
          <span className={`text-sm ${connected ? "text-green-400" : "text-red-400"}`}>
            {connected ? "Online" : "Offline"}
          </span>
        </header>

        {notice && (
          <div className="bg-blue-950 px-4 py-3 text-sm text-blue-200">
            {notice}
            <button type="button" onClick={() => setNotice("")} className="ml-3 underline">
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-950 px-4 py-3 text-sm text-red-200">
            {error}
            <button type="button" onClick={() => setError("")} className="ml-3 underline">
              Dismiss
            </button>
          </div>
        )}

        {!activeConversationId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <h3 className="text-xl font-semibold">Your conversations, all in one place</h3>
              <p className="mt-2 text-gray-400">Search for a user to start chatting.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {loadingMessages ? (
                <p className="text-center text-gray-400">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="text-center text-gray-500">No messages yet. Say hello!</p>
              ) : (
                messages.map((message) => {
                  const mine =
                    currentUserId !== "" &&
                    String(message.senderId) === currentUserId;

                  return (
                    <div
                      key={messageIdOf(message)}
                      className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] break-words rounded-2xl px-4 py-3 sm:max-w-[75%] ${
                          mine
                            ? "rounded-br-md bg-blue-600 text-white"
                            : "rounded-bl-md bg-gray-200 text-gray-900"
                        }`}
                      >
                        {!mine && (
                          <p className="mb-1 text-xs font-semibold text-gray-600">
                            {message.senderName || message.sender?.name || message.sender?.email || "User"}
                          </p>
                        )}

                        <p className="whitespace-pre-wrap">{messageText(message)}</p>

                        {(message.createdAt || message.timestamp) && (
                          <p className={`mt-1 text-right text-xs ${mine ? "text-blue-100" : "text-gray-500"}`}>
                            {new Date(message.createdAt || message.timestamp!).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={sendMessage} className="flex gap-2 border-t border-gray-800 p-3 sm:gap-3 sm:p-4">
              <input
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder={
                  !connected
                    ? "Connecting to chat server…"
                    : loadingMessages
                      ? "Loading conversation…"
                      : "Type a message…"
                }
                maxLength={5000}
                disabled={!connected || sending || loadingMessages}
                className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 outline-none focus:border-blue-500 disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={!connected || sending || loadingMessages || !messageInput.trim()}
                className="rounded-xl bg-blue-600 px-4 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}