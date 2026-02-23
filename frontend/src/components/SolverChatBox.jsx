import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import BotHeader from "./BotHeader";
import BotMessage from "./BotMessage";

const quickPrompts = [
  "Solve this with clear step-by-step reasoning.",
  "Explain the uploaded screenshot and final answer.",
  "Give the shortest exam method and answer.",
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

function SolverChatBox({ messages, onSend, onRetry, isTyping, error }) {
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageName, setImageName] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const messagesEndRef = useRef(null);
  const canSend = Boolean(input.trim() || selectedImage) && !isTyping;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      setSelectedImage(null);
      setImageName("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setSelectedImage(value);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImageName("");
  };

  const submitPrompt = async (nextMessage) => {
    const message = (nextMessage || "").trim();
    if (!message && !selectedImage) {
      return;
    }

    setInput("");
    const imageData = selectedImage;
    clearImage();

    await onSend({
      message,
      imageDataUrl: imageData,
    });
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
      // Ignore clipboard errors without blocking chat interaction.
    }
  };

  return (
    <div className="bot-shell bot-shell-homework flex h-[74vh] flex-col p-4 sm:p-6">
      <BotHeader
        iconClassName="bot-avatar-homework"
        title="Homework Bot"
        subtitle="Upload homework screenshots and get clear, step-by-step solutions."
        trustMessage="Do not upload sensitive personal data. AI output can be wrong; verify final answers."
        capabilities={["Image + text", "Math/Coding/Science"]}
        actions={(
          <label className="bot-upload-btn focus-ring">
            Upload Image
            <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
        )}
        icon={(
          <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
            <path
              d="M4.6 7.8A2.8 2.8 0 0 1 7.4 5h9.2a2.8 2.8 0 0 1 2.8 2.8v8.4a2.8 2.8 0 0 1-2.8 2.8H7.4a2.8 2.8 0 0 1-2.8-2.8V7.8Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M8.3 9.6h7.4M8.3 13h4.6m-4.6 3.3h7.4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        )}
      />

      {selectedImage && (
        <div className="bot-attachment mb-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-slate-300">Attached: {imageName || "image"}</p>
            <button type="button" onClick={clearImage} className="chip-btn focus-ring">
              Remove
            </button>
          </div>
          <img src={selectedImage} alt="Attachment preview" className="bot-attachment-image" />
        </div>
      )}

      <div className="scrollable bot-stream mb-4 flex-1 space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite" aria-busy={isTyping}>
        {messages.length === 0 && (
          <div className="bot-empty bot-empty-centered">
            <p className="bot-empty-title">Try Homework Bot with one of these prompts</p>
            <p className="bot-empty-body">You can ask with or without an image. Attach a screenshot when the question is visual.</p>
            <div className="bot-quick-grid">
              {quickPrompts.map((prompt) => (
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
              roleLabel={isUser ? "You" : "Homework Bot"}
              isUser={isUser}
              content={message.content}
              createdAt={message.createdAt}
              imageDataUrl={message.imageDataUrl}
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
              <span className="bot-message-role">Homework Bot</span>
            </header>
            <div className="bot-message bot-message-assistant">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <p className="sr-only" aria-live="polite">{isTyping ? "Homework Bot is typing." : ""}</p>

      {error && <p className="bot-error" role="alert">{error}</p>}

      <div className="bot-compose-wrap">
        <form onSubmit={handleSubmit} className="bot-input-row">
          <label htmlFor="homework-bot-compose" className="sr-only">Homework Bot message</label>
          <textarea
            id="homework-bot-compose"
            className="input-field bot-input bot-input-area"
            placeholder="Ask a homework question or attach a screenshot..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Type your message for Homework Bot"
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

export default SolverChatBox;
