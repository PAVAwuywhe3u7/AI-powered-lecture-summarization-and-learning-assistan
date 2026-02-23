import { useMemo, useState } from "react";
import { motion } from "framer-motion";

import BotHistoryPanel from "../components/BotHistoryPanel";
import SolverChatBox from "../components/SolverChatBox";
import { useAuth } from "../context/AuthContext";
import { useSession } from "../context/SessionContext";
import { useBotConversations } from "../hooks/useBotConversations";
import { getErrorMessage, solverChat } from "../services/api";

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
    imageDataUrl: message.imageDataUrl || null,
  };
}

function SolverPage() {
  const { user } = useAuth();
  const { solverHistory, setSolverHistory } = useSession();
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState("");
  const historyOwnerKey = useMemo(
    () => (user?.id || user?.email || "anonymous").toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
    [user?.id, user?.email],
  );
  const solverHistoryStorageKey = useMemo(
    () => `edu-simplify:history:homework:${historyOwnerKey}`,
    [historyOwnerKey],
  );
  const {
    historyItems,
    activeConversationId,
    selectConversation,
    createConversation,
    removeConversation,
  } = useBotConversations({
    storageKey: solverHistoryStorageKey,
    messages: solverHistory,
    setMessages: setSolverHistory,
    fallbackTitle: "Homework Bot",
    idPrefix: "homework",
  });

  const runSolverRequest = async ({ message, imageDataUrl, messageId = null }) => {
    const safeMessage = (message || "").trim() || "Please solve the uploaded image.";
    if (isTyping) {
      return;
    }

    const userMessageId = messageId || createMessageId();
    const userEntry = withDefaults({
      id: userMessageId,
      role: "user",
      content: safeMessage,
      imageDataUrl: imageDataUrl || null,
      failed: false,
    });

    const historyBase = messageId
      ? solverHistory.map((item) => (item.id === messageId ? { ...item, failed: false } : item))
      : [...solverHistory, userEntry];

    const historyPayload = historyBase
      .filter((item) => item.role === "user" || item.role === "assistant")
      .map((item) => ({ role: item.role, content: item.content }))
      .slice(-10);

    setError("");
    setIsTyping(true);
    setSolverHistory((prev) => {
      if (messageId) {
        return prev.map((item) => (item.id === messageId ? { ...item, failed: false } : item));
      }
      return [...prev, userEntry];
    });

    try {
      const response = await solverChat({
        message: safeMessage,
        history: historyPayload,
        image_data_url: imageDataUrl || undefined,
      });

      setSolverHistory((prev) => [
        ...prev,
        withDefaults({
          role: "assistant",
          content: response.answer,
        }),
      ]);
    } catch (solverError) {
      setError(getErrorMessage(solverError));
      setSolverHistory((prev) =>
        prev.map((item) => (item.id === userMessageId ? { ...item, failed: true } : item)),
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleRetry = async (messageItem) => {
    if (!messageItem) {
      return;
    }
    await runSolverRequest({
      message: messageItem.content,
      imageDataUrl: messageItem.imageDataUrl || null,
      messageId: messageItem.id,
    });
  };

  const normalizedMessages = solverHistory.map(withDefaults);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200/90">Homework Assistant</p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Homework Bot</h1>
        <p className="text-sm text-slate-300">
          Dedicated bot for math, coding, science, and technical homework with screenshot + step-by-step guidance.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="chip-btn">Image + text prompts</span>
          <span className="chip-btn">Step-by-step answers</span>
          <span className="chip-btn">Exam-focused shortcuts</span>
        </div>
      </div>

      <div className="bot-page-grid">
        <BotHistoryPanel
          title="Homework History"
          subtitle="Resume previous solves"
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
          variant="homework"
        />

        <SolverChatBox
          messages={normalizedMessages}
          onSend={runSolverRequest}
          onRetry={handleRetry}
          isTyping={isTyping}
          error={error}
        />
      </div>
    </motion.section>
  );
}

export default SolverPage;
