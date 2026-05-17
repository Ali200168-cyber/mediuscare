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

const DoctorRequest = () => {
  const [doctors, setDoctors] = useState([]);
  const [requests, setRequests] = useState([]);
  const [doctorId, setDoctorId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");

  const load = async () => {
    const [d, r] = await Promise.all([
      patientFetch("/api/doctors").then((x) => x.json()),
      patientFetch("/api/v1/doctor-requests/me").then((x) => x.json()),
    ]);
    if (d.success) setDoctors(d.doctors || []);
    if (r.success) setRequests(r.items || []);
  };

  useEffect(() => {
    load().catch(() => setStatus("Load failed"));
  }, []);

  const submit = async () => {
    setStatus("");
    if (!doctorId) return setStatus("Select a doctor");
    const data = await patientFetch("/api/v1/doctor-requests", {
      method: "POST",
      body: JSON.stringify({ doctorId, message }),
    }).then((x) => x.json());
    if (!data.success) return setStatus(data.message || "Request failed");
    setStatus("Sent");
    setDoctorId("");
    setMessage("");
    await load();
  };

  const tone = (s) => {
    const v = String(s).toLowerCase();
    if (v === "approved" || v === "accepted") return "success";
    if (v === "rejected") return "danger";
    return "warning";
  };

  return (
    <PatientLayout>
      <PtPageHeader title="Find a doctor" />
      {status && <PtAlert tone={status === "Sent" ? "success" : "error"}>{status}</PtAlert>}

      <PtCard className="pt-section">
        <h2 className="pt-section-title">New request</h2>
        <label className="pt-field">
          <span className="pt-form-label">Doctor</span>
          <select className="pt-select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">Choose…</option>
            {doctors.map((d) => (
              <option key={d._id} value={d._id}>{d.name} · {d.specialization || "General"}</option>
            ))}
          </select>
        </label>
        <label className="pt-field">
          <span className="pt-form-label">Note (optional)</span>
          <input className="pt-input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Short message" />
        </label>
        <PtButton variant="primary" onClick={submit}>Send request</PtButton>
      </PtCard>

      <section className="pt-section">
        <h2 className="pt-section-title">Your requests</h2>
        {requests.length === 0 ? (
          <PtEmpty title="No requests" message="Send a request to connect with a doctor." />
        ) : (
          requests.map((r) => (
            <div key={r._id} className="pt-card pt-card-flat pt-list-item" style={{ marginBottom: 8 }}>
              <div>
                <strong>{r.doctorId?.name || "Doctor"}</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--pt-muted)" }}>{r.message || "—"}</p>
              </div>
              <PtBadge tone={tone(r.status)}>{r.status}</PtBadge>
            </div>
          ))
        )}
      </section>
    </PatientLayout>
  );
};

export default DoctorRequest;
