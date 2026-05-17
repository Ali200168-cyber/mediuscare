import { useEffect, useMemo, useState } from "react";
import {
  HiOutlineArrowDownTray,
  HiOutlineCalendarDays,
  HiOutlineChartBar,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineDocumentText,
  HiOutlineFolderOpen,
  HiOutlineHeart,
  HiOutlineHome,
  HiOutlineMagnifyingGlass,
  HiOutlineSparkles,
  HiOutlineTableCells,
  HiOutlineUser,
} from "react-icons/hi2";
import PatientLayout from "./PatientLayout";
import ReportUploadPanel from "../../components/patient/ReportUploadPanel";
import {
  PtPageHeader,
  PtButton,
  PtBadge,
  PtAlert,
  PtSkeletonGrid,
  PtEmpty,
  PtTabs,
  patientFetch,
} from "../../components/patient/PatientUI";
import "../../styles/Patient/patient-pages.css";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const RISK_TONE = { "High Risk": "danger", Warning: "warning", Normal: "success" };
const DATE_PRESETS = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
];
const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "normal", label: "Normal" },
  { id: "incomplete", label: "Incomplete" },
];
const TABS = [
  { id: "overview", label: "Overview", icon: HiOutlineHome },
  { id: "analytics", label: "Analytics", icon: HiOutlineChartBar },
  { id: "files", label: "Documents", icon: HiOutlineFolderOpen },
  { id: "history", label: "History", icon: HiOutlineTableCells },
];

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

const glucoseStatus = (v) => {
  if (v == null) return { label: "—", tone: "neutral", level: "incomplete" };
  if (v < 70) return { label: "Low", tone: "info", level: "critical" };
  if (v <= 140) return { label: "Normal", tone: "success", level: "normal" };
  if (v <= 180) return { label: "Elevated", tone: "warning", level: "critical" };
  return { label: "High", tone: "danger", level: "critical" };
};

const entryLevel = (item) => {
  const g = glucoseStatus(item.glucose);
  if (g.level === "incomplete") return "incomplete";
  if (g.level === "critical") return "critical";
  if (item.systolic >= 140 || item.diastolic >= 90) return "critical";
  return "normal";
};

export default function PatientReport() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [activePreset, setActivePreset] = useState("30d");
  const [activeTab, setActiveTab] = useState("overview");
  const [range, setRange] = useState(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), groupBy: "daily" };
  });

  const loadFiles = async () => {
    try {
      const res = await patientFetch("/api/reports/patient/files").then((r) => r.json());
      if (res.success) setFiles(res.files || []);
    } catch {
      /* optional */
    }
  };

  const loadReports = async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to, groupBy: range.groupBy }).toString();
      const payload = await patientFetch(`/api/reports/patient?${query}`).then((res) => res.json());
      if (!payload.success) throw new Error(payload.message || "Failed to load report");
      setReport(payload.report || null);
    } catch (loadError) {
      setError(loadError.message || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    loadFiles();
  }, [range.from, range.to, range.groupBy]);

  const applyPreset = (preset) => {
    const to = new Date();
    const from = new Date(to.getTime() - (preset.days - 1) * 24 * 60 * 60 * 1000);
    setActivePreset(preset.id);
    setRange((prev) => ({ ...prev, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }));
  };

  const summary = useMemo(() => {
    if (!report?.summary) {
      return { avgGlucose: null, avgBp: "—", highGlucose: null, lowGlucose: null, risk: "Normal", riskTone: "success" };
    }
    const s = report.summary;
    const risk = report.risk?.level || "Normal";
    return {
      avgGlucose: s.averageGlucose,
      avgBp:
        s.averageBloodPressure?.systolic != null
          ? `${s.averageBloodPressure.systolic}/${s.averageBloodPressure.diastolic}`
          : "—",
      highGlucose: s.highest?.glucose,
      lowGlucose: s.lowest?.glucose,
      risk,
      riskTone: RISK_TONE[risk] || "neutral",
    };
  }, [report]);

  const vitalsList = useMemo(() => {
    const rows = Array.isArray(report?.vitalsHistory) ? [...report.vitalsHistory] : [];
    rows.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
    const q = search.trim().toLowerCase();
    return rows.filter((item) => {
      if (statusFilter !== "all" && entryLevel(item) !== statusFilter) return false;
      if (!q) return true;
      const hay = [item.notes, item.glucose, item.systolic, item.diastolic, new Date(item.dateTime).toLocaleString()]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [report?.vitalsHistory, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const rows = report?.vitalsHistory || [];
    return {
      critical: rows.filter((r) => entryLevel(r) === "critical").length,
      normal: rows.filter((r) => entryLevel(r) === "normal").length,
      incomplete: rows.filter((r) => entryLevel(r) === "incomplete").length,
    };
  }, [report?.vitalsHistory]);

  const exportReport = async (format) => {
    try {
      const query = new URLSearchParams({ from: range.from, to: range.to, groupBy: range.groupBy }).toString();
      const path =
        format === "pdf" ? `/api/reports/patient/export.pdf?${query}` : `/api/reports/patient/export.csv?${query}`;
      const res = await patientFetch(path);
      if (!res.ok) throw new Error(`Failed to export ${format.toUpperCase()}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "pdf" ? "mediuscare-report.pdf" : "mediuscare-report.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError.message || `Could not export ${format.toUpperCase()} report.`);
    }
  };

  const chartTooltip = {
    borderRadius: 12,
    border: "1px solid var(--pt-border)",
    boxShadow: "var(--pt-shadow-md)",
    fontSize: 12,
  };

  const insightChartData = useMemo(() => {
    return (report?.aiInsights || []).slice(0, 4).map((text, i) => ({ name: `#${i + 1}`, score: text.length % 40 + 60 }));
  }, [report?.aiInsights]);

  const renderVitalsTable = () => (
    <>
      {!vitalsList.length ? (
        <PtEmpty icon="📊" title="No vitals found" message={search ? "Try a different search or filter." : "Log vitals to populate history."} />
      ) : (
        <>
          <div className="pt-reports-timeline" aria-hidden>
            {vitalsList.slice(0, 10).map((item, i) => (
              <span
                key={item.id}
                className={`pt-reports-timeline-dot tone-${entryLevel(item)}`}
                style={{ left: `${8 + (i / Math.max(vitalsList.length - 1, 1)) * 84}%` }}
              />
            ))}
          </div>
          <div className="pt-reports-table">
            <div className="pt-reports-table-head">
              <span>Date</span>
              <span>Glucose</span>
              <span>BP</span>
              <span>Status</span>
              <span />
            </div>
            {vitalsList.map((item) => {
              const g = glucoseStatus(item.glucose);
              const open = expandedId === item.id;
              return (
                <div key={item.id} className={`pt-reports-row${open ? " is-open" : ""}`}>
                  <button
                    type="button"
                    className="pt-reports-row-main"
                    onClick={() => setExpandedId(open ? null : item.id)}
                    aria-expanded={open}
                  >
                    <span className="pt-reports-row-date">
                      {new Date(item.dateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      <small>{new Date(item.dateTime).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</small>
                    </span>
                    <span className="pt-reports-row-value">{item.glucose ?? "—"}</span>
                    <span className="pt-reports-row-value">
                      {item.systolic != null ? `${item.systolic}/${item.diastolic ?? "—"}` : "—"}
                    </span>
                    <PtBadge tone={g.tone}>{g.label}</PtBadge>
                    <span className="pt-reports-row-chevron" aria-hidden>
                      {open ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                    </span>
                  </button>
                  {open && (
                    <div className="pt-reports-row-detail">
                      <p>{item.notes?.trim() || "No notes for this entry."}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  return (
    <PatientLayout>
      <div className="pt-reports pt-reports-v2 pt-fade-in">
        <PtPageHeader
          title="Reports"
          subtitle="Analytics, documents & clinical history"
          actions={
            <>
              <PtButton variant="secondary" size="sm" onClick={() => exportReport("csv")}>
                <HiOutlineArrowDownTray aria-hidden /> CSV
              </PtButton>
              <PtButton variant="secondary" size="sm" onClick={() => exportReport("pdf")}>
                <HiOutlineArrowDownTray aria-hidden /> PDF
              </PtButton>
              <PtButton variant="primary" size="sm" onClick={loadReports} disabled={loading}>
                Refresh
              </PtButton>
            </>
          }
        />

        {error && <PtAlert tone="error">{error}</PtAlert>}

        <section className="pt-reports-toolbar">
          <div className="pt-reports-presets">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`pt-reports-preset${activePreset === p.id ? " is-active" : ""}`}
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="pt-reports-filters">
            <label className="pt-reports-filter">
              <span>From</span>
              <input className="pt-input" type="date" value={range.from} onChange={(e) => { setActivePreset(""); setRange((p) => ({ ...p, from: e.target.value })); }} />
            </label>
            <label className="pt-reports-filter">
              <span>To</span>
              <input className="pt-input" type="date" value={range.to} onChange={(e) => { setActivePreset(""); setRange((p) => ({ ...p, to: e.target.value })); }} />
            </label>
            <label className="pt-reports-filter">
              <span>View</span>
              <select className="pt-select" value={range.groupBy} onChange={(e) => setRange((p) => ({ ...p, groupBy: e.target.value }))}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="pt-reports-search">
              <HiOutlineMagnifyingGlass aria-hidden />
              <input className="pt-input" type="search" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </div>
        </section>

        <div className="pt-reports-tabs-wrap">
          <PtTabs tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} active={activeTab} onChange={setActiveTab} />
        </div>

        {loading ? (
          <PtSkeletonGrid count={8} />
        ) : !report ? (
          <PtEmpty icon="📄" title="No report data" message="Adjust your date range or log vitals." />
        ) : (
          <>
            <section className="pt-reports-hero">
              <div className="pt-reports-hero-main">
                <span className="pt-reports-hero-label"><HiOutlineDocumentText /> Clinical dashboard</span>
                <h2>{report.patient?.name || "Your health report"}</h2>
                <p>
                  <HiOutlineCalendarDays aria-hidden /> {formatDate(range.from)} – {formatDate(range.to)}
                  <span className="pt-reports-hero-dot">·</span>
                  {vitalsList.length} entries · {files.length} files
                </p>
              </div>
              <div className="pt-reports-hero-risk">
                <span>Risk</span>
                <PtBadge tone={summary.riskTone}>{summary.risk}</PtBadge>
                <div className="pt-reports-status-chips">
                  <PtBadge tone="danger">{statusCounts.critical} critical</PtBadge>
                  <PtBadge tone="success">{statusCounts.normal} normal</PtBadge>
                  <PtBadge tone="neutral">{statusCounts.incomplete} incomplete</PtBadge>
                </div>
              </div>
            </section>

            {activeTab === "overview" && (
              <div className="pt-reports-tab-panel">
                <section className="pt-reports-stats">
                  {[
                    { label: "Avg glucose", value: summary.avgGlucose ?? "—", unit: "mg/dL" },
                    { label: "Avg BP", value: summary.avgBp, unit: "mmHg" },
                    { label: "Peak", value: summary.highGlucose ?? "—", unit: "mg/dL" },
                    { label: "Documents", value: files.length, unit: "uploaded" },
                  ].map((s) => (
                    <article key={s.label} className="pt-reports-stat-card">
                      <span className="pt-reports-stat-label">{s.label}</span>
                      <strong>{s.value}</strong>
                      <small>{s.unit}</small>
                    </article>
                  ))}
                </section>

                <div className="pt-reports-overview-grid">
                  <section className="pt-reports-panel pt-reports-panel--ai">
                    <header><HiOutlineSparkles aria-hidden /><h3>AI highlights</h3></header>
                    <div className="pt-reports-insight-cards">
                      {(report.aiInsights || ["No insights yet."]).slice(0, 3).map((text, i) => (
                        <article key={i} className="pt-reports-insight-card"><p>{text}</p></article>
                      ))}
                    </div>
                  </section>
                  <section className="pt-reports-panel">
                    <header><h3>Recent vitals</h3></header>
                    <ul className="pt-reports-mini-list">
                      {vitalsList.slice(0, 4).map((item) => {
                        const g = glucoseStatus(item.glucose);
                        return (
                          <li key={item.id}>
                            <span>{new Date(item.dateTime).toLocaleDateString()}</span>
                            <strong>{item.glucose ?? "—"} mg/dL</strong>
                            <PtBadge tone={g.tone}>{g.label}</PtBadge>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                </div>
              </div>
            )}

            {activeTab === "analytics" && (
              <div className="pt-reports-tab-panel">
                <section className="pt-reports-charts">
                  <article className="pt-reports-chart-card">
                    <header><h3>Glucose trend</h3><span>{range.groupBy}</span></header>
                    {report.trends?.length ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={report.trends}>
                          <defs>
                            <linearGradient id="ptReportGlucose2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                              <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--pt-border)" vertical={false} />
                          <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                          <Tooltip contentStyle={chartTooltip} />
                          <Area type="monotone" dataKey="glucose" stroke="#0d9488" strokeWidth={2.5} fill="url(#ptReportGlucose2)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="pt-reports-empty">No trend data.</p>
                    )}
                  </article>
                  <article className="pt-reports-chart-card">
                    <header><h3>Blood pressure</h3><span>Sys / Dia</span></header>
                    {report.trends?.length ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <LineChart data={report.trends}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--pt-border)" vertical={false} />
                          <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                          <Tooltip contentStyle={chartTooltip} />
                          <Line type="monotone" dataKey="systolic" stroke="#f97316" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="diastolic" stroke="#14b8a6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="pt-reports-empty">No trend data.</p>
                    )}
                  </article>
                </section>

                {insightChartData.length > 0 && (
                  <article className="pt-reports-chart-card pt-reports-chart-card--wide">
                    <header><h3>Insight focus</h3><span>AI signal strength (demo)</span></header>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={insightChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--pt-border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip contentStyle={chartTooltip} />
                        <Bar dataKey="score" fill="#6366f1" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </article>
                )}

                <div className="pt-reports-panels">
                  <section className="pt-reports-panel">
                    <header><h3>Recommendations</h3></header>
                    <ul className="pt-reports-tip-list">
                      {(report.recommendations || []).slice(0, 4).map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                  </section>
                  <section className="pt-reports-panel">
                    <header><h3>Doctor notes</h3></header>
                    {!report.doctorNotes?.length ? (
                      <p className="pt-reports-empty">No notes in range.</p>
                    ) : (
                      <ul className="pt-reports-note-list">
                        {report.doctorNotes.map((note, idx) => <li key={idx}>{note}</li>)}
                      </ul>
                    )}
                  </section>
                </div>
              </div>
            )}

            {activeTab === "files" && (
              <div className="pt-reports-tab-panel">
                <ReportUploadPanel files={files} onChange={setFiles} onError={setError} />
              </div>
            )}

            {activeTab === "history" && (
              <div className="pt-reports-tab-panel">
                <section className="pt-reports-history">
                  <header className="pt-reports-history-head">
                    <div><h3>Vitals history</h3><span>{vitalsList.length} shown</span></div>
                    <div className="pt-reports-status-filters">
                      {STATUS_FILTERS.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`pt-reports-preset${statusFilter === f.id ? " is-active" : ""}`}
                          onClick={() => setStatusFilter(f.id)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </header>
                  {renderVitalsTable()}
                </section>
              </div>
            )}

            <footer className="pt-reports-footer">
              <p>AI-assisted · MediusCare · Consult your doctor for medical decisions.</p>
            </footer>
          </>
        )}
      </div>
    </PatientLayout>
  );
}
