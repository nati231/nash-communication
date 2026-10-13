
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { io, type Socket } from "socket.io-client";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
).replace(/\/+$/, "");

interface ChatUser {
  id: string;
  userId?: string;
  name?: string;
  username?: string;
  email?: string;
}

interface ChatMessage {
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
}

interface Conversation {
  id: string;
  conversationId?: string;
  name?: string;
  title?: string;
  members?: ChatUser[];
  users?: ChatUser[];
  participants?: ChatUser[];
  otherUser?: ChatUser;
  recipient?: ChatUser;
  lastMessage?: string;
}

interface SocketResponse {
  success: boolean;
  error?: string;
  message?: unknown;
  messages?: ChatMessage[];
  conversationId?: string;
  conversation?: Conversation;
  conversations?: Conversation[];
  [key: string]: unknown;
}

function responseError(
  response?: SocketResponse,
  fallback = "Something went wrong."
): string {
  if (typeof response?.error === "string") {
    return response.error;
  }

  if (typeof response?.message === "string") {
    return response.message;
  }

  return fallback;
}

function getMessageId(message: ChatMessage): string {
  return (
    message.id ||
    message._id ||
    `${message.conversationId}-${message.senderId}-${message.createdAt || message.timestamp || message.content || message.text || ""}`
  );
}

function getMessageText(message: ChatMessage): string {
  return message.content ?? message.text ?? "";
}

function getMessageSenderName(message: ChatMessage): string {
  return (
    message.senderName ||
    message.sender?.name ||
    message.sender?.email ||
    "User"
  );
}

function getConversationId(conversation?: Conversation): string {
  return conversation?.id || conversation?.conversationId || "";
}

function getStoredToken(): string {
  if (typeof window === "undefined") return "";

  return (
    localStorage.getItem("token") ||
    localStorage.getItem("nash_token") ||
    localStorage.getItem("accessToken") ||
    ""
  );
}

function getStoredUserId(): string {
  if (typeof window === "undefined") return "";

  const storedId =
    localStorage.getItem("nash_user_id") ||
    localStorage.getItem("userId") ||
    localStorage.getItem("user_id");

  if (storedId) return String(storedId);

  try {
    const token = getStoredToken();
    const payloadPart = token.split(".")[1];

    if (!payloadPart) return "";

    const base64 = payloadPart
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const payload = JSON.parse(
      atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
    );

    const id = payload.userId ?? payload.id ?? payload.sub;

    return id == null ? "" : String(id);
  } catch {
    return "";
  }
}

function getUserId(user?: ChatUser): string {
  return String(user?.id ?? user?.userId ?? "");
}

function isOwnMessage(
  message: ChatMessage,
  currentUserId: string
): boolean {
  const senderId = String(message.senderId ?? "").trim();
  const userId = String(currentUserId ?? "").trim();

  return Boolean(userId && senderId && senderId === userId);
}

function getOtherUser(
  conversation: Conversation,
  currentUserId: string
): ChatUser | undefined {
  const directUser = conversation.otherUser || conversation.recipient;

  if (directUser) return directUser;

  const members =
    conversation.members ||
    conversation.users ||
    conversation.participants ||
    [];

  return members.find(
    (member) => getUserId(member) !== String(currentUserId)
  );
}

function getConversationDisplayName(
  conversation: Conversation,
  currentUserId: string
): string {
  const person = getOtherUser(conversation, currentUserId);

  return (
    person?.name ||
    person?.username ||
    person?.email ||
    conversation.title ||
    conversation.name ||
    "User"
  );
}

export default function ChatPage() {
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [search, setSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");

  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [startingConversation, setStartingConversation] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  const socketRef = useRef<Socket | null>(null);
  const conversationRef = useRef("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const openingRef = useRef<string | null>(null);

  useEffect(() => {
    setCurrentUserId(getStoredUserId());
  }, []);

  useEffect(() => {
    conversationRef.current = activeConversationId;

    if (activeConversationId) {
      localStorage.setItem(
        "nash_active_conversation",
        activeConversationId
      );
    } else {
      localStorage.removeItem("nash_active_conversation");
    }
  }, [activeConversationId]);

  const addMessage = useCallback((incoming: ChatMessage) => {
    if (!incoming?.conversationId || incoming?.senderId == null) {
      return;
    }

    setMessages((previous) => {
      const incomingId = getMessageId(incoming);
      const existingIndex = previous.findIndex(
        (message) => getMessageId(message) === incomingId
      );

      if (existingIndex !== -1) {
        // Merge the incoming version so senderName is not lost
        // if the same message arrived before its acknowledgement.
        const updated = [...previous];
        updated[existingIndex] = {
          ...updated[existingIndex],
          ...incoming,
        };
        return updated;
      }

      return [...previous, incoming].sort((a, b) => {
        const aTime = new Date(
          a.createdAt || a.timestamp || 0
        ).getTime();

        const bTime = new Date(
          b.createdAt || b.timestamp || 0
        ).getTime();

        return aTime - bTime;
      });
    });
  }, []);

  const upsertConversation = useCallback(
    (conversation: Conversation) => {
      const id = getConversationId(conversation);
      if (!id) return;

      setConversations((previous) => {
        const exists = previous.some(
          (item) => getConversationId(item) === id
        );

        if (exists) {
          return previous.map((item) =>
            getConversationId(item) === id
              ? { ...item, ...conversation, id }
              : item
          );
        }

        return [{ ...conversation, id }, ...previous];
      });
    },
    []
  );

  const openConversation = useCallback((conversationId: string) => {
    const id = String(conversationId || "").trim();
    if (!id) return;

    const socket = socketRef.current;

    if (!socket?.connected) {
      setError("You are not connected to the chat server.");
      return;
    }

    if (openingRef.current === id) return;

    openingRef.current = id;
    conversationRef.current = id;

    setActiveConversationId(id);
    setMessages([]);
    setLoadingMessages(true);
    setError("");
    setNotice("");

    socket.emit(
      "conversation:join",
      id,
      (joinResponse?: SocketResponse) => {
        if (conversationRef.current !== id) {
          openingRef.current = null;
          return;
        }

        if (!joinResponse?.success) {
          openingRef.current = null;
          setLoadingMessages(false);
          setError(
            responseError(
              joinResponse,
              "Could not join the conversation."
            )
          );
          return;
        }

        socket.emit(
          "message:history",
          id,
          (historyResponse?: SocketResponse) => {
            openingRef.current = null;

            if (conversationRef.current !== id) return;

            setLoadingMessages(false);

            if (!historyResponse?.success) {
              setError(
                responseError(
                  historyResponse,
                  "Could not load message history."
                )
              );
              return;
            }

            setMessages(historyResponse.messages ?? []);
          }
        );
      }
    );
  }, []);

  const startConversation = useCallback(
    (targetUserId: string) => {
      const socket = socketRef.current;
      const id = String(targetUserId || "").trim();

      if (!id) return;

      if (!socket?.connected) {
        setError("You are not connected to the chat server.");
        return;
      }

      if (id === currentUserId) {
        setError("You cannot start a conversation with yourself.");
        return;
      }

      setStartingConversation(true);
      setError("");
      setSearchError("");
      setNotice("");

      socket.emit(
        "conversation:start",
        { userId: id },
        (response?: SocketResponse) => {
          setStartingConversation(false);

          if (!response?.success) {
            setError(
              responseError(
                response,
                "Could not start the conversation."
              )
            );
            return;
          }

          const conversationId =
            response.conversationId ||
            getConversationId(response.conversation);

          if (!conversationId) {
            setError("The server did not return a conversation ID.");
            return;
          }

          const selectedUser = users.find(
            (user) => String(user.id) === id
          );

          upsertConversation({
            ...(response.conversation ?? {}),
            id: conversationId,
            otherUser:
              response.conversation?.otherUser ||
              selectedUser ||
              undefined,
            name:
              response.conversation?.name ||
              selectedUser?.name ||
              selectedUser?.username ||
              selectedUser?.email ||
              "User",
          });

          openConversation(conversationId);
        }
      );
    },
    [currentUserId, openConversation, upsertConversation, users]
  );

  useEffect(() => {
    const token = getStoredToken();

    if (!token) {
      setConnected(false);
      setError(
        "Please sign in first. No authentication token was found in localStorage."
      );
      return;
    }

    const socket = io(API_URL, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      auth: { token },
    });

    socketRef.current = socket;

    const handleConnect = () => {
      setConnected(true);
      setError("");
      socket.emit("presence:list");

      // Ask for the conversation list whenever the socket connects.
      socket.emit(
        "conversation:list",
        (response?: SocketResponse) => {
          if (response?.success && response.conversations) {
            const list = response.conversations as Conversation[];
            setConversations(list);
          }
        }
      );
    };

    const handleDisconnect = () => setConnected(false);

    const handleConnectError = (socketError: Error) => {
      console.error("Socket connection failed:", socketError);
      setConnected(false);
      setError(`Connection failed: ${socketError.message}`);
    };

    const handleNewMessage = (
      payload: { message?: ChatMessage } & Partial<ChatMessage>
    ) => {
      const incoming = payload?.message ?? (payload as ChatMessage);

      if (
        incoming?.conversationId &&
        String(incoming.conversationId) === conversationRef.current
      ) {
        addMessage(incoming);
      }
    };

    const handleConversationList = (payload: {
      success?: boolean;
      conversations?: Conversation[];
    }) => {
      if (payload?.success && Array.isArray(payload.conversations)) {
        setConversations(payload.conversations);
      }
    };

    const handleConversationInvited = (payload: {
      conversationId?: string;
      conversation?: Conversation;
      userId?: string;
      name?: string;
      email?: string;
    }) => {
      const id =
        payload.conversationId ||
        getConversationId(payload.conversation);

      if (!id) return;

      upsertConversation({
        ...(payload.conversation ?? {}),
        id,
        otherUser: {
          id: payload.userId || "",
          name: payload.name,
          email: payload.email,
        },
      });

      setNotice("You have been added to a conversation.");
      openConversation(id);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("message:new", handleNewMessage);
    socket.on("conversation:list", handleConversationList);
    socket.on("conversation:invited", handleConversationInvited);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:list", handleConversationList);
      socket.off("conversation:invited", handleConversationInvited);
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [addMessage, openConversation, upsertConversation]);

  useEffect(() => {
    const query = search.trim();
    setSearchError("");

    if (query.length < 2) {
      setUsers([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setSearchLoading(true);

      try {
        const token = getStoredToken();

        const response = await fetch(
          `${API_URL}/api/users/search?q=${encodeURIComponent(query)}`,
          {
            method: "GET",
            credentials: "include",
            headers: token
              ? { Authorization: `Bearer ${token}` }
              : {},
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

        const result = data as {
          users?: ChatUser[];
          data?: ChatUser[] | { users?: ChatUser[] };
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(
            result.error ||
              result.message ||
              `User search failed (HTTP ${response.status}).`
          );
        }

        const foundUsers = Array.isArray(data)
          ? (data as ChatUser[])
          : Array.isArray(result.users)
            ? result.users
            : Array.isArray(result.data)
              ? result.data
              : result.data &&
                  !Array.isArray(result.data) &&
                  Array.isArray(result.data.users)
                ? result.data.users
                : [];

        setUsers(
          foundUsers.filter(
            (user) =>
              user?.id && String(user.id) !== currentUserId
          )
        );
      } catch (searchError) {
        if (
          searchError instanceof Error &&
          searchError.name !== "AbortError"
        ) {
          console.error("User search failed:", searchError);
          setSearchError(searchError.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, currentUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const content = messageInput.trim();
    const conversationId = conversationRef.current;
    const socket = socketRef.current;

    if (!content || !conversationId || sending) return;

    if (!socket?.connected) {
      setError("You are not connected to the chat server.");
      return;
    }

    setSending(true);
    setError("");

    socket.emit(
      "message:send",
      { conversationId, content },
      (response?: SocketResponse) => {
        setSending(false);

        if (!response?.success) {
          setError(
            responseError(response, "Message could not be sent.")
          );
          return;
        }

        setMessageInput("");

        if (
          response.message &&
          typeof response.message === "object" &&
          "conversationId" in response.message
        ) {
          addMessage(response.message as ChatMessage);
        }
      }
    );
  };

  return (
    <main className="flex h-screen min-h-0 bg-gray-950 text-white">
      <aside className="flex w-80 shrink-0 flex-col border-r border-gray-800 bg-gray-900">
        <div className="border-b border-gray-800 p-5">
          <h1 className="text-2xl font-bold">Nash</h1>
          <p className="mt-1 text-sm text-gray-400">
            {connected ? "Connected" : "Offline"}
          </p>
          <p className="mt-1 break-all text-xs text-gray-500">
            {API_URL}
          </p>
        </div>

        <div className="border-b border-gray-800 p-4">
          <label
            htmlFor="user-search"
            className="mb-2 block text-sm font-medium"
          >
            Find someone
          </label>

          <input
            id="user-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 outline-none focus:border-blue-500"
          />

          <p className="mt-2 text-xs text-gray-500">
            Enter at least 2 characters.
          </p>

          {searchLoading && (
            <p className="mt-2 text-sm text-gray-400">Searching…</p>
          )}

          {searchError && (
            <p className="mt-2 break-words text-sm text-red-300">
              {searchError}
            </p>
          )}

          {users.length > 0 && (
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  disabled={!connected || startingConversation}
                  onClick={() => startConversation(user.id)}
                  className="flex w-full items-center justify-between rounded-lg bg-gray-800 p-3 text-left hover:bg-gray-700 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {user.name || user.username || user.email || "User"}
                    </span>
                    {user.email && (
                      <span className="block truncate text-xs text-gray-400">
                        {user.email}
                      </span>
                    )}
                  </span>
                  <span className="ml-2 text-sm text-blue-400">
                    {startingConversation ? "…" : "Chat"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {search.trim().length >= 2 &&
            !searchLoading &&
            !searchError &&
            users.length === 0 && (
              <p className="mt-3 text-sm text-gray-500">
                No users found.
              </p>
            )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {conversations.length === 0 ? (
            <p className="text-sm text-gray-500">
              Search for someone above to start chatting.
            </p>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => {
                const id = getConversationId(conversation);
                if (!id) return null;

                const person = getOtherUser(
                  conversation,
                  currentUserId
                );

                const displayName =
                  person?.name ||
                  person?.username ||
                  person?.email ||
                  conversation.title ||
                  conversation.name ||
                  "User";

                const email = person?.email;

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
                      {displayName}
                    </span>

                    {email && (
                      <span className="mt-1 block truncate text-xs text-gray-300">
                        {email}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="font-semibold">
            {activeConversationId
              ? (() => {
                  const active = conversations.find(
                    (conversation) =>
                      getConversationId(conversation) ===
                      activeConversationId
                  );

                  return active
                    ? getConversationDisplayName(active, currentUserId)
                    : "Chat";
                })()
              : "Welcome to Nash"}
          </h2>

          <span
            className={`text-sm ${
              connected ? "text-green-400" : "text-red-400"
            }`}
          >
            {connected ? "Online" : "Offline"}
          </span>
        </header>

        {notice && (
          <div className="border-b border-blue-900 bg-blue-950 px-6 py-3 text-sm text-blue-200">
            {notice}
            <button
              type="button"
              onClick={() => setNotice("")}
              className="ml-3 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="border-b border-red-900 bg-red-950 px-6 py-3 text-sm text-red-200">
            {error}
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-3 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {!activeConversationId ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center">
            <div>
              <h3 className="text-xl font-semibold">
                Your conversations, all in one place
              </h3>
              <p className="mt-2 text-gray-400">
                Search for a user to start chatting.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {loadingMessages ? (
                <p className="text-center text-gray-400">
                  Loading messages…
                </p>
              ) : messages.length === 0 ? (
                <p className="text-center text-gray-500">
                  No messages yet. Say hello!
                </p>
              ) : (
                messages.map((message) => {
                  const mine = isOwnMessage(
                    message,
                    currentUserId
                  );

                  return (
                    <div
                      key={getMessageId(message)}
                      className={`flex w-full ${
                        mine ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                          mine
                            ? "rounded-br-md bg-blue-600 text-white"
                            : "rounded-bl-md bg-gray-200 text-gray-900"
                        }`}
                      >
                        {!mine && (
                          <p className="mb-1 text-xs font-semibold text-gray-600">
                            {getMessageSenderName(message)}
                          </p>
                        )}

                        <p className="whitespace-pre-wrap break-words">
                          {getMessageText(message)}
                        </p>

                        {(message.createdAt || message.timestamp) && (
                          <p
                            className={`mt-1 text-right text-xs ${
                              mine ? "text-blue-100" : "text-gray-500"
                            }`}
                          >
                            {new Date(
                              message.createdAt || message.timestamp!
                            ).toLocaleTimeString([], {
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

              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={sendMessage}
              className="flex gap-3 border-t border-gray-800 p-4"
            >
              <input
                value={messageInput}
                onChange={(event) => setMessageInput(event.target.value)}
                placeholder="Type a message…"
                maxLength={5000}
                disabled={!connected || sending || loadingMessages}
                className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 outline-none focus:border-blue-500 disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={
                  !connected ||
                  sending ||
                  !messageInput.trim() ||
                  loadingMessages
                }
                className="rounded-xl bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
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
