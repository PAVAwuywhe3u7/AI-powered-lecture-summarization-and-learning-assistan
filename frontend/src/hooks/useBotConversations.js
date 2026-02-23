import { useCallback, useEffect, useMemo, useState } from "react";

const MAX_CONVERSATIONS = 12;
const MAX_MESSAGES = 80;

function makeConversationId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessage(item, index) {
  const safeRole = item?.role === "assistant" ? "assistant" : "user";
  const safeContent = typeof item?.content === "string" ? item.content : "";
  const safeCreatedAt = typeof item?.createdAt === "string" ? item.createdAt : new Date().toISOString();
  return {
    id: typeof item?.id === "string" && item.id ? item.id : `msg-${index}-${safeRole}`,
    role: safeRole,
    content: safeContent,
    createdAt: safeCreatedAt,
    failed: Boolean(item?.failed),
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .map(normalizeMessage)
    .slice(-MAX_MESSAGES);
}

function deriveTitle(messages, fallbackTitle) {
  const firstUserMessage = messages.find((item) => item.role === "user" && item.content.trim().length > 0);
  if (!firstUserMessage) {
    return `New ${fallbackTitle}`;
  }
  const firstLine = firstUserMessage.content.trim().replace(/\s+/g, " ");
  return firstLine.length > 44 ? `${firstLine.slice(0, 44)}...` : firstLine;
}

function derivePreview(messages) {
  if (!messages.length) {
    return "No messages yet.";
  }
  const lastMessage = messages[messages.length - 1];
  const compact = (lastMessage.content || "").trim().replace(/\s+/g, " ");
  if (!compact) {
    return "No text content.";
  }
  return compact.length > 78 ? `${compact.slice(0, 78)}...` : compact;
}

function buildConversation({ id, messages, fallbackTitle }) {
  const normalizedMessages = normalizeMessages(messages);
  return {
    id,
    title: deriveTitle(normalizedMessages, fallbackTitle),
    preview: derivePreview(normalizedMessages),
    messageCount: normalizedMessages.length,
    updatedAt: new Date().toISOString(),
    messages: normalizedMessages,
  };
}

function toStorageRecord(payload) {
  return {
    activeId: payload.activeId || "",
    items: Array.isArray(payload.items)
      ? payload.items
        .map((item) => ({
          id: item?.id || makeConversationId("conversation"),
          title: typeof item?.title === "string" && item.title.trim() ? item.title.trim() : "Conversation",
          preview: typeof item?.preview === "string" ? item.preview : "",
          messageCount: Number.isFinite(item?.messageCount) ? item.messageCount : 0,
          updatedAt: typeof item?.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
          messages: normalizeMessages(item?.messages || []),
        }))
        .slice(0, MAX_CONVERSATIONS)
      : [],
  };
}

function readFromStorage(storageKey) {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return { activeId: "", items: [] };
  }

  try {
    return toStorageRecord(JSON.parse(raw));
  } catch {
    return { activeId: "", items: [] };
  }
}

function saveToStorage(storageKey, payload) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(toStorageRecord(payload)));
  } catch {
    // Ignore quota and serialization errors to avoid blocking chat UX.
  }
}

export function useBotConversations({
  storageKey,
  messages,
  setMessages,
  fallbackTitle,
  idPrefix = "bot",
}) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [isHistoryReady, setIsHistoryReady] = useState(false);

  useEffect(() => {
    const stored = readFromStorage(storageKey);
    if (stored.items.length) {
      const targetConversation = stored.items.find((item) => item.id === stored.activeId) || stored.items[0];
      setConversations(stored.items);
      setActiveConversationId(targetConversation.id);
      setMessages(targetConversation.messages);
      setIsHistoryReady(true);
      return;
    }

    const seeded = buildConversation({
      id: makeConversationId(idPrefix),
      messages,
      fallbackTitle,
    });
    setConversations([seeded]);
    setActiveConversationId(seeded.id);
    setIsHistoryReady(true);
    // Intentionally scoped to storage key so each account gets isolated history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!isHistoryReady || !activeConversationId) {
      return;
    }

    setConversations((current) => {
      const nextConversation = buildConversation({
        id: activeConversationId,
        messages,
        fallbackTitle,
      });
      const remaining = current.filter((item) => item.id !== activeConversationId);
      return [nextConversation, ...remaining].slice(0, MAX_CONVERSATIONS);
    });
  }, [messages, activeConversationId, fallbackTitle, isHistoryReady]);

  useEffect(() => {
    if (!isHistoryReady) {
      return;
    }
    saveToStorage(storageKey, {
      activeId: activeConversationId,
      items: conversations,
    });
  }, [storageKey, conversations, activeConversationId, isHistoryReady]);

  const selectConversation = useCallback((conversationId) => {
    const selected = conversations.find((item) => item.id === conversationId);
    if (!selected) {
      return;
    }
    setActiveConversationId(selected.id);
    setMessages(selected.messages);
  }, [conversations, setMessages]);

  const createConversation = useCallback(() => {
    const fresh = buildConversation({
      id: makeConversationId(idPrefix),
      messages: [],
      fallbackTitle,
    });

    setConversations((current) => [fresh, ...current].slice(0, MAX_CONVERSATIONS));
    setActiveConversationId(fresh.id);
    setMessages([]);
  }, [fallbackTitle, idPrefix, setMessages]);

  const removeConversation = useCallback((conversationId) => {
    const remaining = conversations.filter((item) => item.id !== conversationId);

    if (!remaining.length) {
      const fresh = buildConversation({
        id: makeConversationId(idPrefix),
        messages: [],
        fallbackTitle,
      });
      setConversations([fresh]);
      setActiveConversationId(fresh.id);
      setMessages([]);
      return;
    }

    setConversations(remaining);
    if (conversationId === activeConversationId) {
      setActiveConversationId(remaining[0].id);
      setMessages(remaining[0].messages);
    }
  }, [conversations, activeConversationId, fallbackTitle, idPrefix, setMessages]);

  const historyItems = useMemo(
    () =>
      conversations.map((item) => ({
        id: item.id,
        title: item.title,
        preview: item.preview,
        messageCount: item.messageCount,
        updatedAt: item.updatedAt,
      })),
    [conversations],
  );

  return {
    historyItems,
    activeConversationId,
    isHistoryReady,
    selectConversation,
    createConversation,
    removeConversation,
  };
}
