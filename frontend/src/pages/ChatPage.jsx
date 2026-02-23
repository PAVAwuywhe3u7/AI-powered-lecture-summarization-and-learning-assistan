import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import BotHistoryPanel from "../components/BotHistoryPanel";
import ChatBox from "../components/ChatBox";
import EmptyStateCard from "../components/EmptyStateCard";
import { useAuth } from "../context/AuthContext";
import { useSession } from "../context/SessionContext";
import { useBotConversations } from "../hooks/useBotConversations";
import { chatWithSummary, getErrorMessage } from "../services/api";

function createMessageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function withDefaults(message) {
  const fallbackId = `${message.role || "assistant"}-${message.createdAt || "legacy"}-${(message.content || "").slice(0, 24)}`;
  return {
    id: message.id || fallbackId,
    role: message.role,
    content: message.content || "",
    createdAt: message.createdAt || new Date().toISOString(),
    failed: Boolean(message.failed),
  };
}

function ChatPage() {
  const { user } = useAuth();
  const { summary, sessionId, setSessionId, chatHistory, setChatHistory } = useSession();
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState("");
  const historyOwnerKey = useMemo(
    () => (user?.id || user?.email || "anonymous").toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
    [user?.id, user?.email],
  );
  const chatHistoryStorageKey = useMemo(
    () => `edu-simplify:history:chat:${historyOwnerKey}`,
    [historyOwnerKey],
  );
  const {
    historyItems,
    activeConversationId,
    selectConversation,
    createConversation,
    removeConversation,
  } = useBotConversations({
    storageKey: chatHistoryStorageKey,
    messages: chatHistory,
    setMessages: setChatHistory,
    fallbackTitle: "Chat Bot",
    idPrefix: "chat",
  });

  if (!summary) {
    return (
      <EmptyStateCard
        title="No summary context found"
        description="Generate a summary first, then use Chat Bot for context-grounded answers."
        primaryAction={{ label: "Open Studio", to: "/studio" }}
      />
    );
  }

  const runChatRequest = async ({ message, messageId = null }) => {
    const normalizedMessage = (message || "").trim();
    if (!normalizedMessage || isTyping) {
      return;
    }

    const userMessageId = messageId || createMessageId();
    const userMessage = withDefaults({
      id: userMessageId,
      role: "user",
      content: normalizedMessage,
      failed: false,
    });

    const historyBase = messageId
      ? chatHistory.map((item) => (item.id === messageId ? { ...item, failed: false } : item))
      : [...chatHistory, userMessage];

    const historyForRequest = historyBase
      .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
      .map((item) => ({ role: item.role, content: item.content }))
      .slice(-10);

    setError("");
    setIsTyping(true);
    setChatHistory((prev) => {
      if (messageId) {
        return prev.map((item) => (item.id === messageId ? { ...item, failed: false } : item));
      }
      return [...prev, userMessage];
    });

    try {
      const response = await chatWithSummary({
        message: normalizedMessage,
        session_id: sessionId || undefined,
        summary,
        history: historyForRequest,
      });

      setSessionId(response.session_id);
      setChatHistory((prev) => [
        ...prev,
        withDefaults({
          role: "assistant",
          content: response.answer,
        }),
      ]);
    } catch (chatError) {
      setError(getErrorMessage(chatError));
      setChatHistory((prev) =>
        prev.map((item) => (item.id === userMessageId ? { ...item, failed: true } : item)),
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleRetry = async (messageItem) => {
    await runChatRequest({ message: messageItem.content, messageId: messageItem.id });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/90">Summary Assistant</p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Chat Bot</h1>
        <p className="text-sm text-slate-300">Ask focused questions grounded in your generated lecture summary.</p>
        <div className="flex flex-wrap gap-2">
          <span className="chip-btn">Context-only answers</span>
          <span className="chip-btn">Definition breakdowns</span>
          <span className="chip-btn">Revision-friendly output</span>
        </div>
      </div>

      <div className="bot-page-grid">
        <BotHistoryPanel
          title="Chat History"
          subtitle="Open recent context chats"
          items={historyItems}
          activeId={activeConversationId}
          onCreate={() => {
            setError("");
            createConversation();
          }}
          onSelect={(conversationId) => {
            setError("");
            selectConversation(conversationId);
          }}
          onDelete={(conversationId) => {
            setError("");
            removeConversation(conversationId);
          }}
          variant="chat"
        />

        <ChatBox
          messages={chatHistory.map(withDefaults)}
          onSend={(message) => runChatRequest({ message })}
          onRetry={handleRetry}
          isTyping={isTyping}
          error={error}
        />
      </div>
    </motion.section>
  );
}

export default ChatPage;
