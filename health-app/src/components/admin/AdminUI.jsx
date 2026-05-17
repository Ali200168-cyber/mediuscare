import { API_URL } from "../../config/api";

export const adminFetch = (path, opts = {}) => {
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

export const AdHero = ({ eyebrow, title, subtitle }) => (
  <header className="ad-hero">
    {eyebrow && <p className="ad-hero-eyebrow">{eyebrow}</p>}
    <h1>{title}</h1>
    {subtitle && <p>{subtitle}</p>}
  </header>
);

export const AdStat = ({ label, value, tone }) => (
  <article className={`ad-stat${tone ? ` ad-stat--${tone}` : ""}`}>
    <p className="ad-stat-label">{label}</p>
    <p className="ad-stat-value">{value}</p>
  </article>
);

export const AdSection = ({ id, title, desc, badge, children }) => (
  <section className="ad-section" id={id}>
    <header className="ad-section-head">
      <div>
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {badge && <span className="ad-pill">{badge}</span>}
    </header>
    {children}
  </section>
);

export const AdPanel = ({ title, children, className = "" }) => (
  <div className={`ad-panel ${className}`.trim()}>
    {title && <h3>{title}</h3>}
    {children}
  </div>
);

export const AdAlert = ({ tone = "info", children }) => (
  <div className={`ad-alert ad-alert-${tone}`} role="alert">
    {children}
  </div>
);

export const AdEmpty = ({ message }) => <p className="ad-empty">{message}</p>;

export const AdButton = ({ variant = "primary", children, className = "", ...props }) => (
  <button type="button" className={`ad-btn ad-btn-${variant} ${className}`.trim()} {...props}>
    {children}
  </button>
);
