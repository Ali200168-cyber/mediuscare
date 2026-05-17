import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  HiOutlineHome,
  HiOutlineHeart,
  HiOutlineSparkles,
  HiOutlineCalendar,
  HiOutlineDocumentText,
  HiOutlineBell,
  HiOutlineUserGroup,
  HiOutlineClipboardDocumentList,
  HiOutlineChatBubbleLeftRight,
  HiOutlineUserPlus,
  HiOutlineBars3,
  HiOutlineChevronDoubleLeft,
  HiOutlineChevronDoubleRight,
  HiOutlineArrowRightOnRectangle,
} from "react-icons/hi2";
import "../../styles/Patient/patient-system.css";
import { patientFetch } from "../../components/patient/patientApi";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ to: "/patient/dashboard", label: "Home", icon: HiOutlineHome }],
  },
  {
    label: "Health",
    items: [
      { to: "/patient/health-entry", label: "Log vitals", icon: HiOutlineHeart },
      { to: "/patient/ai-predictions", label: "AI insights", icon: HiOutlineSparkles },
      { to: "/patient/reports", label: "Reports", icon: HiOutlineDocumentText },
    ],
  },
  {
    label: "Care",
    items: [
      { to: "/patient/consultation", label: "Visits", icon: HiOutlineCalendar },
      { to: "/patient/chat", label: "Messages", icon: HiOutlineChatBubbleLeftRight },
      { to: "/patient/alerts", label: "Alerts", icon: HiOutlineBell },
    ],
  },
  {
    label: "Team",
    items: [
      { to: "/patient/doctor-request", label: "Find doctor", icon: HiOutlineUserPlus },
      { to: "/patient/doctor-updates", label: "Updates", icon: HiOutlineClipboardDocumentList, badgeKey: "updates" },
      { to: "/patient/caregiver-requests", label: "Caregivers", icon: HiOutlineUserGroup },
    ],
  },
];

const MOBILE_NAV = [
  { to: "/patient/dashboard", label: "Home", icon: HiOutlineHome },
  { to: "/patient/health-entry", label: "Log", icon: HiOutlineHeart },
  { to: "/patient/ai-predictions", label: "AI", icon: HiOutlineSparkles },
  { to: "/patient/alerts", label: "Alerts", icon: HiOutlineBell },
  { to: "/patient/chat", label: "Chat", icon: HiOutlineChatBubbleLeftRight },
];

const PatientLayout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("pt_sidebar_collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [updatesUnread, setUpdatesUnread] = useState(0);

  useEffect(() => {
    localStorage.setItem("pt_sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === "/patient/doctor-updates") {
      localStorage.setItem("doctor_updates_last_seen_at", new Date().toISOString());
      setUpdatesUnread(0);
    }
  }, [location.pathname]);

  useEffect(() => {
    const loadUnread = async () => {
      try {
        const [fbRes, aiRes] = await Promise.all([
          patientFetch("/api/doctor/my-feedback?limit=100").then((r) => r.json()),
          patientFetch("/api/ai/history?limit=100&page=1").then((r) => r.json()),
        ]);
        if (!fbRes.success || !aiRes.success) return;
        const lastSeen = new Date(localStorage.getItem("doctor_updates_last_seen_at") || 0).getTime();
        const fb = (fbRes.items || []).filter((i) => new Date(i.createdAt).getTime() > lastSeen).length;
        const ai = (aiRes.items || []).filter((i) => {
          const d = String(i.reviewStatus || "").toLowerCase();
          if (!["approved", "rejected", "modified"].includes(d)) return false;
          return new Date(i.reviewedAt || i.createdAt).getTime() > lastSeen;
        }).length;
        if (location.pathname !== "/patient/doctor-updates") setUpdatesUnread(fb + ai);
      } catch {
        setUpdatesUnread(0);
      }
    };
    loadUnread();
    const t = setInterval(loadUnread, 20000);
    return () => clearInterval(t);
  }, [location.pathname]);

  const logout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    try {
      await patientFetch("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    navigate("/login");
  };

  const shellClass = [
    "patient-app",
    collapsed ? "sidebar-collapsed" : "",
    mobileOpen ? "mobile-nav-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <div className="pt-overlay" onClick={() => setMobileOpen(false)} aria-hidden />
      <aside className="pt-sidebar" aria-label="Patient navigation">
        <div className="pt-sidebar-brand">
          <div className="pt-brand-mark" aria-hidden>♥</div>
          <div className="pt-brand-text">
            <strong>MediusCare</strong>
            <span>Patient</span>
          </div>
        </div>

        <nav className="pt-nav-scroll">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="pt-nav-group">
              <div className="pt-nav-label">{group.label}</div>
              {group.items.map(({ to, label, icon: Icon, badgeKey }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `pt-nav-link${isActive ? " active" : ""}`}
                >
                  <Icon aria-hidden />
                  <span>{label}</span>
                  {badgeKey === "updates" && updatesUnread > 0 && (
                    <span className="pt-nav-badge">{updatesUnread > 99 ? "99+" : updatesUnread}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="pt-sidebar-foot">
          <button
            type="button"
            className="pt-sidebar-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <HiOutlineChevronDoubleRight /> : <HiOutlineChevronDoubleLeft />}
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
          <button type="button" className="pt-logout-btn" onClick={logout}>
            <HiOutlineArrowRightOnRectangle aria-hidden />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="pt-main-wrap">
        <header className="pt-topbar">
          <button type="button" className="pt-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <HiOutlineBars3 />
          </button>
          <strong>MediusCare</strong>
          <span />
        </header>
        <main className="pt-content">{children}</main>
      </div>

      <nav className="pt-bottom-nav" aria-label="Quick navigation">
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `pt-bottom-link${isActive ? " active" : ""}`}>
            <Icon aria-hidden />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default PatientLayout;
