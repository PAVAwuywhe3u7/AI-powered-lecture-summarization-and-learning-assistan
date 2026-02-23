function PanelCard({
  title,
  subtitle,
  eyebrow,
  headerRight = null,
  className = "",
  contentClassName = "",
  children,
}) {
  return (
    <section className={`panel-card ${className}`}>
      {(title || subtitle || eyebrow || headerRight) && (
        <header className="panel-card-header">
          <div>
            {eyebrow && <p className="panel-card-eyebrow">{eyebrow}</p>}
            {title && <h3 className="panel-card-title">{title}</h3>}
            {subtitle && <p className="panel-card-subtitle">{subtitle}</p>}
          </div>
          {headerRight && <div>{headerRight}</div>}
        </header>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

export default PanelCard;
