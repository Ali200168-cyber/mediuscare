import { Link } from "react-router-dom";

export const PtPageHeader = ({ title, subtitle, actions, children }) => (
  <header className="pt-page-header">
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="pt-sub">{subtitle}</p>}
    </div>
    {(actions || children) && <div className="pt-actions">{actions || children}</div>}
  </header>
);

export const PtCard = ({ title, value, unit, badge, children, className = "", flat }) => (
  <article className={`pt-card${flat ? " pt-card-flat" : ""} ${className}`.trim()}>
    {title && <p className="pt-card-title">{title}</p>}
    {value != null && (
      <p className="pt-card-value">
        {value}
        {unit && <span className="pt-card-unit"> {unit}</span>}
      </p>
    )}
    {badge}
    {children}
  </article>
);

export const PtBadge = ({ tone = "neutral", children }) => (
  <span className={`pt-badge pt-badge-${tone}`}>{children}</span>
);

export const PtButton = ({ variant = "primary", size, className = "", to, children, ...props }) => {
  const cls = `pt-btn pt-btn-${variant}${size === "sm" ? " pt-btn-sm" : ""} ${className}`.trim();
  if (to) {
    return (
      <Link to={to} className={cls} {...props}>
        {children}
      </Link>
    );
  }
  const { type = "button", ...btnProps } = props;
  return (
    <button type={type} className={cls} {...btnProps}>
      {children}
    </button>
  );
};

export const PtTabs = ({ tabs, active, onChange }) => (
  <div className="pt-tabs" role="tablist">
    {tabs.map(({ id, label }) => (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={active === id}
        className={`pt-tab${active === id ? " active" : ""}`}
        onClick={() => onChange(id)}
      >
        {label}
      </button>
    ))}
  </div>
);

export const PtEmpty = ({ icon = "📋", title, message }) => (
  <div className="pt-empty">
    <div className="pt-empty-icon" aria-hidden>{icon}</div>
    <h3>{title}</h3>
    {message && <p>{message}</p>}
  </div>
);

export const PtAlert = ({ tone = "info", children }) => (
  <div className={`pt-alert pt-alert-${tone}`} role="alert">
    {children}
  </div>
);

export const PtSkeletonGrid = ({ count = 4 }) => (
  <div className="pt-grid pt-grid-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="pt-skeleton" />
    ))}
  </div>
);

export { patientFetch } from "./patientApi";
