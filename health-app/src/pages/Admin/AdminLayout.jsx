import { useNavigate } from "react-router-dom";
import {
  HiOutlineSquares2X2,
  HiOutlineWrenchScrewdriver,
  HiOutlineUsers,
  HiOutlineClipboardDocumentList,
  HiOutlineShieldCheck,
  HiOutlineArrowRightOnRectangle,
} from "react-icons/hi2";
import "../../styles/Admin/admin-system.css";
import "../../styles/Admin/AdminLayout.css";
import "../../styles/Admin/admin-pages.css";

const NAV = [
  { href: "#overview", label: "Overview", icon: HiOutlineSquares2X2 },
  { href: "#operations", label: "Operations", icon: HiOutlineWrenchScrewdriver },
  { href: "#users", label: "Users", icon: HiOutlineUsers },
  { href: "#activity", label: "Consultations", icon: HiOutlineClipboardDocumentList },
  { href: "#audit", label: "Audit logs", icon: HiOutlineShieldCheck },
];

export default function AdminLayout({ children, onSignOut }) {
  const navigate = useNavigate();

  const logout = async () => {
    if (onSignOut) {
      await onSignOut();
    } else {
      const refreshToken = localStorage.getItem("refreshToken");
      try {
        await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:5000"}/api/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {}
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("role");
      navigate("/login");
    }
  };

  const scrollTo = (href) => {
    const id = href.replace("#", "");
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="ad-app ad-layout">
      <aside className="ad-sidebar">
        <div className="ad-brand">
          <span className="ad-brand-mark">M</span>
          <div className="ad-brand-text">
            <strong>MediusCare</strong>
            <span>Control Center</span>
          </div>
        </div>
        <p className="ad-sidebar-tag">Platform administration — users, assignments, verifications, and audit.</p>
        <nav className="ad-nav" aria-label="Admin sections">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                type="button"
                className="ad-nav-link"
                onClick={() => scrollTo(item.href)}
              >
                <Icon aria-hidden />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="ad-sidebar-foot">
          <button type="button" className="ad-logout" onClick={logout}>
            <HiOutlineArrowRightOnRectangle aria-hidden />
            Sign out
          </button>
        </div>
      </aside>
      <main className="ad-main">{children}</main>
    </div>
  );
}
