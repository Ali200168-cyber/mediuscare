import { useEffect, useMemo, useState } from "react";
import {
  HiOutlineArrowTrendingDown,
  HiOutlineArrowTrendingUp,
  HiOutlineBolt,
  HiOutlineChartBar,
  HiOutlineShieldCheck,
  HiOutlineSparkles,
} from "react-icons/hi2";
import PatientLayout from "./PatientLayout";
import { PtPageHeader, PtButton, PtAlert, PtBadge, PtSkeletonGrid } from "../../components/patient/PatientUI";
import { patientFetch } from "../../components/patient/patientApi";
import "../../styles/Patient/patient-pages.css";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const average = (values = []) => {
  if (!values.length) return 0;
  return Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 10) / 10;
};

const classifyGlucose = (value) => {
  if (value == null) return "Unknown";
  if (value < 70) return "Low";
  if (value <= 140) return "Normal";
  if (value <= 180) return "Elevated";
  return "High";
};

const classifyBp = (systolic, diastolic) => {
  if (!systolic || !diastolic) return "Unknown";
  if (systolic < 120 && diastolic < 80) return "Normal";
  if (systolic < 130 && diastolic < 80) return "Elevated";
  if (systolic < 140 || diastolic < 90) return "Stage 1";
  return "Stage 2";
};

const riskTone = (risk = "") => {
  const v = String(risk).toLowerCase();
  if (v.includes("critical") || v.includes("high")) return "danger";
  if (v.includes("warn") || v.includes("medium") || v.includes("moderate")) return "warning";
  return "success";
};

const parseDoctorFlow = (historyData) => {
  const flowItems = Array.isArray(historyData?.items) ? historyData.items : [];
  const latestFlow = flowItems.find(
    (item) =>
      Array.isArray(item?.output) &&
      item.output.some(
        (mod) =>
          mod?.module === "smart_recommendation_system" ||
          mod?.requires_doctor_approval ||
          mod?.doctor_review_status,
      ),
  );
  if (!latestFlow) return null;
  const smart =
    latestFlow.output.find((m) => m?.module === "smart_recommendation_system") ||
    latestFlow.output.find((m) => m?.requires_doctor_approval || m?.doctor_review_status) ||
    null;
  return {
    reviewStatus: latestFlow.reviewStatus || "pending",
    createdAt: latestFlow.createdAt,
    reviewedAt: latestFlow.reviewedAt,
    doctorNotes: latestFlow.reviewNotes || smart?.doctor_review_notes || "",
    doctorSuggestion: smart?.doctor_suggestion || "",
    recommendation: smart?.recommendation || "",
    suggestedDose: smart?.prediction?.suggested_dose_units,
    doseRationale: smart?.prediction?.dosage_rationale || "",
  };
};

const AIPredictions = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState([]);
  const [latestAi, setLatestAi] = useState(null);
  const [forecastRequirement, setForecastRequirement] = useState({ min: 4, current: 0, canRun: false });
  const [doctorDosageFlow, setDoctorDosageFlow] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [healthRes, aiRes, historyRes] = await Promise.all([
        patientFetch("/api/health/recent?limit=45").then((r) => r.json()),
        patientFetch("/api/ai/simulate-from-health", { method: "POST" }).then((r) => r.json()),
        patientFetch("/api/ai/history?limit=20&page=1").then((r) => r.json()),
      ]);
      if (!healthRes.success) throw new Error("Failed to load health history.");
      setEntries(healthRes.entries || []);
      const minPoints = Number(aiRes?.requirements?.minGlucosePoints || 4);
      const currentPoints = Number(
        aiRes?.requirements?.currentGlucosePoints ||
          (healthRes.entries || []).filter((e) => e.glucose != null).length,
      );
      setForecastRequirement({
        min: minPoints,
        current: currentPoints,
        canRun: Boolean(aiRes.success && currentPoints >= minPoints),
      });
      setLatestAi(aiRes.success && Array.isArray(aiRes.output) && aiRes.output.length ? aiRes.output[0] : null);
      setDoctorDosageFlow(parseDoctorFlow(historyRes));
    } catch (err) {
      setError(err.message || "Failed to load insights.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const latest = entries[0] || null;
  const previous = entries[1] || null;

  const trendData = useMemo(() => {
    return [...entries].reverse().map((entry, idx) => ({
      index: idx + 1,
      glucose: entry.glucose ?? null,
      systolic: entry.systolic ?? null,
      diastolic: entry.diastolic ?? null,
      date: new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }));
  }, [entries]);

  const forecastData = useMemo(() => {
    const history = trendData.slice(-8).map((p) => ({
      label: p.date,
      actualGlucose: p.glucose,
      predictedGlucose: null,
    }));
    const predictedRaw =
      latestAi?.prediction?.predicted_series ||
      latestAi?.prediction?.glucose_forecast ||
      latestAi?.prediction?.next_6_to_24h ||
      [];
    const predictionPoints = predictedRaw
      .map((point, idx) => {
        if (point && typeof point === "object") {
          return {
            label: `+${Number(point.hour || (idx + 1) * 4)}h`,
            actualGlucose: null,
            predictedGlucose: Number(point.glucose),
          };
        }
        return {
          label: `+${(idx + 1) * 4}h`,
          actualGlucose: null,
          predictedGlucose: Number(point),
        };
      })
      .filter((p) => !Number.isNaN(p.predictedGlucose));
    return [...history, ...predictionPoints];
  }, [latestAi, trendData]);

  const forecastSummary = useMemo(() => {
    const predictedRaw =
      latestAi?.prediction?.predicted_series ||
      latestAi?.prediction?.glucose_forecast ||
      latestAi?.prediction?.next_6_to_24h ||
      [];
    if (!predictedRaw.length) return null;
    const numeric = predictedRaw
      .map((v) => (v && typeof v === "object" ? Number(v.glucose) : Number(v)))
      .filter((v) => !Number.isNaN(v));
    if (!numeric.length) return null;
    return {
      min: Math.min(...numeric).toFixed(0),
      max: Math.max(...numeric).toFixed(0),
      trend: latestAi?.prediction?.glucose_trend || latestAi?.prediction?.trend || "Stable",
    };
  }, [latestAi]);

  const summary = useMemo(() => {
    const glucoseValues = entries.map((e) => e.glucose).filter((v) => v != null);
    const systolicValues = entries.map((e) => e.systolic).filter((v) => v != null);
    const diastolicValues = entries.map((e) => e.diastolic).filter((v) => v != null);
    const glucoseAvg = average(glucoseValues);
    const systolicAvg = average(systolicValues);
    const diastolicAvg = average(diastolicValues);
    return {
      entries: entries.length,
      glucoseAvg,
      systolicAvg,
      diastolicAvg,
      glucoseState: classifyGlucose(glucoseAvg),
      bpState: classifyBp(systolicAvg, diastolicAvg),
    };
  }, [entries]);

  const glucoseDelta =
    latest?.glucose != null && previous?.glucose != null
      ? Number((latest.glucose - previous.glucose).toFixed(1))
      : null;

  const recommendationCards = useMemo(() => {
    if (latestAi?.recommendation) {
      if (typeof latestAi.recommendation === "string") return [latestAi.recommendation];
      return [
        ...(latestAi.recommendation.lifestyle_suggestions || []),
        latestAi.recommendation.medication_awareness || "",
        ...(latestAi.recommendation.preventive_actions || []),
      ]
        .filter(Boolean)
        .slice(0, 3);
    }
    const tips = [];
    if (!entries.length) return ["Log daily vitals to unlock personalized forecasts."];
    if (summary.glucoseAvg > 180) tips.push("Glucose trending high — review meals and meds.");
    else if (summary.glucoseAvg > 140) tips.push("Slight elevation — stay consistent with logging.");
    else tips.push("Glucose stable — keep your routine.");
    if (summary.systolicAvg >= 140 || summary.diastolicAvg >= 90) tips.push("BP elevated — discuss with your doctor.");
    return tips.slice(0, 3);
  }, [entries.length, latestAi, summary]);

  const alerts = useMemo(() => {
    const modelAlerts = latestAi?.alerts || [];
    const derived = [];
    const predicted = latestAi?.prediction?.glucose_forecast || [];
    if (Array.isArray(predicted) && predicted.some((v) => Number(v) >= 220)) {
      derived.push({ severity: "High", text: "High glucose predicted soon" });
    }
    return [
      ...modelAlerts.map((a) => ({
        severity: a.severity || "Low",
        text: a.recommended_action || a.type || "Alert",
      })),
      ...derived,
    ].slice(0, 5);
  }, [latestAi]);

  const riskLabel = latestAi?.risk_level || summary.glucoseState;
  const riskBadgeTone = riskTone(latestAi?.risk_level);

  const chartTooltipStyle = {
    borderRadius: 12,
    border: "1px solid var(--pt-border)",
    boxShadow: "var(--pt-shadow-md)",
    fontSize: 12,
  };

  return (
    <PatientLayout>
      <div className="pt-ai-studio pt-fade-in">
        <PtPageHeader
          title="AI insights"
          subtitle="Personal health intelligence"
          actions={
            <PtButton variant="secondary" size="sm" onClick={load} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </PtButton>
          }
        />

        {error && <PtAlert tone="error">{error}</PtAlert>}

        {loading ? (
          <PtSkeletonGrid count={6} />
        ) : (
          <>
            <section className="pt-ai-hero">
              <div className="pt-ai-hero-main">
                <span className="pt-ai-hero-label">
                  <HiOutlineSparkles /> Risk assessment
                </span>
                <h2 className="pt-ai-hero-risk">{riskLabel}</h2>
                <p className="pt-ai-hero-meta">
                  {summary.entries} readings · {summary.glucoseState} glucose · {summary.bpState} BP
                </p>
                <div className="pt-ai-hero-badges">
                  <PtBadge tone={riskBadgeTone}>{String(riskLabel).slice(0, 24)}</PtBadge>
                  <PtBadge tone="info">{summary.glucoseState}</PtBadge>
                  <PtBadge tone="neutral">{summary.bpState}</PtBadge>
                </div>
              </div>

            </section>

            <section className="pt-ai-metrics">
              {[
                { label: "Avg glucose", value: summary.glucoseAvg ? `${summary.glucoseAvg}` : "—", unit: "mg/dL", icon: HiOutlineChartBar },
                {
                  label: "Avg BP",
                  value: summary.systolicAvg ? `${summary.systolicAvg}/${summary.diastolicAvg}` : "—",
                  unit: "mmHg",
                  icon: HiOutlineShieldCheck,
                },
                {
                  label: "vs yesterday",
                  value: glucoseDelta == null ? "—" : `${glucoseDelta > 0 ? "+" : ""}${glucoseDelta}`,
                  unit: "mg/dL",
                  icon: glucoseDelta > 0 ? HiOutlineArrowTrendingUp : HiOutlineArrowTrendingDown,
                  tone: glucoseDelta > 5 ? "warning" : glucoseDelta < -5 ? "success" : "neutral",
                },
                {
                  label: "Forecast",
                  value: forecastSummary ? forecastSummary.trend : "—",
                  unit: forecastSummary ? `${forecastSummary.min}–${forecastSummary.max}` : "log more",
                  icon: HiOutlineBolt,
                },
              ].map((m) => (
                <article key={m.label} className="pt-ai-metric-card">
                  <m.icon className="pt-ai-metric-icon" aria-hidden />
                  <span className="pt-ai-metric-label">{m.label}</span>
                  <strong className="pt-ai-metric-value">{m.value}</strong>
                  <span className="pt-ai-metric-unit">{m.unit}</span>
                </article>
              ))}
            </section>

            <section className="pt-ai-charts">
              <article className="pt-ai-chart-card">
                <header>
                  <h3>Glucose trend</h3>
                  <span>Recent readings</span>
                </header>
                {trendData.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="ptGlucoseFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--pt-border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Area type="monotone" dataKey="glucose" stroke="#0d9488" strokeWidth={2.5} fill="url(#ptGlucoseFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="pt-ai-empty-chart">Log vitals to see your trend.</p>
                )}
              </article>

              <article className="pt-ai-chart-card">
                <header>
                  <h3>6–24h forecast</h3>
                  <span>Model prediction</span>
                </header>
                {forecastRequirement.canRun && forecastSummary ? (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={forecastData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--pt-border)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Line type="monotone" dataKey="actualGlucose" name="Actual" stroke="#0d9488" strokeWidth={2.5} dot={false} />
                        <Line
                          type="monotone"
                          dataKey="predictedGlucose"
                          name="Predicted"
                          stroke="#6366f1"
                          strokeWidth={2.5}
                          strokeDasharray="6 4"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className="pt-ai-forecast-pills">
                      <span>Trend <strong>{forecastSummary.trend}</strong></span>
                      <span>Range <strong>{forecastSummary.min}–{forecastSummary.max}</strong></span>
                    </div>
                  </>
                ) : (
                  <div className="pt-ai-forecast-locked">
                    <p>Log {forecastRequirement.min - forecastRequirement.current} more glucose readings to unlock forecast.</p>
                  </div>
                )}
              </article>

              <article className="pt-ai-chart-card pt-ai-chart-card--wide">
                <header>
                  <h3>Blood pressure</h3>
                  <span>Systolic / diastolic</span>
                </header>
                {trendData.length ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--pt-border)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Line type="monotone" dataKey="systolic" stroke="#f97316" strokeWidth={2} dot={false} name="Sys" />
                      <Line type="monotone" dataKey="diastolic" stroke="#14b8a6" strokeWidth={2} dot={false} name="Dia" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="pt-ai-empty-chart">No BP data yet.</p>
                )}
              </article>
            </section>

            <section className="pt-ai-insights-row">
              {recommendationCards.map((tip, i) => (
                <article key={i} className="pt-ai-insight-card">
                  <HiOutlineSparkles className="pt-ai-insight-icon" aria-hidden />
                  <p>{tip}</p>
                </article>
              ))}
            </section>

            <section className="pt-ai-bottom">
              <article className="pt-ai-panel">
                <header>
                  <h3>Doctor review</h3>
                  {doctorDosageFlow && (
                    <PtBadge tone={doctorDosageFlow.reviewStatus === "approved" ? "success" : doctorDosageFlow.reviewStatus === "pending" ? "warning" : "neutral"}>
                      {doctorDosageFlow.reviewStatus}
                    </PtBadge>
                  )}
                </header>
                {!doctorDosageFlow ? (
                  <p className="pt-ai-panel-text">No dosage recommendation pending. AI suggestions appear here for doctor approval.</p>
                ) : (
                  <ul className="pt-ai-panel-list">
                    {doctorDosageFlow.recommendation && <li>{doctorDosageFlow.recommendation}</li>}
                    {doctorDosageFlow.suggestedDose != null && <li>Suggested dose: <strong>{doctorDosageFlow.suggestedDose} units</strong></li>}
                    {doctorDosageFlow.doctorNotes && <li>Notes: {doctorDosageFlow.doctorNotes}</li>}
                  </ul>
                )}
              </article>

              <article className="pt-ai-panel">
                <header>
                  <h3>Alerts</h3>
                  <PtBadge tone={alerts.length ? "warning" : "success"}>{alerts.length || "Clear"}</PtBadge>
                </header>
                <div className="pt-ai-alert-pills">
                  {alerts.length === 0 ? (
                    <span className="pt-ai-alert-pill pt-ai-alert-pill--ok">All clear</span>
                  ) : (
                    alerts.map((a, idx) => (
                      <span
                        key={idx}
                        className={`pt-ai-alert-pill pt-ai-alert-pill--${String(a.severity).toLowerCase().includes("high") || String(a.severity).toLowerCase().includes("critical") ? "danger" : "warn"}`}
                      >
                        {a.text}
                      </span>
                    ))
                  )}
                </div>
              </article>
            </section>
          </>
        )}
      </div>
    </PatientLayout>
  );
};

export default AIPredictions;
