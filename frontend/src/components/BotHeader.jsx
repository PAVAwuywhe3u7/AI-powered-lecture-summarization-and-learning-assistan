function BotHeader({
  icon,
  iconClassName = "",
  title,
  subtitle,
  capabilities = [],
  trustMessage,
  actions = null,
}) {
  return (
    <div className="bot-header">
      <div className="bot-header-title-wrap">
        <span className={`bot-avatar ${iconClassName}`} aria-hidden="true">
          {icon}
        </span>
        <div>
          <p className="bot-header-title">{title}</p>
          <p className="bot-header-subtitle">{subtitle}</p>
          {trustMessage && <p className="bot-trust-note">{trustMessage}</p>}
        </div>
      </div>

      <div className="bot-header-actions">
        {capabilities.length > 0 && (
          <div className="bot-capability-row">
            {capabilities.map((label) => (
              <span key={label} className="bot-pill">
                {label}
              </span>
            ))}
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}

export default BotHeader;
