import { Link } from "react-router-dom";

function EmptyStateCard({
  title,
  description,
  primaryAction,
  secondaryAction,
  className = "",
}) {
  return (
    <section className={`empty-state-card ${className}`} aria-live="polite">
      <div className="empty-state-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
          <path d="M4.5 8A2.5 2.5 0 0 1 7 5.5h10A2.5 2.5 0 0 1 19.5 8v8A2.5 2.5 0 0 1 17 18.5H7A2.5 2.5 0 0 1 4.5 16V8Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 10h8m-8 3.5h5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-description">{description}</p>
      <div className="empty-state-actions">
        {primaryAction && (
          primaryAction.to ? (
            <Link to={primaryAction.to} className="primary-btn">
              {primaryAction.label}
            </Link>
          ) : (
            <button type="button" className="primary-btn" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </button>
          )
        )}
        {secondaryAction && (
          secondaryAction.to ? (
            <Link to={secondaryAction.to} className="secondary-btn">
              {secondaryAction.label}
            </Link>
          ) : (
            <button type="button" className="secondary-btn" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </button>
          )
        )}
      </div>
    </section>
  );
}

export default EmptyStateCard;
