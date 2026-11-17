import { Link } from 'react-router-dom';

/** Shared dashboard shell. `theme` is one of: college, avp, adminvp, finance, student, admin. */
export function DashboardPage({ theme = '', children }) {
  return (
    <div className={`dash-page ${theme ? `theme-${theme}` : ''}`.trim()}>
      {children}
    </div>
  );
}

export function DashboardHero({
  badge,
  title,
  description,
  actions = [],
  actionSlot,
  snapshot,
}) {
  const hasActions = actions.length > 0 || actionSlot;
  return (
    <section className="dash-hero">
      <div className="dash-hero-copy">
        {badge && <span className="dash-hero-badge">{badge}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {hasActions && (
          <div className="dash-hero-actions">
            {actions.map((action) => (
              <Link
                key={`${action.to}-${action.label}`}
                to={action.to}
                className={`dash-btn ${action.variant || 'ghost'}`}
              >
                {action.icon && <span aria-hidden="true">{action.icon}</span>}
                {action.label}
              </Link>
            ))}
            {actionSlot}
          </div>
        )}
      </div>
      {snapshot && <div className="dash-snap">{snapshot}</div>}
    </section>
  );
}

export function DashboardSnapshot({
  label,
  value,
  meta = [],
  progress,
  progressLabel,
  foot = [],
}) {
  return (
    <>
      <span className="dash-snap-label">{label}</span>
      <strong className="dash-snap-amount">{value}</strong>
      {meta.length > 0 && (
        <div className="dash-snap-meta">
          {meta.map((item) => <span key={item}>{item}</span>)}
        </div>
      )}
      {typeof progress === 'number' && (
        <div
          className="dash-progress"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label={progressLabel || label}
        >
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {foot.length > 0 && (
        <div className="dash-snap-foot">
          {foot.map((item) => (
            <span key={item.label}>
              <b>{item.value}</b> {item.label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

export function DashboardKpi({ icon, label, value, sub, trend, color = '#059669', to }) {
  const content = (
    <>
      <div className="dash-kpi-top">
        <span className="dash-kpi-icon" aria-hidden="true">{icon}</span>
        {trend && <span className="dash-kpi-trend">{trend}</span>}
      </div>
      <h3>{label}</h3>
      <p className="dash-kpi-value">{value}</p>
      {sub && <span className="dash-kpi-sub">{sub}</span>}
    </>
  );

  const style = { '--kpi-color': color };

  return to
    ? <Link to={to} className="dash-kpi" style={style}>{content}</Link>
    : <article className="dash-kpi" style={style}>{content}</article>;
}

export function DashboardPanel({
  title,
  subtitle,
  action,
  children,
  className = '',
  flush = false,
}) {
  return (
    <section className={`dash-panel ${className}`.trim()}>
      {(title || action) && (
        <div className="dash-panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {flush ? children : <div className="dash-panel-body">{children}</div>}
    </section>
  );
}

export function DashboardEmpty({ icon = '📭', title, children }) {
  return (
    <div className="dash-empty">
      <span aria-hidden="true">{icon}</span>
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
    </div>
  );
}

export function DashboardAttention({ to, icon, title, subtitle, count }) {
  return (
    <Link to={to} className="dash-attention-item">
      <span className="dash-attention-ico" aria-hidden="true">{icon}</span>
      <span className="dash-attention-text">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
      {count != null && <span className="dash-attention-count">{count}</span>}
    </Link>
  );
}

export function DashboardAction({ to, icon, label }) {
  return (
    <Link to={to} className="dash-action">
      <span aria-hidden="true">{icon}</span>
      <strong>{label}</strong>
    </Link>
  );
}
