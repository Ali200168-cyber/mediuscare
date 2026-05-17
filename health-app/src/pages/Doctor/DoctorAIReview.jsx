import React, { useEffect, useMemo, useRef, useState } from "react";
import DoctorLayout from "./DoctorLayout";
import { DrButton, DrBadge, DrAlert, DrEmpty } from "../../components/doctor/DoctorUI";
import "../../styles/Doctor/doctor-pages.css";
import { API_URL } from "../../config/api";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const riskTone = (risk = "") => {
  const value = String(risk).toLowerCase();
  if (value.includes("critical") || value.includes("high")) return "critical";
  if (value.includes("warn") || value.includes("medium") || value.includes("moderate")) return "warning";
  return "normal";
};

const average = (values = []) => {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
};

const pickLatestModule = (result = {}) =>
  (result.output || []).find((item) => item?.requires_doctor_approval) ||
  (result.output || []).find((item) => item?.module === "smart_recommendation_system") ||
  (result.output || []).find(Boolean) ||
  null;

const pickGlucoseForecastModule = (result = {}) => {
  const list = result?.output || [];
  return (
    list.find((item) => String(item?.module || "").toLowerCase().includes("glucose_prediction")) ||
    list.find((item) => Array.isArray(item?.prediction?.predicted_series) && item.prediction.predicted_series.length) ||
    list.find((item) => Array.isArray(item?.prediction?.glucose_forecast) && item.prediction.glucose_forecast.length) ||
    list.find((item) => Array.isArray(item?.prediction?.next_6_to_24h) && item.prediction.next_6_to_24h.length) ||
    null
  );
};

const buildReviewDraft = ({ moduleOutput, historyItems, queueItem }) => {
  const m = moduleOutput || {};
  const prediction = m.prediction || {};
  const alerts = Array.isArray(m.alerts) ? m.alerts : [];
  const trendValues = (historyItems || [])
    .map((item) => {
      const mod = pickLatestModule(item);
      const pred = mod?.prediction || {};
      const series = pred.predicted_series || pred.glucose_forecast || pred.next_6_to_24h || [];
      const first = Array.isArray(series) && series.length ? series[0] : null;
      const raw = typeof first === "object" ? first?.glucose : first;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    })
    .filter((n) => n != null);

  const latestPredicted =
    prediction.predicted_series || prediction.glucose_forecast || prediction.next_6_to_24h || [];
  const predictedNumeric = (Array.isArray(latestPredicted) ? latestPredicted : [])
    .map((item) => Number(typeof item === "object" ? item?.glucose : item))
    .filter((n) => Number.isFinite(n));

  const trend = prediction.trend_curve || prediction.glucose_trend || prediction.trend || "Unknown";
  const bpClass = prediction.hypertension_category || prediction.risk_category || "Not available";
  const confidence = typeof m.confidence_score === "number" ? `${Math.round(m.confidence_score * 100)}%` : "Not available";
  const riskLevel = m.risk_level || "Moderate";
  const alertCritical = alerts.some((a) => String(a?.severity || "").toLowerCase().includes("critical"));
  const alertHigh = alerts.some((a) => String(a?.severity || "").toLowerCase().includes("high"));
  const urgency = alertCritical ? "Emergency" : alertHigh ? "Urgent" : "Routine";
  const missing = [];
  if (!predictedNumeric.length) missing.push("6-24h glucose forecast");
  if (!bpClass || bpClass === "Not available") missing.push("BP risk classification");
  if (!historyItems?.length) missing.push("historical trend data");

  const agreement =
    missing.length > 1
      ? "Potentially misleading due to limited data."
      : riskTone(riskLevel) === "critical"
        ? "Reasonable and clinically concerning; requires prompt review."
        : "Reasonable with current data; continue confirmation with bedside context.";

  const trendAvg = average(trendValues);
  const trendDirection =
    trendValues.length < 3 ? "insufficient data" : trendValues[0] - trendValues[trendValues.length - 1] > 8 ? "improving" : trendValues[trendValues.length - 1] - trendValues[0] > 8 ? "worsening" : "stable";

  return {
    patientOverview: `Patient shows ${String(riskLevel).toLowerCase()} immediate risk with ${trendDirection} recent glucose trajectory. ${
      predictedNumeric.length
        ? `Near-term forecast range is ${Math.min(...predictedNumeric).toFixed(0)}-${Math.max(...predictedNumeric).toFixed(0)} mg/dL.`
        : "Near-term forecast is incomplete."
    } Findings support clinical review, not diagnosis.`,
    riskLevel: riskTone(riskLevel) === "critical" ? "High" : riskTone(riskLevel) === "warning" ? "Moderate" : "Low",
    riskExplanation: `Risk determined from recent vitals trend, current AI risk (${riskLevel}), alert severity, and available BP classification (${bpClass}).`,
    aiAssessment: `${agreement} AI confidence: ${confidence}. ${
      missing.length ? `Limitations: missing ${missing.join(", ")}.` : "No major data gap detected."
    }`,
    dosageHint:
      queueItem && m.requires_doctor_approval
        ? "AI dosage requires a doctor decision. Approve when trend and current vitals align; reject or modify when safety concerns or inconsistencies exist."
        : "No active insulin dosage approval item is currently pending.",
    recommendations: [
      "Reconfirm latest glucose and BP readings before final decision.",
      "Review meal timing, symptoms, and medication adherence in context.",
      "Increase monitoring frequency if risk remains moderate/high or alerts recur.",
      "Record clinical reasoning clearly in notes for patient safety and audit.",
    ],
    alertsUrgency: `${urgency} - ${alerts.length ? `${alerts.length} alert(s) detected.` : "No critical alert currently."} ${
      alertCritical
        ? "Immediate escalation and direct patient contact are advised."
        : alertHigh
          ? "Prompt same-day follow-up is advised."
          : "Continue routine monitoring and reassessment."
    }`,
    trendAverage: trendAvg,
    trendLabel: trend,
  };
};

export default function DoctorAIReview() {
  const [patients, setPatients] = useState([]);
  const [activePatientId, setActivePatientId] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [patientLatestMap, setPatientLatestMap] = useState({});
  const [historyItems, setHistoryItems] = useState([]);
  const [queueItems, setQueueItems] = useState([]);
  const [assignedAnalytics, setAssignedAnalytics] = useState(null);
  const [notes, setNotes] = useState({});
  const [suggestions, setSuggestions] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [toast, setToast] = useState(null);
  const [error, setError] = useState("");
  const [lastDecision, setLastDecision] = useState(null);
  const [resolvedResultIds, setResolvedResultIds] = useState({});

  const pollRef = useRef(null);
  const activePatientRef = useRef("");
  /** Same keys as resolvedResultIds; updated synchronously on submit so refetches (poll) never resurrect a decided row. */
  const resolvedResultIdsRef = useRef({});

  useEffect(() => {
    resolvedResultIdsRef.current = resolvedResultIds;
  }, [resolvedResultIds]);

  useEffect(() => {
    activePatientRef.current = String(activePatientId || "");
  }, [activePatientId]);

  const fetchWithAuth = (url, opts = {}) => {
    const token = localStorage.getItem("token");
    return fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  const loadOverview = async () => {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const [patientsRes, analyticsRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/api/doctor/monitoring/patients`).then((r) => r.json()),
        fetchWithAuth(`${API_URL}/api/ai/doctor/assigned-analytics`).then((r) => r.json()),
      ]);
      if (!patientsRes.success) throw new Error(patientsRes.message || "Failed to load assigned patients.");
      setPatients(patientsRes.patients || []);
      if (analyticsRes.success) setAssignedAnalytics(analyticsRes.analytics);

      const ids = (patientsRes.patients || []).map((p) => String(p._id));
      const pairs = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetchWithAuth(`${API_URL}/api/ai/history?patientId=${id}&limit=1&page=1`);
            const data = await res.json();
            if (!data.success || !data.items?.length) return [id, null];
            const item = data.items[0];
            const mod = pickLatestModule(item);
            return [
              id,
              mod
                ? {
                    ...mod,
                    _resultId: item._id,
                    _createdAt: item.createdAt,
                    _reviewStatus: item.reviewStatus,
                  }
                : null,
            ];
          } catch {
            return [id, null];
          }
        }),
      );
      setPatientLatestMap(Object.fromEntries(pairs));
      const current = activePatientRef.current;
      if (!ids.length) setActivePatientId("");
      else if (!current || !ids.includes(current)) setActivePatientId(ids[0]);
    } catch (e) {
      setOverviewError(e.message || "Failed to load doctor AI review.");
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadPatientDetail = async (patientId) => {
    if (!patientId) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const [queueRes, historyRes] = await Promise.all([
        fetchWithAuth(`${API_URL}/api/ai/history?patientId=${patientId}&reviewStatus=pending&limit=20&page=1`).then((r) => r.json()),
        fetchWithAuth(`${API_URL}/api/ai/history?patientId=${patientId}&limit=30&page=1`).then((r) => r.json()),
      ]);
      const queueRaw = queueRes.success ? queueRes.items || [] : [];
      const hidden = resolvedResultIdsRef.current;
      setQueueItems(queueRaw.filter((item) => !hidden[String(item._id)]));
      setHistoryItems(historyRes.success ? historyRes.items || [] : []);
    } catch (e) {
      setDetailError(e.message || "Failed to load patient AI details.");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadOverview().catch(() => {});
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadOverview().catch(() => {});
      const current = activePatientRef.current;
      if (current) loadPatientDetail(current).catch(() => {});
    }, 20000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLastDecision(null);
  }, [activePatientId]);

  useEffect(() => {
    if (!activePatientId) return;
    loadPatientDetail(activePatientId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePatientId, resolvedResultIds]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  const activePatient = useMemo(
    () => patients.find((p) => String(p._id) === String(activePatientId)) || null,
    [patients, activePatientId],
  );

  const selectedQueue = useMemo(() => {
    const first = queueItems[0];
    if (!first) return null;
    const module = pickLatestModule(first);
    return module ? { resultId: first._id, createdAt: first.createdAt, module } : null;
  }, [queueItems]);

  const activeModule = useMemo(() => {
    if (selectedQueue?.module) return selectedQueue.module;
    return patientLatestMap[String(activePatientId)] || null;
  }, [selectedQueue, patientLatestMap, activePatientId]);

  const trendData = useMemo(() => {
    const ordered = [...historyItems].reverse();
    return ordered.map((item, idx) => {
      const mod = pickGlucoseForecastModule(item) || pickLatestModule(item);
      const pred = mod?.prediction || {};
      const series = pred.predicted_series || pred.glucose_forecast || pred.next_6_to_24h || [];
      const first = Array.isArray(series) && series.length ? series[0] : null;
      const value = Number(typeof first === "object" ? first?.glucose : first);
      return {
        idx: idx + 1,
        date: new Date(item.createdAt).toLocaleDateString(),
        predictedGlucose: Number.isFinite(value) ? value : null,
      };
    });
  }, [historyItems]);

  const draft = useMemo(
    () =>
      buildReviewDraft({
        moduleOutput: activeModule,
        historyItems,
        queueItem: selectedQueue,
      }),
    [activeModule, historyItems, selectedQueue],
  );

  const pendingLabel = `${queueItems.length} pending dosage item(s)`;
  const selectedNotes = selectedQueue ? notes[selectedQueue.resultId] || "" : "";
  const selectedSuggestion = selectedQueue ? suggestions[selectedQueue.resultId] || "" : "";
  const selectedDose = selectedQueue?.module?.prediction?.suggested_dose_units;
  const selectedDoseRationale = selectedQueue?.module?.prediction?.dosage_rationale || "";

  const submitDecision = async (decision) => {
    if (!selectedQueue?.resultId) return;
    const resultId = selectedQueue.resultId;
    const suggestionText = String(suggestions[resultId] || "").trim();
    if (decision === "modified" && !suggestionText) {
      setError("Please add modification details before selecting Modify.");
      return;
    }

    setSubmitting((prev) => ({ ...prev, [resultId]: true }));
    try {
      const body = {
        decision,
        notes: notes[resultId] || "",
        doctorSuggestion: suggestionText,
      };
      const res = await fetchWithAuth(`${API_URL}/api/ai/review/${resultId}/insulin`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to submit decision.");
        setToast({ type: "error", message: data.message || "Failed to submit decision." });
        return;
      }

      const label = decision === "approved" ? "Approved" : decision === "modified" ? "Modified" : "Rejected";
      const patientId = activePatientRef.current;

      const idKey = String(resultId);
      resolvedResultIdsRef.current = { ...resolvedResultIdsRef.current, [idKey]: true };
      setQueueItems((prev) => prev.filter((item) => String(item._id) !== idKey));
      setResolvedResultIds((prev) => ({ ...prev, [idKey]: true }));
      setLastDecision({
        resultId,
        label,
        at: new Date().toISOString(),
      });
      setError("");
      await loadPatientDetail(patientId);
      await loadOverview();
      setToast({ type: "success", message: `Decision submitted: ${label}.` });
    } catch {
      setError("Could not submit decision.");
      setToast({ type: "error", message: "Could not submit decision." });
    } finally {
      setSubmitting((prev) => ({ ...prev, [resultId]: false }));
    }
  };

  const riskBadge = (level) => {
    const t = riskTone(level);
    if (t === "critical") return "danger";
    if (t === "warning") return "warning";
    return "success";
  };

  return (
    <DoctorLayout headerActions={<DrButton size="sm" variant="secondary" onClick={() => loadOverview()}>Refresh</DrButton>}>
      <div className="arv-page">
        {(overviewError || error) && <DrAlert tone="error">{overviewError || error}</DrAlert>}
        {toast && <div className={`arv-toast arv-toast-${toast.type}`}>{toast.message}</div>}

        {assignedAnalytics && (
          <section className="arv-stats">
            <article>
              <span>Patients</span>
              <strong>{assignedAnalytics.totalPatients}</strong>
            </article>
            <article className="arv-stat-warn">
              <span>Pending</span>
              <strong>{assignedAnalytics.pendingReviews}</strong>
            </article>
            <article>
              <span>Simulations</span>
              <strong>{assignedAnalytics.totalSimulations}</strong>
            </article>
            <article className="arv-stat-risk">
              <span>High risk</span>
              <strong>{assignedAnalytics.riskCounts?.High || 0}</strong>
            </article>
          </section>
        )}

        <div className="arv-layout">
          <aside className="arv-patient-rail">
            <header>
              <h2>Patients</h2>
              <span>{patients.length}</span>
            </header>
            <div className="arv-patient-scroll">
              {overviewLoading ? (
                Array.from({ length: 5 }).map((_, i) => <div key={i} className="arv-patient-skel" />)
              ) : patients.length === 0 ? (
                <DrEmpty title="No patients" />
              ) : (
                patients.map((p) => {
                  const latest = patientLatestMap[String(p._id)];
                  const tone = riskTone(latest?.risk_level);
                  const active = String(activePatientId) === String(p._id);
                  return (
                    <button
                      type="button"
                      key={p._id}
                      className={`arv-patient-btn arv-tone-${tone}${active ? " active" : ""}`}
                      onClick={() => setActivePatientId(String(p._id))}
                    >
                      <span className="arv-patient-avatar">{(p.name || "P")[0]}</span>
                      <span className="arv-patient-info">
                        <strong>{p.name}</strong>
                        <small>{latest?.risk_level || "No AI run"}</small>
                      </span>
                      <DrBadge tone={riskBadge(latest?.risk_level)}>
                        {tone === "critical" ? "High" : tone === "warning" ? "Med" : "Low"}
                      </DrBadge>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="arv-workspace">
            {!activePatient ? (
              <div className="arv-empty-main">
                <h3>Select a patient</h3>
                <p>Review AI glucose trends and insulin decisions.</p>
              </div>
            ) : (
              <>
                <header className="arv-workspace-head">
                  <div>
                    <h2>{activePatient.name}</h2>
                    <p>{pendingLabel}</p>
                  </div>
                  <DrBadge tone={riskBadge(draft.riskLevel)}>{draft.riskLevel} risk</DrBadge>
                </header>

                {detailError && <DrAlert tone="error">{detailError}</DrAlert>}

                <section className="arv-chart-panel">
                  <h3>Glucose forecast trend</h3>
                  {detailLoading ? (
                    <div className="arv-chart-skel" />
                  ) : !trendData.length ? (
                    <p className="arv-muted">No historical AI data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} width={36} />
                        <Tooltip />
                        <Line type="monotone" dataKey="predictedGlucose" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </section>

                <div className="arv-split">
                  <section className="arv-context">
                    <h3>Clinical summary</h3>
                    <p>{draft.patientOverview}</p>
                    <dl className="arv-facts">
                      <div>
                        <dt>Risk</dt>
                        <dd>{draft.riskExplanation}</dd>
                      </div>
                      <div>
                        <dt>Assessment</dt>
                        <dd>{draft.aiAssessment}</dd>
                      </div>
                      <div>
                        <dt>Urgency</dt>
                        <dd>{draft.alertsUrgency}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="arv-decision">
                    {!selectedQueue ? (
                      <div className="arv-decision-empty">
                        <strong>{lastDecision ? `Completed: ${lastDecision.label}` : "No pending dose"}</strong>
                        <p>
                          {lastDecision
                            ? new Date(lastDecision.at).toLocaleString()
                            : "Context above is for reference only."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="arv-dose">
                          <span>Suggested dose</span>
                          <strong>{selectedDose != null ? `${selectedDose} units` : "—"}</strong>
                          <p>{selectedDoseRationale || draft.dosageHint}</p>
                        </div>
                        <label className="arv-field">
                          <span>Clinical notes</span>
                          <textarea
                            className="dr-input"
                            rows={3}
                            placeholder="Reasoning for your decision…"
                            value={selectedNotes}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [selectedQueue.resultId]: e.target.value }))}
                          />
                        </label>
                        <label className="arv-field">
                          <span>Modification (if changing dose)</span>
                          <textarea
                            className="dr-input"
                            rows={2}
                            placeholder="New dose and rationale…"
                            value={selectedSuggestion}
                            onChange={(e) => setSuggestions((prev) => ({ ...prev, [selectedQueue.resultId]: e.target.value }))}
                          />
                        </label>
                        <div className="arv-actions">
                          <DrButton onClick={() => submitDecision("approved")} disabled={!!submitting[selectedQueue.resultId]}>
                            Approve
                          </DrButton>
                          <DrButton variant="secondary" onClick={() => submitDecision("rejected")} disabled={!!submitting[selectedQueue.resultId]}>
                            Reject
                          </DrButton>
                          <DrButton variant="ghost" onClick={() => submitDecision("modified")} disabled={!!submitting[selectedQueue.resultId]}>
                            Modify
                          </DrButton>
                        </div>
                      </>
                    )}
                  </section>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </DoctorLayout>
  );
}
