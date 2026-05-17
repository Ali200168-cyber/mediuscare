import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlineHeart,
  HiOutlineInbox,
  HiOutlineCalendar,
  HiOutlineSparkles,
  HiOutlineBellAlert,
  HiOutlineArrowTrendingUp,
} from "react-icons/hi2";
import DoctorLayout from "./DoctorLayout";
import { DrButton, DrBadge, DrEmpty, doctorFetch } from "../../components/doctor/DoctorUI";
import "../../styles/Doctor/doctor-pages.css";

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const statusTone = (s = "") => {
  const v = String(s).toLowerCase();
  if (v === "approved" || v === "accepted" || v === "completed") return "success";
  if (v === "pending") return "warning";
  if (v === "cancelled" || v === "rejected") return "danger";
  return "neutral";
};

export default function DoctorDashboard() {
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [monitoring, setMonitoring] = useState([]);
  const [pendingAi, setPendingAi] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [aRes, pRes, mRes, aiRes, inboxRes] = await Promise.all([
        doctorFetch("/api/doctor/appointments").then((r) => r.json()),
        doctorFetch("/api/v1/doctor/assigned-patients").then((r) => r.json()),
        doctorFetch("/api/doctor/monitoring/overview").then((r) => r.json()),
        doctorFetch("/api/ai/doctor/pending-count").then((r) => r.json()),
        doctorFetch("/api/doctor/assignment-requests").then((r) => r.json()).catch(() => ({ success: false })),
      ]);
      if (aRes.success) {
        const order = { pending: 0, approved: 1, rescheduled: 2, cancelled: 3 };
        setAppointments(
          (aRes.appointments || []).sort((x, y) => (order[x.status] ?? 9) - (order[y.status] ?? 9)),
        );
      }
      if (pRes.success) setPatients(pRes.patients || []);
      if (mRes.success) setMonitoring(mRes.items || []);
      if (aiRes.success) setPendingAi(aiRes.pendingCount || 0);
      if (inboxRes.success) {
        const pending = (inboxRes.requests || inboxRes.items || []).filter(
          (r) => String(r.status).toLowerCase() === "pending",
        );
        setInboxCount(pending.length);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const todayVisits = useMemo(
    () =>
      appointments.filter((a) => {
        const d = new Date(a.date).toDateString();
        return d === new Date().toDateString();
      }),
    [appointments],
  );

  const priorityPatients = useMemo(() => {
    return [...monitoring]
      .filter((i) => ["critical", "warning"].includes(String(i.status).toLowerCase()))
      .sort((a, b) => {
        const score = (s) => (s === "critical" ? 2 : 1);
        return score(String(b.status).toLowerCase()) - score(String(a.status).toLowerCase());
      })
      .slice(0, 5);
  }, [monitoring]);

  const pendingAppts = appointments.filter((a) => a.status === "pending").length;

  const shortcuts = [
    { to: "/doctor/patient-monitoring", label: "Patients", icon: HiOutlineHeart, tone: "rose" },
    { to: "/doctor/assignment-requests", label: "Inbox", icon: HiOutlineInbox, tone: "amber", count: inboxCount },
    { to: "/doctor/requests", label: "Schedule", icon: HiOutlineCalendar, tone: "sky" },
    { to: "/doctor/ai-review", label: "AI Review", icon: HiOutlineSparkles, tone: "violet", count: pendingAi },
  ];

  return (
    <DoctorLayout headerActions={<DrButton variant="secondary" size="sm" onClick={load}>Refresh</DrButton>}>
      <div className="dh-page">
        <header className="dh-hero">
          <div>
            <p className="dh-hero-kicker">{greeting()}</p>
            <h2 className="dh-hero-title">Your practice command center</h2>
            <p className="dh-hero-sub">
              {loading
                ? "Loading workspace…"
                : `${patients.length} patients · ${todayVisits.length} visits today · ${priorityPatients.length} need attention`}
            </p>
          </div>
          {pendingAi > 0 && (
            <Link to="/doctor/ai-review" className="dh-hero-cta">
              <HiOutlineSparkles aria-hidden />
              <span>
                <strong>{pendingAi}</strong> AI review{pendingAi > 1 ? "s" : ""} pending
              </span>
            </Link>
          )}
        </header>

        <section className="dh-shortcuts" aria-label="Quick actions">
          {shortcuts.map(({ to, label, icon: Icon, tone, count }) => (
            <Link key={to} to={to} className={`dh-shortcut dh-shortcut-${tone}`}>
              <span className="dh-shortcut-icon">
                <Icon aria-hidden />
              </span>
              <span className="dh-shortcut-label">{label}</span>
              {count > 0 && <span className="dh-shortcut-badge">{count > 99 ? "99+" : count}</span>}
            </Link>
          ))}
        </section>

        <div className="dh-grid">
          <section className="dh-panel dh-panel-focus">
            <div className="dh-panel-head">
              <h3>
                <HiOutlineBellAlert aria-hidden /> Needs attention
              </h3>
              <Link to="/doctor/patient-monitoring">View all</Link>
            </div>
            {loading ? (
              <div className="dh-skel-list">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="dh-skel-row" />
                ))}
              </div>
            ) : priorityPatients.length === 0 ? (
              <DrEmpty title="All stable" message="No critical or warning patients right now." />
            ) : (
              <ul className="dh-priority-list">
                {priorityPatients.map((item) => {
                  const tone = String(item.status).toLowerCase();
                  return (
                    <li key={item.patient._id}>
                      <Link to="/doctor/patient-monitoring" className={`dh-priority-item dh-priority-${tone}`}>
                        <span className="dh-priority-avatar">{(item.patient?.name || "P")[0]}</span>
                        <span className="dh-priority-body">
                          <strong>{item.patient.name}</strong>
                          <small>
                            Glucose {item.latestVitals?.glucose ?? "—"} · BP{" "}
                            {item.latestVitals?.systolic != null
                              ? `${item.latestVitals.systolic}/${item.latestVitals.diastolic}`
                              : "—"}
                          </small>
                        </span>
                        <DrBadge tone={tone === "critical" ? "danger" : "warning"}>{item.status}</DrBadge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="dh-panel">
            <div className="dh-panel-head">
              <h3>
                <HiOutlineCalendar aria-hidden /> Today&apos;s schedule
              </h3>
              <Link to="/doctor/requests">Open schedule</Link>
            </div>
            {loading ? (
              <div className="dh-skel-list">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="dh-skel-row" />
                ))}
              </div>
            ) : todayVisits.length === 0 ? (
              <DrEmpty title="Clear calendar" message="No visits scheduled for today." />
            ) : (
              <ol className="dh-timeline">
                {todayVisits.slice(0, 6).map((a) => (
                  <li key={a._id} className="dh-timeline-item">
                    <time>{a.time}</time>
                    <div>
                      <strong>{a.patient?.name || "Patient"}</strong>
                      <DrBadge tone={statusTone(a.status)}>{a.status}</DrBadge>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {pendingAppts > 0 && (
              <p className="dh-panel-foot">
                <HiOutlineArrowTrendingUp aria-hidden /> {pendingAppts} visit request{pendingAppts > 1 ? "s" : ""} awaiting approval
              </p>
            )}
          </section>

          <section className="dh-panel dh-panel-wide">
            <div className="dh-panel-head">
              <h3>Recent patients</h3>
              <Link to="/doctor/patient-monitoring">Monitor</Link>
            </div>
            {loading ? (
              <div className="dh-chip-row">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="dh-chip dh-chip-skel" />
                ))}
              </div>
            ) : patients.length === 0 ? (
              <DrEmpty title="No patients yet" message="Accept inbox requests to build your panel." />
            ) : (
              <div className="dh-chip-row">
                {patients.slice(0, 12).map((p) => (
                  <Link key={p._id} to="/doctor/patient-monitoring" className="dh-chip">
                    <span>{p.name?.[0] || "P"}</span>
                    {p.name?.split(" ")[0] || "Patient"}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </DoctorLayout>
  );
}
