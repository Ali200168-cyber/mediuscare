import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineHome,
  HiOutlineHeart,
  HiOutlineInbox,
  HiOutlineCalendar,
  HiOutlineSparkles,
  HiOutlineChatBubbleLeftRight,
  HiOutlineBars3,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineArrowRightOnRectangle,
} from "react-icons/hi2";
import "../../styles/Doctor/doctor-system.css";
import { doctorFetch } from "../../components/doctor/doctorApi";

const NAV = [
  { to: "/doctor/dashboard", label: "Home", icon: HiOutlineHome },
  { to: "/doctor/patient-monitoring", label: "Patients", icon: HiOutlineHeart },
  { to: "/doctor/assignment-requests", label: "Inbox", icon: HiOutlineInbox },
  { to: "/doctor/requests", label: "Schedule", icon: HiOutlineCalendar },
  { to: "/doctor/ai-review", label: "AI Review", icon: HiOutlineSparkles, badgeKey: "ai" },
  { to: "/doctor/chat", label: "Messages", icon: HiOutlineChatBubbleLeftRight },
];

const PAGE_META = {
  "/doctor/dashboard": { title: "Command Center", desc: "Today at a glance" },
  "/doctor/patient-monitoring": { title: "Patients", desc: "Vitals & monitoring" },
  "/doctor/assignment-requests": { title: "Inbox", desc: "New assignments" },
  "/doctor/requests": { title: "Schedule", desc: "Visits & consultations" },
  "/doctor/ai-review": { title: "AI Review", desc: "Clinical AI decisions" },
  "/doctor/chat": { title: "Messages", desc: "Patient chat" },
};

export default function DoctorLayout({ children, headerActions }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mini, setMini] = useState(() => localStorage.getItem("ph_sidebar_mini") === "1");
  const [open, setOpen] = useState(false);
  const [aiPending, setAiPending] = useState(0);
  const [now, setNow] = useState(() => new Date());

  const meta = PAGE_META[location.pathname] || { title: "Medius Physician", desc: "" };

  useEffect(() => {
    localStorage.setItem("ph_sidebar_mini", mini ? "1" : "0");
  }, [mini]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const load = () => {
      doctorFetch("/api/ai/doctor/pending-count")
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setAiPending(d.pendingCount || 0);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const logout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    try {
      await doctorFetch("/api/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    navigate("/login");
  };

  const dateLabel = useMemo(
    () =>
      now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      }),
    [now],
  );

  const shellClass = ["doctor-app", "ph-app", mini ? "ph-mini" : "", open ? "ph-open" : ""].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <div className="ph-backdrop" onClick={() => setOpen(false)} aria-hidden />

      <aside className="ph-sidebar" aria-label="Navigation">
        <div className="ph-sidebar-glow" aria-hidden />

        <div className="ph-sidebar-date ph-sidebar-date-top">
          <time dateTime={now.toISOString()}>{dateLabel}</time>
        </div>

        <nav className="ph-nav">
          {NAV.map(({ to, label, icon: Icon, badgeKey }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `ph-nav-link${isActive ? " active" : ""}`}
              title={label}
            >
              <span className="ph-nav-icon">
                <Icon aria-hidden />
              </span>
              <span className="ph-nav-label">{label}</span>
              {badgeKey === "ai" && aiPending > 0 && (
                <span className="ph-nav-badge">{aiPending > 99 ? "99+" : aiPending}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <footer className="ph-sidebar-foot ph-sidebar-foot-slim">
          <div className="ph-foot-actions">
            <button type="button" onClick={() => setMini((m) => !m)} aria-label={mini ? "Expand" : "Collapse"}>
              {mini ? <HiOutlineChevronRight /> : <HiOutlineChevronLeft />}
            </button>
            <button type="button" onClick={logout} aria-label="Sign out">
              <HiOutlineArrowRightOnRectangle />
            </button>
          </div>
        </footer>
      </aside>

      <div className="ph-main">
        <header className="ph-topbar">
          <button type="button" className="ph-menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <HiOutlineBars3 />
          </button>
          <div className="ph-topbar-titles">
            <h1>{meta.title}</h1>
            {meta.desc && <p>{meta.desc}</p>}
          </div>
          {headerActions && <div className="ph-topbar-actions">{headerActions}</div>}
        </header>
        <main className="ph-content">{children}</main>
      </div>
    </div>
  );
}
