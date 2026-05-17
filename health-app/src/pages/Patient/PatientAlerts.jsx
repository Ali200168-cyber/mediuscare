import { useEffect, useState } from "react";
import PatientLayout from "./PatientLayout";
import {
  PtPageHeader,
  PtTabs,
  PtBadge,
  PtButton,
  PtEmpty,
  PtAlert,
  PtSkeletonGrid,
  patientFetch,
} from "../../components/patient/PatientUI";

const severityTone = (s = "") => {
  const v = String(s).toLowerCase();
  if (v.includes("critical") || v.includes("high")) return "danger";
  if (v.includes("medium")) return "warning";
  return "info";
};

const PatientAlerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [tab, setTab] = useState("active");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (t = tab) => {
    setLoading(true);
    try {
      setError("");
      const status = t === "active" ? "active" : "acknowledged";
      const data = await patientFetch(`/api/v1/alerts?status=${status}`).then((r) => r.json());
      if (!data.success) throw new Error();
      setAlerts(Array.from(new Map((data.items || []).map((a) => [a._id, a])).values()));
    } catch {
      setError("Could not load alerts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(tab);
    const poll = setInterval(() => load(tab), 15000);
    return () => clearInterval(poll);
  }, [tab]);

  const ack = async (id) => {
    const prev = alerts;
    setAlerts((c) => c.filter((a) => a._id !== id));
    try {
      const data = await patientFetch(`/api/v1/alerts/${id}/ack`, { method: "PATCH" }).then((r) => r.json());
      if (!data.success) throw new Error();
    } catch {
      setAlerts(prev);
      setError("Could not dismiss alert.");
    }
  };

  return (
    <PatientLayout>
      <PtPageHeader title="Alerts" />
      <PtTabs
        tabs={[
          { id: "active", label: "Active" },
          { id: "history", label: "History" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {error && <PtAlert tone="error">{error}</PtAlert>}
      {loading ? (
        <PtSkeletonGrid count={3} />
      ) : alerts.length === 0 ? (
        <PtEmpty icon="🔔" title="All clear" message={tab === "active" ? "No active alerts." : "No history yet."} />
      ) : (
        <div className="pt-grid" style={{ gap: 12 }}>
          {alerts.map((a) => (
            <article key={a._id} className="pt-card pt-card-flat" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <PtBadge tone={severityTone(a.severity)}>{a.severity}</PtBadge>
                <p style={{ margin: "8px 0 4px", fontWeight: 600 }}>{a.type}</p>
                <p style={{ margin: 0, color: "var(--pt-muted)", fontSize: "0.875rem" }}>{a.message}</p>
                <small style={{ color: "var(--pt-muted-light)" }}>{new Date(a.createdAt).toLocaleString()}</small>
              </div>
              {tab === "active" && a.status !== "acknowledged" && (
                <PtButton variant="secondary" size="sm" onClick={() => ack(a._id)}>Dismiss</PtButton>
              )}
            </article>
          ))}
        </div>
      )}
    </PatientLayout>
  );
};

export default PatientAlerts;
