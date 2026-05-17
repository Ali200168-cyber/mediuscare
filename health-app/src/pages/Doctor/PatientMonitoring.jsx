import { useEffect, useMemo, useRef, useState } from "react";
import {
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineBellAlert,
  HiOutlineHeart,
  HiOutlineChartBar,
  HiOutlineDocumentText,
} from "react-icons/hi2";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import DoctorLayout from "./DoctorLayout";
import { DrButton, DrBadge, DrAlert, DrEmpty, doctorFetch } from "../../components/doctor/DoctorUI";
import "../../styles/Doctor/doctor-pages.css";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warning" },
  { id: "normal", label: "Stable" },
];

const classifyGlucose = (value) => {
  const v = Number(value);
  if (!Number.isFinite(v)) return { label: "—", tone: "muted" };
  if (v < 70) return { label: "Low", tone: "critical" };
  if (v <= 140) return { label: "Normal", tone: "normal" };
  if (v <= 180) return { label: "High", tone: "warning" };
  return { label: "Very high", tone: "critical" };
};

const classifyBp = (systolic, diastolic) => {
  const s = Number(systolic);
  const d = Number(diastolic);
  if (!Number.isFinite(s) || !Number.isFinite(d)) return { label: "—", tone: "muted" };
  if (s >= 180 || d >= 120) return { label: "Crisis", tone: "critical" };
  if (s >= 140 || d >= 90) return { label: "Stage 2", tone: "critical" };
  if (s >= 130 || d >= 80) return { label: "Stage 1", tone: "warning" };
  if (s >= 120 && d < 80) return { label: "Elevated", tone: "warning" };
  return { label: "Normal", tone: "normal" };
};

const statusTone = (s = "") => {
  const v = String(s).toLowerCase();
  if (v === "critical") return "critical";
  if (v === "warning") return "warning";
  return "normal";
};

const badgeTone = (t) => {
  if (t === "critical") return "danger";
  if (t === "warning") return "warning";
  if (t === "normal") return "success";
  return "neutral";
};

export default function PatientMonitoring() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activePatientId, setActivePatientId] = useState("");
  const [detailTab, setDetailTab] = useState("overview");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [entries, setEntries] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [toast, setToast] = useState("");
  const intervalRef = useRef(null);

  const loadOverview = async () => {
    setError("");
    try {
      const res = await doctorFetch("/api/doctor/monitoring/overview");
      const payload = await res.json();
      if (res.status === 401) throw new Error("Session expired. Sign in again.");
      if (!payload.success) throw new Error(payload.message || "Could not load patients.");
      setOverview(payload.items || []);
    } catch (e) {
      setError(e.message || "Could not load patients.");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (patientId) => {
    if (!patientId) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const [entriesRes, alertsRes, notesRes] = await Promise.all([
        doctorFetch(`/api/doctor/monitoring/patient/${patientId}/entries`).then((r) => r.json()),
        doctorFetch(`/api/doctor/monitoring/patient/${patientId}/alerts`).then((r) => r.json()),
        doctorFetch(`/api/doctor/monitoring/patient/${patientId}/notes`).then((r) => r.json()),
      ]);
      if (entriesRes.success) setEntries(entriesRes.entries || []);
      if (alertsRes.success) setAlerts(alertsRes.items || []);
      if (notesRes.success) setNotes(notesRes.items || []);
    } catch (e) {
      setDetailError(e.message || "Could not load patient data.");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadOverview();
    intervalRef.current = setInterval(() => {
      loadOverview();
      if (activePatientId) loadDetail(activePatientId);
    }, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatientId]);

  const selectPatient = (id) => {
    setActivePatientId(id);
    setDetailTab("overview");
    loadDetail(id);
  };

  const selected = useMemo(
    () => overview.find((x) => String(x.patient?._id) === String(activePatientId)) || null,
    [overview, activePatientId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...overview]
      .filter((item) => {
        if (!q) return true;
        const name = String(item.patient?.name || "").toLowerCase();
        return name.includes(q) || String(item.patient?._id || "").toLowerCase().includes(q);
      })
      .filter((item) => statusFilter === "all" || String(item.status).toLowerCase() === statusFilter)
      .sort((a, b) => {
        const score = (s) => (s === "critical" ? 3 : s === "warning" ? 2 : 1);
        const diff = score(String(b.status).toLowerCase()) - score(String(a.status).toLowerCase());
        if (diff) return diff;
        return new Date(b.lastUpdated || 0) - new Date(a.lastUpdated || 0);
      });
  }, [overview, query, statusFilter]);

  const summary = useMemo(() => {
    const critical = overview.filter((i) => String(i.status).toLowerCase() === "critical").length;
    const warning = overview.filter((i) => String(i.status).toLowerCase() === "warning").length;
    const alerts = overview.reduce((a, i) => a + Number(i.alerts?.activeCount || 0), 0);
    return { total: overview.length, critical, warning, alerts };
  }, [overview]);

  const trendData = useMemo(() => {
    return [...entries].reverse().map((e, idx) => ({
      idx: idx + 1,
      date: new Date(e.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      glucose: e.glucose ?? null,
      systolic: e.systolic ?? null,
      diastolic: e.diastolic ?? null,
    }));
  }, [entries]);

  const latest = entries[0];
  const glucoseInfo = classifyGlucose(latest?.glucose ?? selected?.latestVitals?.glucose);
  const bpInfo = classifyBp(latest?.systolic ?? selected?.latestVitals?.systolic, latest?.diastolic ?? selected?.latestVitals?.diastolic);

  const addNote = async () => {
    const content = noteDraft.trim();
    if (!content || !activePatientId) return;
    setSavingNote(true);
    setToast("");
    const payload = await doctorFetch(`/api/doctor/monitoring/patient/${activePatientId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content }),
    }).then((r) => r.json());
    setSavingNote(false);
    if (!payload.success) {
      setToast(payload.message || "Save failed");
      return;
    }
    setNoteDraft("");
    setNotes((p) => [payload.item, ...p]);
    setToast("Note saved");
    setTimeout(() => setToast(""), 2500);
  };

  const detailTabs = [
    { id: "overview", label: "Overview", icon: HiOutlineHeart },
    { id: "charts", label: "Trends", icon: HiOutlineChartBar },
    { id: "notes", label: "Notes", icon: HiOutlineDocumentText },
  ];

  return (
    <DoctorLayout headerActions={<DrButton size="sm" variant="secondary" onClick={loadOverview}>Refresh</DrButton>}>
      <div className="md-page dpt-page">
        {error && <DrAlert tone="error">{error}</DrAlert>}

        <section className="dpt-summary">
          <article className="dpt-summary-card">
            <span>Total</span>
            <strong>{loading ? "—" : summary.total}</strong>
          </article>
          <article className="dpt-summary-card dpt-summary-critical">
            <span>Critical</span>
            <strong>{loading ? "—" : summary.critical}</strong>
          </article>
          <article className="dpt-summary-card dpt-summary-warning">
            <span>Warning</span>
            <strong>{loading ? "—" : summary.warning}</strong>
          </article>
          <article className="dpt-summary-card dpt-summary-alerts">
            <span>Active alerts</span>
            <strong>{loading ? "—" : summary.alerts}</strong>
          </article>
        </section>

        <section className="dpt-toolbar">
          <label className="dpt-search">
            <HiOutlineMagnifyingGlass aria-hidden />
            <input
              type="search"
              placeholder="Search by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="dpt-filters" role="tablist" aria-label="Status filter">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={statusFilter === f.id}
                className={`dpt-filter-chip${statusFilter === f.id ? " active" : ""}`}
                onClick={() => setStatusFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </section>

        <section className="dpt-workspace">
          <aside className="dpt-list-panel">
            <header className="dpt-list-head">
              <h2>Patient list</h2>
              <span>{filtered.length}</span>
            </header>
            <div className="dpt-list-scroll">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <div key={i} className="dpt-list-skel" />)
              ) : filtered.length === 0 ? (
                <DrEmpty title="No matches" message="Try another filter or search." />
              ) : (
                filtered.map((item) => {
                  const tone = statusTone(item.status);
                  const active = String(activePatientId) === String(item.patient._id);
                  return (
                    <button
                      key={item.patient._id}
                      type="button"
                      className={`dpt-list-item${active ? " active" : ""} dpt-tone-${tone}`}
                      onClick={() => selectPatient(item.patient._id)}
                    >
                      <span className="dpt-list-avatar">{(item.patient?.name || "P")[0]}</span>
                      <span className="dpt-list-body">
                        <span className="dpt-list-name">{item.patient.name}</span>
                        <span className="dpt-list-meta">
                          G {item.latestVitals?.glucose ?? "—"} · BP{" "}
                          {item.latestVitals?.systolic != null
                            ? `${item.latestVitals.systolic}/${item.latestVitals.diastolic}`
                            : "—"}
                        </span>
                      </span>
                      <span className="dpt-list-end">
                        <DrBadge tone={badgeTone(tone)}>{item.status}</DrBadge>
                        {item.alerts?.activeCount > 0 && (
                          <span className="dpt-alert-dot" title="Active alerts">
                            <HiOutlineBellAlert />
                            {item.alerts.activeCount}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="dpt-detail-panel">
            {!selected ? (
              <div className="dpt-detail-empty">
                <div className="dpt-detail-empty-icon" aria-hidden>
                  <HiOutlineHeart />
                </div>
                <h3>Select a patient</h3>
                <p>Choose someone from the list to view vitals, trends, and notes.</p>
              </div>
            ) : (
              <>
                <header className="dpt-detail-header">
                  <div className="dpt-detail-identity">
                    <span className="dpt-detail-avatar">{(selected.patient?.name || "P")[0]}</span>
                    <div>
                      <h2>{selected.patient.name}</h2>
                      <p>
                        <DrBadge tone={badgeTone(statusTone(selected.status))}>{selected.status}</DrBadge>
                        <span className="dpt-detail-id">#{String(selected.patient._id).slice(-8)}</span>
                      </p>
                    </div>
                  </div>
                  <button type="button" className="dpt-close-btn" onClick={() => setActivePatientId("")} aria-label="Clear selection">
                    <HiOutlineXMark />
                  </button>
                </header>

                <nav className="dpt-detail-tabs" role="tablist">
                  {detailTabs.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={detailTab === id}
                      className={`dpt-detail-tab${detailTab === id ? " active" : ""}`}
                      onClick={() => setDetailTab(id)}
                    >
                      <Icon aria-hidden />
                      {label}
                    </button>
                  ))}
                </nav>

                {detailError && <DrAlert tone="error">{detailError}</DrAlert>}
                {toast && <div className="dpt-toast">{toast}</div>}

                {detailLoading && detailTab !== "overview" ? (
                  <div className="dpt-loading">Loading…</div>
                ) : (
                  <>
                    {detailTab === "overview" && (
                      <div className="dpt-tab-content">
                        <div className="dpt-vital-strip">
                          <article className={`dpt-vital-card dpt-vital-${glucoseInfo.tone}`}>
                            <span>Glucose</span>
                            <strong>{selected.latestVitals?.glucose ?? "—"}</strong>
                            <em>{glucoseInfo.label}</em>
                          </article>
                          <article className={`dpt-vital-card dpt-vital-${bpInfo.tone}`}>
                            <span>Blood pressure</span>
                            <strong>
                              {selected.latestVitals?.systolic != null
                                ? `${selected.latestVitals.systolic}/${selected.latestVitals.diastolic}`
                                : "—"}
                            </strong>
                            <em>{bpInfo.label}</em>
                          </article>
                          <article className="dpt-vital-card">
                            <span>Weight</span>
                            <strong>{selected.latestVitals?.weight ?? "—"}</strong>
                            <em>kg</em>
                          </article>
                          <article className="dpt-vital-card">
                            <span>Alerts</span>
                            <strong>{alerts.length}</strong>
                            <em>active</em>
                          </article>
                        </div>

                        {alerts.length > 0 && (
                          <section className="dpt-block">
                            <h3>Active alerts</h3>
                            <ul className="dpt-alert-list">
                              {alerts.slice(0, 5).map((a) => (
                                <li key={a._id}>
                                  <DrBadge tone={String(a.severity).toLowerCase() === "high" ? "danger" : "warning"}>
                                    {a.severity || "Alert"}
                                  </DrBadge>
                                  <span>{a.message || a.type || "Clinical alert"}</span>
                                </li>
                              ))}
                            </ul>
                          </section>
                        )}

                        <section className="dpt-block">
                          <h3>Last updated</h3>
                          <p className="dpt-muted">
                            {selected.lastUpdated
                              ? new Date(selected.lastUpdated).toLocaleString()
                              : "No recent data"}
                          </p>
                        </section>
                      </div>
                    )}

                    {detailTab === "charts" && (
                      <div className="dpt-tab-content">
                        {entries.length === 0 ? (
                          <DrEmpty title="No vitals history" />
                        ) : (
                          <div className="dpt-charts">
                            <article className="dpt-chart-card">
                              <h3>Glucose</h3>
                              <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={trendData}>
                                  <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} width={36} />
                                  <Tooltip />
                                  <ReferenceArea y1={70} y2={140} fill="rgba(16,185,129,0.08)" strokeOpacity={0} />
                                  <ReferenceArea y1={140} y2={180} fill="rgba(245,158,11,0.08)" strokeOpacity={0} />
                                  <Line type="monotone" dataKey="glucose" stroke="#0284c7" strokeWidth={2.5} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </article>
                            <article className="dpt-chart-card">
                              <h3>Blood pressure</h3>
                              <ResponsiveContainer width="100%" height={240}>
                                <LineChart data={trendData}>
                                  <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                                  <YAxis tick={{ fontSize: 10 }} width={36} />
                                  <Tooltip />
                                  <Line type="monotone" dataKey="systolic" stroke="#059669" strokeWidth={2} dot={false} />
                                  <Line type="monotone" dataKey="diastolic" stroke="#d97706" strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </article>
                          </div>
                        )}
                      </div>
                    )}

                    {detailTab === "notes" && (
                      <div className="dpt-tab-content">
                        <div className="dpt-note-compose">
                          <textarea
                            className="dr-input"
                            rows={3}
                            placeholder="Add a clinical note…"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                          />
                          <DrButton size="sm" onClick={addNote} disabled={savingNote}>
                            {savingNote ? "Saving…" : "Save note"}
                          </DrButton>
                        </div>
                        {notes.length === 0 ? (
                          <DrEmpty title="No notes yet" />
                        ) : (
                          <ul className="dpt-note-list">
                            {notes.map((n) => (
                              <li key={n._id}>
                                <time>{new Date(n.createdAt).toLocaleString()}</time>
                                <p>{n.content}</p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </main>
        </section>
      </div>
    </DoctorLayout>
  );
}
