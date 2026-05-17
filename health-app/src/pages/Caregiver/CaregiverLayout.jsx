import { NavLink, useNavigate } from "react-router-dom";
import {
  HiOutlineHome,
  HiOutlineUserGroup,
  HiOutlineBellAlert,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineDocumentText,
  HiOutlineArrowRightOnRectangle,
} from "react-icons/hi2";
import "../../styles/Caregiver/caregiver-system.css";
import "../../styles/Caregiver/CaregiverLayout.css";
import "../../styles/Caregiver/caregiver-pages.css";

const NAV = [
  { to: "/caregiver/dashboard", label: "Home", icon: HiOutlineHome },
  { to: "/caregiver/patients", label: "My Patients", icon: HiOutlineUserGroup },
  { to: "/caregiver/alerts", label: "Alerts", icon: HiOutlineBellAlert },
  { to: "/caregiver/consultation", label: "Consultation", icon: HiOutlineCalendarDays },
  { to: "/caregiver/chat", label: "Doctor Chat", icon: HiOutlineChatBubbleLeftRight },
  { to: "/caregiver/feedback", label: "Feedback", icon: HiOutlineDocumentText },
];

export default function CaregiverLayout({ children }) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    navigate("/login");
  };

  return (
    <div className="cg-app cgLayout">
      <aside className="cg-sidebar">
        <div className="cg-brand">
          <span className="cg-brand-mark">M</span>
          <div className="cg-brand-text">
            <strong>MediusCare</strong>
            <span>Caregiver Hub</span>
          </div>
        </div>
        <p className="cg-sidebar-tag">Supporting your loved ones with clarity, care, and connection.</p>
        <nav className="cg-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `cg-nav-link${isActive ? " is-active" : ""}`}
              >
                <Icon />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="cg-sidebar-foot">
          <button type="button" className="cg-logout" onClick={logout}>
            <HiOutlineArrowRightOnRectangle />
            Sign out
          </button>
        </div>
      </aside>
      <main className="cg-main">{children}</main>
    </div>
  );
}
