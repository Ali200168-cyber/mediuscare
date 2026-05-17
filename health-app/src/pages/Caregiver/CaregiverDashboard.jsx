import { useEffect, useState } from "react";
import CaregiverLayout from "./CaregiverLayout";
import {
  CgHero,
  CgStat,
  CgCard,
  CgBadge,
  CgButton,
  CgAlert,
  CgEmpty,
  CgLoading,
  CgSectionTitle,
  caregiverFetch,
} from "../../components/caregiver/CaregiverUI";

const statusTone = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "critical") return "danger";
  if (v === "warning") return "warning";
  if (v === "normal") return "success";
  return "neutral";
};

export default function CaregiverDashboard() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await caregiverFetch("/api/caregiver/patients");
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load patients");
      setPatients(data.patients || []);
    } catch (e) {
      setError(e.message || "Could not load dashboard");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalAlerts = patients.reduce((sum, p) => sum + (p.openAlerts || 0), 0);
  const criticalCount = patients.filter((p) => p.healthStatus === "Critical").length;

  return (
    <CaregiverLayout>
      <div className="cg-page">
        <CgHero
          eyebrow="Family care overview"
          title="Welcome to your care hub"
          subtitle="Monitor everyone you support — vitals, alerts, and doctor updates in one warm, calm space."
          actions={
            <CgButton variant="secondary" size="sm" onClick={load} disabled={loading}>
              Refresh
            </CgButton>
          }
        />

        {error && <CgAlert tone="error">{error}</CgAlert>}

        <div className="cg-stats">
          <CgStat label="People you care for" value={loading ? "—" : patients.length} tone="rose" />
          <CgStat label="Open alerts" value={loading ? "—" : totalAlerts} tone="warn" />
          <CgStat label="Need attention" value={loading ? "—" : criticalCount} tone="danger" />
        </div>

        <CgSectionTitle>Your patients today</CgSectionTitle>

        {loading ? (
          <CgLoading text="Loading your patients…" />
        ) : patients.length === 0 ? (
          <CgEmpty
            icon="🤝"
            title="No patients linked yet"
            message="Ask each patient to approve your caregiver access from their MediusCare portal."
          />
        ) : (
          <div className="cg-grid cg-grid-2">
            {patients.map((p) => {
              const latest = p.latestEntry;
              const bp =
                latest?.systolic && latest?.diastolic ? `${latest.systolic}/${latest.diastolic}` : "—";
              return (
                <CgCard key={p._id} className="cg-patient-card">
                  <div className="cg-patient-card-head">
                    <div>
                      <h3>{p.name}</h3>
                      <p className="cg-patient-card-meta">Dr. {p.assignedDoctor?.name || "Unassigned"}</p>
                    </div>
                    <CgBadge tone={statusTone(p.healthStatus)}>{p.healthStatus}</CgBadge>
                  </div>
                  <div className="cg-patient-vitals">
                    <CgBadge tone="info">BP {bp}</CgBadge>
                    <CgBadge tone="info">Glucose {latest?.glucose ?? "—"}</CgBadge>
                    {p.aiRisk?.riskLevel && <CgBadge tone="neutral">AI {p.aiRisk.riskLevel}</CgBadge>}
                    {p.openAlerts > 0 && <CgBadge tone="danger">{p.openAlerts} alerts</CgBadge>}
                  </div>
                  <CgButton to={`/caregiver/patients?selected=${p._id}`} size="sm">
                    Open health history
                  </CgButton>
                </CgCard>
              );
            })}
          </div>
        )}

        <p className="cg-tip">
          Tip: Patients must approve your link from <strong>Patient → Caregivers</strong> before their data
          appears here.
        </p>
      </div>
    </CaregiverLayout>
  );
}
