import { useEffect, useState } from "react";
import CaregiverLayout from "./CaregiverLayout";
import {
  CgHero,
  CgBadge,
  CgButton,
  CgAlert,
  CgEmpty,
  CgLoading,
  caregiverFetch,
} from "../../components/caregiver/CaregiverUI";

const severityTone = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "high") return "danger";
  if (v === "medium") return "warning";
  return "info";
};

export default function CaregiverAlerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await caregiverFetch("/api/caregiver/alerts");
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setAlerts(data.alerts || []);
    } catch (e) {
      setError(e.message || "Failed to load alerts");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <CaregiverLayout>
      <div className="cg-page">
        <CgHero
          variant="alerts"
          eyebrow="Alert center"
          title="Patient alerts"
          subtitle="Every notification for the people you care for — who it affects, how serious it is, and when it happened."
          actions={
            <CgButton variant="secondary" size="sm" onClick={load} disabled={loading}>
              Refresh
            </CgButton>
          }
        />

        {error && <CgAlert tone="error">{error}</CgAlert>}

        {loading ? (
          <CgLoading text="Loading alerts…" />
        ) : alerts.length === 0 ? (
          <CgEmpty icon="✨" title="All quiet" message="There are no active alerts for your patients right now." />
        ) : (
          <div className="cg-alert-feed">
            {alerts.map((a) => (
              <article
                key={a._id}
                className={`cg-alert-item${a.severity === "High" ? " cg-alert-item--high" : ""}`}
              >
                <div className="cg-alert-item-head">
                  <strong>{a.patientName}</strong>
                  <CgBadge tone={severityTone(a.severity)}>{a.severity}</CgBadge>
                  <CgBadge tone="neutral">{a.status}</CgBadge>
                  <time>{new Date(a.createdAt).toLocaleString()}</time>
                </div>
                <p>{a.description}</p>
                {a.type && (
                  <p className="cg-alert-type">Type: {String(a.type).replace(/_/g, " ")}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </CaregiverLayout>
  );
}
