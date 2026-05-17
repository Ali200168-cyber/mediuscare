import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiOutlineChartBar,
  HiOutlineClock,
  HiOutlineBellAlert,
  HiOutlineHeart,
} from "react-icons/hi2";
import CaregiverLayout from "./CaregiverLayout";
import {
  CaregiverBpChart,
  CaregiverGlucoseChart,
} from "../../components/caregiver/CaregiverPatientCharts";
import {
  CgHero,
  CgCard,
  CgBadge,
  CgButton,
  CgAlert,
  CgEmpty,
  CgLoading,
  CgSectionTitle,
  caregiverFetch,
} from "../../components/caregiver/CaregiverUI";

const formatDate = (d) => (d ? new Date(d).toLocaleString() : "—");

const statusTone = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "critical") return "danger";
  if (v === "warning") return "warning";
  if (v === "normal") return "success";
  return "neutral";
};

const DETAIL_TABS = [
  { id: "overview", label: "Overview", icon: HiOutlineHeart },
  { id: "trends", label: "Trends & graphs", icon: HiOutlineChartBar },
  { id: "history", label: "Full history", icon: HiOutlineClock },
  { id: "alerts", label: "Alerts", icon: HiOutlineBellAlert },
];

export default function CaregiverPatients() {
  const [searchParams] = useSearchParams();
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [overview, setOverview] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");

  const loadPatients = async () => {
    setLoadingList(true);
    setError("");
    try {
      const res = await caregiverFetch("/api/caregiver/patients");
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setPatients(data.patients || []);
    } catch (e) {
      setError(e.message || "Failed to load patients");
      setPatients([]);
    } finally {
      setLoadingList(false);
    }
  };

  const loadOverview = async (patientId) => {
    if (!patientId) return;
    setSelectedId(patientId);
    setDetailTab("overview");
    setLoadingDetail(true);
    setOverview(null);
    try {
      const res = await caregiverFetch(`/api/caregiver/patient/${patientId}/overview`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setOverview(data);
    } catch (e) {
      setError(e.message || "Failed to load health history");
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    const fromUrl = searchParams.get("selected");
    if (fromUrl && patients.length) loadOverview(fromUrl);
  }, [searchParams, patients]);

  const selectedPatient = useMemo(
    () => patients.find((p) => String(p._id) === String(selectedId)),
    [patients, selectedId],
  );

  const latest = overview?.healthSummary?.latestVitals;
  const stats = overview?.healthSummary?.stats;

  return (
    <CaregiverLayout>
      <div className="cg-page">
        <CgHero
          variant="soft"
          eyebrow="Health records"
          title="Patient health history"
          subtitle="View assigned patients with vitals trends, graphs, full timeline, and alert history."
          actions={
            <CgButton variant="secondary" size="sm" onClick={loadPatients} disabled={loadingList}>
              Refresh
            </CgButton>
          }
        />

        {error && <CgAlert tone="error">{error}</CgAlert>}

        <div className="cg-split-layout">
          <aside className="cg-patient-list-panel">
            <CgSectionTitle>Assigned patients</CgSectionTitle>
            {loadingList ? (
              <CgLoading />
            ) : patients.length === 0 ? (
              <CgEmpty title="No patients" message="No one is linked to your account yet." />
            ) : (
              patients.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  className={`cg-patient-list-item${String(selectedId) === String(p._id) ? " is-active" : ""}`}
                  onClick={() => loadOverview(p._id)}
                >
                  <strong>{p.name}</strong>
                  <small>{p.healthStatus}</small>
                </button>
              ))
            )}
          </aside>

          <div className="cg-detail-panel">
            {!selectedId ? (
              <CgEmpty
                icon="👤"
                title="Choose a patient"
                message="Pick a name on the left to open charts and full health history."
              />
            ) : loadingDetail ? (
              <CgLoading text="Loading health history…" />
            ) : !overview ? (
              <CgEmpty title="No data" message="Could not load this patient's records." />
            ) : (
              <>
                <CgCard elevated>
                  <h3 style={{ margin: "0 0 6px", fontFamily: "var(--cg-display)" }}>
                    {overview.patient?.name || selectedPatient?.name}
                  </h3>
                  <p className="cg-patient-card-meta">
                    Doctor: {overview.patient?.assignedDoctor?.name || "—"}
                    {overview.patient?.assignedDoctor?.specialization
                      ? ` · ${overview.patient.assignedDoctor.specialization}`
                      : ""}
                  </p>
                  <div className="cg-summary-strip">
                    <CgBadge tone={statusTone(overview.healthSummary?.healthStatus)}>
                      {overview.healthSummary?.healthStatus || "Unknown"}
                    </CgBadge>
                    {overview.healthSummary?.aiRisk?.riskLevel && (
                      <CgBadge tone="info">AI risk: {overview.healthSummary.aiRisk.riskLevel}</CgBadge>
                    )}
                    {stats?.totalEntries != null && (
                      <CgBadge tone="neutral">{stats.totalEntries} log entries</CgBadge>
                    )}
                  </div>
                </CgCard>

                <nav className="cg-detail-tabs" aria-label="Patient detail sections">
                  {DETAIL_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className={`cg-detail-tab${detailTab === tab.id ? " is-active" : ""}`}
                        onClick={() => setDetailTab(tab.id)}
                      >
                        <Icon aria-hidden />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>

                {detailTab === "overview" && (
                  <div className="cg-vitals-grid">
                    <CgCard>
                      <span className="cg-vital-label">Blood pressure</span>
                      <strong className="cg-vital-value">
                        {latest?.systolic != null ? `${latest.systolic}/${latest.diastolic}` : "—"}
                      </strong>
                      <small>Latest reading</small>
                    </CgCard>
                    <CgCard>
                      <span className="cg-vital-label">Glucose</span>
                      <strong className="cg-vital-value">{latest?.glucose ?? "—"}</strong>
                      <small>mg/dL · latest</small>
                    </CgCard>
                    <CgCard>
                      <span className="cg-vital-label">Weight</span>
                      <strong className="cg-vital-value">
                        {latest?.weight != null ? `${latest.weight} kg` : "—"}
                      </strong>
                      <small>Latest</small>
                    </CgCard>
                    <CgCard>
                      <span className="cg-vital-label">Averages</span>
                      <strong className="cg-vital-value" style={{ fontSize: "1.1rem" }}>
                        G {stats?.avgGlucose ?? "—"} · BP {stats?.avgSystolic ?? "—"}
                      </strong>
                      <small>Across all logged entries</small>
                    </CgCard>
                    {overview.healthSummary?.aiRisk?.explanation && (
                      <CgCard className="cg-vitals-span-2">
                        <span className="cg-vital-label">AI insight</span>
                        <p className="cg-hint" style={{ margin: "8px 0 0" }}>
                          {overview.healthSummary.aiRisk.explanation}
                        </p>
                      </CgCard>
                    )}
                    {stats?.firstEntryAt && (
                      <p className="cg-hint cg-vitals-span-2">
                        Tracking from {formatDate(stats.firstEntryAt)} to {formatDate(stats.lastEntryAt)}
                      </p>
                    )}
                  </div>
                )}

                {detailTab === "trends" && (
                  <div className="cg-charts-stack">
                    <CgCard elevated>
                      <CgSectionTitle>Glucose trend</CgSectionTitle>
                      <CaregiverGlucoseChart entries={overview.entries} />
                    </CgCard>
                    <CgCard elevated>
                      <CgSectionTitle>Blood pressure trend</CgSectionTitle>
                      <CaregiverBpChart entries={overview.entries} />
                    </CgCard>
                  </div>
                )}

                {detailTab === "history" && (
                  <>
                    <CgSectionTitle>Full timeline ({overview.entries?.length || 0} entries)</CgSectionTitle>
                    {(overview.entries || []).length === 0 ? (
                      <CgEmpty title="No entries" message="This patient has not logged health data yet." />
                    ) : (
                      <div className="cg-entry-timeline">
                        {overview.entries.map((entry) => (
                          <article key={entry._id} className="cg-entry-card">
                            <h4>{formatDate(entry.createdAt)}</h4>
                            <div className="cg-entry-meta">
                              <span>BP {entry.systolic}/{entry.diastolic}</span>
                              <span>Glucose {entry.glucose ?? "—"}</span>
                              {entry.fastingGlucose != null && <span>Fasting {entry.fastingGlucose}</span>}
                              {entry.postMealGlucose != null && <span>Post-meal {entry.postMealGlucose}</span>}
                              <span>Weight {entry.weight ?? "—"} kg</span>
                              {entry.mealHoursAgo != null && <span>Meal {entry.mealHoursAgo}h ago</span>}
                            </div>
                            {entry.symptoms?.length > 0 && (
                              <p className="cg-hint" style={{ marginTop: 10 }}>
                                <strong>Symptoms:</strong> {entry.symptoms.join(", ")}
                              </p>
                            )}
                            {entry.mealRecords?.length > 0 && (
                              <p className="cg-hint" style={{ marginTop: 6 }}>
                                <strong>Meals:</strong> {entry.mealRecords.join(", ")}
                              </p>
                            )}
                            {entry.notes && (
                              <p className="cg-hint" style={{ marginTop: 6, fontStyle: "italic" }}>
                                {entry.notes}
                              </p>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {detailTab === "alerts" && (
                  <>
                    <CgSectionTitle>Patient alerts ({overview.alerts?.length || 0})</CgSectionTitle>
                    {(overview.alerts || []).length === 0 ? (
                      <CgEmpty title="No alerts" message="No alerts recorded for this patient." />
                    ) : (
                      <div className="cg-entry-timeline">
                        {overview.alerts.map((a) => (
                          <article key={a._id} className="cg-entry-card">
                            <div className="cg-summary-strip" style={{ marginBottom: 8 }}>
                              <CgBadge tone={statusTone(a.severity)}>{a.severity}</CgBadge>
                              <CgBadge tone="neutral">{a.status}</CgBadge>
                              {a.type && <CgBadge tone="info">{a.type}</CgBadge>}
                            </div>
                            <p style={{ margin: "0 0 6px" }}>{a.description}</p>
                            <small className="cg-hint">{formatDate(a.createdAt)}</small>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </CaregiverLayout>
  );
}
