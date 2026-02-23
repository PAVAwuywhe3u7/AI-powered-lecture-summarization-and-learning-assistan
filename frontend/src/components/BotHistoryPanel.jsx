function formatRelativeTime(isoString) {
  if (!isoString) {
    return "now";
  }

  const parsed = new Date(isoString);
  const timestamp = parsed.getTime();
  if (Number.isNaN(timestamp)) {
    return "now";
  }

  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return "just now";
  }
  if (diffMs < hour) {
    return `${Math.round(diffMs / minute)}m ago`;
  }
  if (diffMs < day) {
    return `${Math.round(diffMs / hour)}h ago`;
  }
  if (diffMs < day * 7) {
    return `${Math.round(diffMs / day)}d ago`;
  }

  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BotHistoryPanel({
  title,
  subtitle,
  items,
  activeId,
  onCreate,
  onSelect,
  onDelete,
  variant = "chat",
}) {
  return (
    <aside className={`bot-history-panel bot-history-panel-${variant}`}>
      <header className="bot-history-header">
        <div>
          <p className="bot-history-title">{title}</p>
          <p className="bot-history-subtitle">{subtitle}</p>
        </div>
        <button type="button" className="secondary-btn bot-history-new focus-ring" onClick={onCreate}>
          New
        </button>
      </header>

      <div className="scrollable bot-history-list" role="list" aria-label={`${title} list`}>
        {items.map((item) => (
          <div key={item.id} className="bot-history-row" role="listitem">
            <button
              type="button"
              className={`bot-history-item focus-ring ${activeId === item.id ? "bot-history-item-active" : ""}`}
              onClick={() => onSelect(item.id)}
              aria-pressed={activeId === item.id}
            >
              <span className="bot-history-item-title">{item.title}</span>
              <span className="bot-history-item-meta">
                {formatRelativeTime(item.updatedAt)} • {item.messageCount} msg
                {item.messageCount === 1 ? "" : "s"}
              </span>
              <span className="bot-history-item-preview">{item.preview || "No messages yet."}</span>
            </button>
            <button
              type="button"
              className="bot-history-delete focus-ring"
              onClick={() => onDelete(item.id)}
              aria-label={`Delete ${item.title}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default BotHistoryPanel;

