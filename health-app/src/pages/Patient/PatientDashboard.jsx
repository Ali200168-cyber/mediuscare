import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PatientLayout from "./PatientLayout";
import {
  PtPageHeader,
  PtCard,
  PtBadge,
  PtButton,
  PtEmpty,
  PtSkeletonGrid,
  patientFetch,
} from "../../components/patient/PatientUI";
import {
  HiOutlineBell,
  HiOutlineCalendar,
  HiOutlineChatBubbleLeftRight,
  HiOutlineHeart,
  HiOutlinePlus,
  HiOutlineSparkles,
  HiOutlineBeaker,
} from "react-icons/hi2";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "../../styles/Patient/patient-pages.css";

const glucoseTone = (v) => {
  if (v == null) return { label: "—", tone: "neutral" };
  if (v < 70) return { label: "Low", tone: "info" };
  if (v <= 140) return { label: "Normal", tone: "success" };
  if (v <= 180) return { label: "Elevated", tone: "warning" };
  return { label: "High", tone: "danger" };
};

const bpTone = (s, d) => {
  if (!s || !d) return { label: "—", tone: "neutral" };
  if (s < 120 && d < 80) return { label: "Normal", tone: "success" };
  if (s < 130 && d < 80) return { label: "Elevated", tone: "warning" };
  if (s < 140 || d < 90) return { label: "Stage 1", tone: "warning" };
  return { label: "Stage 2", tone: "danger" };
};

export default function PatientDashboard() {
  const [latest, setLatest] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [doctor, setDoctor] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const [aiTip, setAiTip] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [r1, r2, r3, r4, r5] = await Promise.all([
          patientFetch("/api/health/latest").then((r) => r.json()),
          patientFetch("/api/health/recent?limit=12").then((r) => r.json()),
          patientFetch("/api/v1/patient/assigned-doctor").then((r) => r.json()),
          patientFetch("/api/consultation/patient").then((r) => r.json()),
          patientFetch("/api/v1/alerts?status=active").then((r) => r.json()).catch(() => ({ success: false })),
        ]);
        if (r1.success) setLatest(r1.entry);
        if (r2.success) setRecent(r2.entries || []);
        if (r3.success) setDoctor(r3.doctor);
        if (r4.success) setAppointments(r4.items || []);
        if (r5.success) setAlertCount((r5.alerts || r5.items || []).length);

        try {
          const aiRes = await patientFetch("/api/ai/simulate-from-health", { method: "POST" }).then((r) => r.json());
          if (aiRes.success && aiRes.output?.[0]) {
            const mod = aiRes.output[0];
            const risk = mod.risk_level || mod.prediction?.risk_level;
            setAiTip(risk ? `AI risk: ${risk}` : "AI insights updated");
          }
        } catch {
          /* optional */
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshKey]);

  const g = glucoseTone(latest?.glucose);
  const bp = bpTone(latest?.systolic, latest?.diastolic);

  const chartData = useMemo(() => {
    return [...recent]
      .reverse()
      .filter((e) => e.glucose != null)
      .map((e) => ({
        date: new Date(e.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        glucose: e.glucose,
      }));
  }, [recent]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return appointments
      .filter((a) => {
        const when = new Date(`${a.date}T${a.time || "00:00"}`).getTime();
        return when >= now - 86400000 && String(a.status).toLowerCase() !== "cancelled";
      })
      .slice(0, 2);
  }, [appointments]);

  const meds = latest?.medicationHistory?.slice(0, 2) || [];
  const insights = [];
  if (latest) {
    if (latest.glucose > 200) insights.push({ tone: "danger", text: "High glucose" });
    if (latest.systolic >= 140) insights.push({ tone: "danger", text: "High BP" });
    if (latest.glucose < 70) insights.push({ tone: "warning", text: "Low glucose" });
    if (!insights.length) insights.push({ tone: "success", text: "Vitals stable" });
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <PatientLayout>
      <div className="pt-home-dashboard pt-fade-in">
        <PtPageHeader
          title={greeting()}
          subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          actions={
            <PtButton variant="secondary" size="sm" onClick={() => setRefreshKey((k) => k + 1)}>
              Refresh
            </PtButton>
          }
        />

        <div className="pt-quick-actions">
          <Link to="/patient/health-entry" className="pt-quick-action">
            <span className="pt-quick-action-icon"><HiOutlinePlus /></span>
            <span>Log vitals</span>
          </Link>
          <Link to="/patient/ai-predictions" className="pt-quick-action">
            <span className="pt-quick-action-icon"><HiOutlineSparkles /></span>
            <span>AI insights</span>
          </Link>
          <Link to="/patient/alerts" className="pt-quick-action">
            <span className="pt-quick-action-icon"><HiOutlineBell /></span>
            <span>Alerts{alertCount > 0 ? ` (${alertCount})` : ""}</span>
          </Link>
          <Link to="/patient/chat" className="pt-quick-action">
            <span className="pt-quick-action-icon"><HiOutlineChatBubbleLeftRight /></span>
            <span>Messages</span>
          </Link>
        </div>

        {doctor && (
          <div className="pt-doctor-pill">
            <div className="pt-doctor-avatar">{doctor.name?.[0] || "D"}</div>
            <div>
              <strong>{doctor.name}</strong>
              <small>{doctor.specialization || "Your doctor"}</small>
            </div>
          </div>
        )}

        {loading ? (
          <PtSkeletonGrid count={6} />
        ) : (
          <>
            {insights.length > 0 && (
              <div className="pt-home-status-strip">
                {insights.map((i) => (
                  <PtBadge key={i.text} tone={i.tone}>{i.text}</PtBadge>
                ))}
              </div>
            )}

            <div className="pt-grid pt-grid-4 pt-section">
              <PtCard title="Glucose" value={latest?.glucose ?? "—"} unit="mg/dL" badge={<PtBadge tone={g.tone}>{g.label}</PtBadge>} />
              <PtCard
                title="Blood pressure"
                value={latest?.systolic ? `${latest.systolic}/${latest.diastolic}` : "—"}
                unit="mmHg"
                badge={<PtBadge tone={bp.tone}>{bp.label}</PtBadge>}
              />
              <PtCard title="Weight" value={latest?.weight ?? "—"} unit="kg" />
              <PtCard title="Symptoms" flat>
                <div className="pt-home-symptom-chips">
                  {latest?.symptoms?.length
                    ? latest.symptoms.slice(0, 4).map((s) => <PtBadge key={s} tone="neutral">{s}</PtBadge>)
                    : <span className="pt-muted-text">None logged</span>}
                </div>
              </PtCard>
            </div>

            <section className="pt-home-widgets">
              <article className="pt-home-widget">
                <header>
                  <HiOutlineCalendar aria-hidden />
                  <h3>Appointments</h3>
                </header>
                {upcoming.length === 0 ? (
                  <p className="pt-muted-text">No upcoming visits</p>
                ) : (
                  <ul className="pt-home-widget-list">
                    {upcoming.map((a) => (
                      <li key={a._id}>
                        <strong>{a.date}</strong>
                        <span>{a.time} · {a.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/patient/consultation" className="pt-home-widget-link">Manage</Link>
              </article>

              <article className="pt-home-widget">
                <header>
                  <HiOutlineBell aria-hidden />
                  <h3>Alerts</h3>
                </header>
                <p className="pt-home-widget-stat">{alertCount}</p>
                <span className="pt-muted-text">active notifications</span>
                <Link to="/patient/alerts" className="pt-home-widget-link">View all</Link>
              </article>

              <article className="pt-home-widget pt-home-widget--ai">
                <header>
                  <HiOutlineSparkles aria-hidden />
                  <h3>AI recommendation</h3>
                </header>
                <p>{aiTip || "Run AI insights after logging vitals."}</p>
                <Link to="/patient/ai-predictions" className="pt-home-widget-link">Open insights</Link>
              </article>

              <article className="pt-home-widget">
                <header>
                  <HiOutlineBeaker aria-hidden />
                  <h3>Medications</h3>
                </header>
                {meds.length === 0 ? (
                  <p className="pt-muted-text">No meds on latest log</p>
                ) : (
                  <ul className="pt-home-widget-list">
                    {meds.map((m, i) => (
                      <li key={i}>{typeof m === "string" ? m : m.name || m.medication || "Medication"}</li>
                    ))}
                  </ul>
                )}
              </article>
            </section>

            {chartData.length >= 2 && (
              <section className="pt-home-chart-section">
                <h2 className="pt-section-title">Glucose trend</h2>
                <div className="pt-home-chart-card">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="ptHomeGlucose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0d9488" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--pt-border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip />
                      <Area type="monotone" dataKey="glucose" stroke="#0d9488" strokeWidth={2} fill="url(#ptHomeGlucose)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>
            )}

            <section className="pt-section">
              <div className="pt-section-head">
                <h2 className="pt-section-title">
                  <HiOutlineHeart aria-hidden /> Recent activity
                </h2>
                <Link to="/patient/health-entry" className="pt-home-widget-link">Log vitals</Link>
              </div>
              <div className="pt-card pt-card-flat pt-home-activity">
                {recent.length === 0 ? (
                  <PtEmpty icon="📊" title="No entries yet" message="Log your first vitals to see trends." />
                ) : (
                  <ul className="pt-home-timeline">
                    {recent.slice(0, 6).map((e) => (
                      <li key={e._id} className="pt-home-timeline-item">
                        <span className="pt-home-timeline-dot" aria-hidden />
                        <div>
                          <strong>{e.glucose ?? "—"} mg/dL</strong>
                          {e.systolic && <span> · {e.systolic}/{e.diastolic} mmHg</span>}
                          <time>{new Date(e.createdAt).toLocaleString()}</time>
                        </div>
                        {e.symptoms?.[0] && <PtBadge tone="neutral">{e.symptoms[0]}</PtBadge>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {!doctor && (
              <PtCard flat className="pt-section">
                <p className="pt-card-title">Care team</p>
                <p className="pt-muted-text">No doctor assigned yet.</p>
                <PtButton to="/patient/doctor-request" size="sm">Find a doctor</PtButton>
              </PtCard>
            )}
          </>
        )}
      </div>
    </PatientLayout>
  );
};
