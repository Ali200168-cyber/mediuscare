import { Link } from "react-router-dom";
import { API_URL } from "../../config/api";

export const caregiverFetch = (path, opts = {}) => {
  const token = localStorage.getItem("token");
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  return fetch(url, {
    ...opts,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
};

export const CgHero = ({ eyebrow, title, subtitle, variant = "default", actions, children }) => (
  <header className={`cg-hero cg-hero--${variant}`}>
    {eyebrow && <p className="cg-hero-eyebrow">{eyebrow}</p>}
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
    {actions && <div className="cg-hero-actions">{actions}</div>}
    {children}
  </header>
);

export const CgPageHeader = ({ title, subtitle, actions }) => (
  <header className="cg-page-header">
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="cg-sub">{subtitle}</p>}
    </div>
    {actions && <div className="cg-actions">{actions}</div>}
  </header>
);

export const CgStat = ({ label, value, tone = "default" }) => (
  <article className={`cg-stat cg-stat--${tone}`}>
    <p className="cg-stat-label">{label}</p>
    <p className="cg-stat-value">{value}</p>
  </article>
);

export const CgCard = ({ title, value, children, className = "", flat, elevated }) => (
  <article
    className={`cg-card${flat ? " cg-card-flat" : ""}${elevated ? " cg-card-elevated" : ""} ${className}`.trim()}
  >
    {title && <p className="cg-card-title">{title}</p>}
    {value != null && <p className="cg-card-value">{value}</p>}
    {children}
  </article>
);

export const CgBadge = ({ tone = "neutral", children }) => (
  <span className={`cg-badge cg-badge-${tone}`}>{children}</span>
);

export const CgButton = ({ variant = "primary", size, className = "", to, children, ...props }) => {
  const cls = `cg-btn cg-btn-${variant}${size === "sm" ? " cg-btn-sm" : ""} ${className}`.trim();
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

export const CgAlert = ({ tone = "info", children }) => (
  <div className={`cg-alert cg-alert-${tone}`} role="alert">
    {children}
  </div>
);

export const CgEmpty = ({ icon = "💜", title, message }) => (
  <div className="cg-empty">
    <div className="cg-empty-icon" aria-hidden>
      {icon}
    </div>
    <h3>{title}</h3>
    {message && <p>{message}</p>}
  </div>
);

export const CgLoading = ({ text = "Loading…" }) => <div className="cg-loading">{text}</div>;

export const CgSectionTitle = ({ children }) => <h2 className="cg-section-title">{children}</h2>;
