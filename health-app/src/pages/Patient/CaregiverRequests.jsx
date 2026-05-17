import { useEffect, useState } from "react";
import PatientLayout from "./PatientLayout";
import {
  PtPageHeader,
  PtCard,
  PtButton,
  PtBadge,
  PtAlert,
  PtEmpty,
  patientFetch,
} from "../../components/patient/PatientUI";

const CaregiverRequests = () => {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    const data = await patientFetch("/api/patient/caregiver-requests").then((r) => r.json());
    if (!data.success) throw new Error();
    setItems(data.items || []);
  };

  useEffect(() => {
    load().catch(() => setError("Load failed"));
  }, []);

  const update = async (requestId, nextStatus) => {
    setError("");
    try {
      const data = await patientFetch("/api/caregiver/request/status", {
        method: "PUT",
        body: JSON.stringify({ requestId, status: nextStatus }),
      }).then((r) => r.json());
      if (!data.success) throw new Error();
      setStatus(`Request ${nextStatus.toLowerCase()}`);
      setItems((prev) => prev.map((i) => (i._id === requestId ? data.item : i)));
    } catch {
      setError("Update failed");
    }
  };

  const tone = (s) => {
    const v = String(s).toLowerCase();
    if (v === "approved") return "success";
    if (v === "rejected") return "danger";
    return "warning";
  };

  return (
    <PatientLayout>
      <PtPageHeader title="Caregivers" subtitle="Manage who can view your health data" />
      {error && <PtAlert tone="error">{error}</PtAlert>}
      {status && <PtAlert tone="success">{status}</PtAlert>}

      {items.length === 0 ? (
        <PtEmpty icon="👥" title="No requests" message="Caregiver invitations appear here." />
      ) : (
        items.map((req) => (
          <PtCard key={req._id} flat style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div>
              <strong>{req.caregiverId?.name || "Caregiver"}</strong>
              <p style={{ margin: 4, fontSize: "0.85rem", color: "var(--pt-muted)" }}>{req.caregiverId?.email}</p>
              <PtBadge tone={tone(req.status)}>{req.status}</PtBadge>
            </div>
            {String(req.status).toLowerCase() === "pending" && (
              <div style={{ display: "flex", gap: 8 }}>
                <PtButton variant="primary" size="sm" onClick={() => update(req._id, "Approved")}>Approve</PtButton>
                <PtButton variant="secondary" size="sm" onClick={() => update(req._id, "Rejected")}>Decline</PtButton>
              </div>
            )}
          </PtCard>
        ))
      )}
    </PatientLayout>
  );
};

export default CaregiverRequests;
