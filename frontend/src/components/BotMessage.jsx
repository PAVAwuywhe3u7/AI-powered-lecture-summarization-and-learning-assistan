function formatTime(dateLike) {
  if (!dateLike) {
    return "";
  }

  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function BotMessage({
  roleLabel,
  isUser,
  content,
  createdAt,
  imageDataUrl,
  onCopy,
  copyLabel = "Copy",
  onRetry,
  failed = false,
}) {
  const timestamp = formatTime(createdAt);

  return (
    <article className={`bot-message-block ${isUser ? "bot-message-block-user" : "bot-message-block-assistant"}`}>
      <header className="bot-message-meta">
        <span className="bot-message-role">{roleLabel}</span>
        {timestamp && <time className="bot-message-time">{timestamp}</time>}
      </header>

      <div className={`bot-message ${isUser ? "bot-message-user" : "bot-message-assistant"}`}>
        {content}
      </div>

      {!isUser && onCopy && (
        <button type="button" className="bot-message-action" onClick={onCopy} aria-label="Copy assistant response">
          {copyLabel}
        </button>
      )}

      {isUser && failed && onRetry && (
        <button type="button" className="bot-message-action bot-message-action-warning" onClick={onRetry} aria-label="Retry sending message">
          Retry
        </button>
      )}

      {imageDataUrl && (
        <div className={`mt-2 ${isUser ? "ml-auto max-w-[90%]" : "max-w-[90%]"}`}>
          <img src={imageDataUrl} alt="User uploaded" className="bot-attachment-image max-h-52" />
        </div>
      )}
    </article>
  );
}

export default BotMessage;
