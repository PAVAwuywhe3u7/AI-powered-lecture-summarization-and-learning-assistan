import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import BotHeader from "./BotHeader";
import BotMessage from "./BotMessage";

const starterPrompts = [
  "Explain the core concept in simple terms.",
  "Give 5 exam revision points from this summary.",
  "What are the most important definitions to memorize?",
];

function TypingDots() {
  return (
    <div className="bot-typing">
      {[0, 1, 2].map((dot) => (
        <motion.span
          key={dot}
          className="bot-typing-dot"
          animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: dot * 0.12 }}
        />
      ))}
    </div>
  );
}

function ChatBox({ messages, onSend, onRetry, isTyping, error }) {
  const [input, setInput] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const messagesEndRef = useRef(null);
  const canSend = Boolean(input.trim()) && !isTyping;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const submitPrompt = async (prompt) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }
    setInput("");
    await onSend(trimmed);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitPrompt(input);
  };

  const handleKeyDown = async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      await submitPrompt(input);
    }
  };

  const handleCopy = async (message) => {
    if (!message?.content) {
      return;
    }
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? "" : current));
      }, 1200);
    } catch {
      // Ignore clipboard errors without interrupting chat flow.
    }
  };

  return (
    <div className="bot-shell bot-shell-chat flex h-[72vh] flex-col p-4 sm:p-6">
      <BotHeader
        iconClassName="bot-avatar-chat"
        title="Chat Bot"
        subtitle="Grounded entirely in your current lecture summary."
        trustMessage="AI responses can be imperfect. Verify critical facts before relying on them."
        capabilities={["Context locked", "Exam-focused"]}
        icon={(
          <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
            <path
              d="M5 18.5v-10A2.5 2.5 0 0 1 7.5 6h9A2.5 2.5 0 0 1 19 8.5v6A2.5 2.5 0 0 1 16.5 17H10l-3.8 2.5A.8.8 0 0 1 5 18.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M8.5 11.2h7m-7 2.7h4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      />

      <div className="scrollable bot-stream mb-4 flex-1 space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite" aria-busy={isTyping}>
        {messages.length === 0 && (
          <div className="bot-empty bot-empty-centered">
            <p className="bot-empty-title">Start with a precise summary question</p>
            <p className="bot-empty-body">Ask about definitions, concept links, or revision points for better responses.</p>
            <div className="bot-quick-grid">
              {starterPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => setInput(prompt)} className="bot-quick-btn focus-ring">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <BotMessage
              key={message.id}
              roleLabel={isUser ? "You" : "Chat Bot"}
              isUser={isUser}
              content={message.content}
              createdAt={message.createdAt}
              failed={Boolean(message.failed)}
              onRetry={isUser && message.failed ? () => onRetry(message) : null}
              onCopy={!isUser ? () => handleCopy(message) : null}
              copyLabel={copiedMessageId === message.id ? "Copied" : "Copy"}
            />
          );
        })}

        {isTyping && (
          <div className="bot-message-block bot-message-block-assistant">
            <header className="bot-message-meta">
              <span className="bot-message-role">Chat Bot</span>
            </header>
            <div className="bot-message bot-message-assistant">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <p className="sr-only" aria-live="polite">{isTyping ? "Chat Bot is typing." : ""}</p>

      {error && <p className="bot-error" role="alert">{error}</p>}

      <div className="bot-compose-wrap">
        <form onSubmit={handleSubmit} className="bot-input-row">
          <label htmlFor="chat-bot-compose" className="sr-only">Chat Bot message</label>
          <textarea
            id="chat-bot-compose"
            className="input-field bot-input bot-input-area"
            placeholder="Ask Chat Bot about your lecture summary..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Type your message for Chat Bot"
          />
          <motion.button
            whileHover={{ scale: canSend ? 1.03 : 1 }}
            whileTap={{ scale: canSend ? 0.97 : 1 }}
            className="primary-btn bot-send-btn focus-ring disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={!canSend}
            aria-disabled={!canSend}
          >
            Send
          </motion.button>
        </form>
        <p className="bot-compose-hint">Press Enter to send. Press Shift + Enter for a new line.</p>
      </div>
    </div>
  );
}

export default ChatBox;
