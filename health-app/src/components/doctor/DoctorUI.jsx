import { Link } from "react-router-dom";

export const DrPageHeader = ({ title, subtitle, actions, children }) => {
  if (!actions && !children && !title) return null;
  if (title) {
    return (
      <header className="dr-page-header">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="dr-sub">{subtitle}</p>}
        </div>
        {(actions || children) && <div className="dr-actions">{actions || children}</div>}
      </header>
    );
  }
  return actions || children ? <div className="dr-actions dr-actions-bar">{actions || children}</div> : null;
};

export const DrCard = ({ title, value, unit, badge, children, className = "", flat }) => (
  <article className={`dr-card${flat ? " dr-card-flat" : ""} ${className}`.trim()}>
    {title && <p className="dr-card-title">{title}</p>}
    {value != null && (
      <p className="dr-card-value">
        {value}
        {unit && <span className="dr-card-unit"> {unit}</span>}
      </p>
    )}
    {badge}
    {children}
  </article>
);

export const DrBadge = ({ tone = "neutral", children }) => (
  <span className={`dr-badge dr-badge-${tone}`}>{children}</span>
);

export const DrButton = ({ variant = "primary", size, className = "", to, children, ...props }) => {
  const cls = `dr-btn dr-btn-${variant}${size === "sm" ? " dr-btn-sm" : ""} ${className}`.trim();
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

export const DrTabs = ({ tabs, active, onChange }) => (
  <section className="dr-tabs" role="tablist">
    {tabs.map(({ id, label }) => (
      <button
        key={id}
        type="button"
        role="tab"
        aria-selected={active === id}
        className={`dr-tab${active === id ? " active" : ""}`}
        onClick={() => onChange(id)}
      >
        {label}
      </button>
    ))}
  </section>
);

export const DrEmpty = ({ icon = "—", title, message }) => (
  <div className="dr-empty">
    <div className="dr-empty-icon" aria-hidden>{icon}</div>
    <h3>{title}</h3>
    {message && <p>{message}</p>}
  </div>
);

export const DrAlert = ({ tone = "info", children }) => (
  <div className={`dr-alert dr-alert-${tone}`} role="alert">
    {children}
  </div>
);

export const DrSkeletonGrid = ({ count = 4 }) => (
  <div className="dr-grid dr-grid-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="dr-skeleton" />
    ))}
  </div>
);

export const DrTable = ({ columns, children, className = "" }) => (
  <div className={`dr-table-wrap ${className}`.trim()}>
    <div className="dr-table-head">
      {columns.map((col) => (
        <span key={col}>{col}</span>
      ))}
    </div>
    <div className="dr-table-body">{children}</div>
  </div>
);

export const DrTableRow = ({ children, onClick, expanded }) => (
  <div className={`dr-table-row${expanded ? " is-open" : ""}`}>
    {onClick ? (
      <button type="button" className="dr-table-row-btn" onClick={onClick}>
        {children}
      </button>
    ) : (
      <div className="dr-table-row-inner">{children}</div>
    )}
  </div>
);

export { doctorFetch } from "./doctorApi";
