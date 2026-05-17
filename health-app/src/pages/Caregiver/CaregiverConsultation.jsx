import { useEffect, useState } from "react";
import CaregiverLayout from "./CaregiverLayout";
import {
  CgHero,
  CgButton,
  CgAlert,
  CgEmpty,
  CgLoading,
  caregiverFetch,
} from "../../components/caregiver/CaregiverUI";

export default function CaregiverConsultation() {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    caregiverFetch("/api/caregiver/patients")
      .then((r) => r.json())
      .then((data) => {
        const list = data.patients || [];
        setPatients(list);
        if (list[0]) setPatientId(String(list[0]._id));
      })
      .catch(() => setError("Failed to load patients"))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!patientId || !date || !time) {
      setError("Please select patient, date, and time.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await caregiverFetch("/api/caregiver/consultation/request", {
        method: "POST",
        body: JSON.stringify({ patientId, date, time, notes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Request failed");
      setSuccess("Consultation request sent to the patient's doctor.");
      setNotes("");
    } catch (e) {
      setError(e.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  const selected = patients.find((p) => String(p._id) === patientId);

  return (
    <CaregiverLayout>
      <div className="cg-page">
        <CgHero
          variant="soft"
          eyebrow="On their behalf"
          title="Request a consultation"
          subtitle="Schedule time with your patient's doctor when they need clinical guidance."
        />

        {error && <CgAlert tone="error">{error}</CgAlert>}
        {success && <CgAlert tone="success">{success}</CgAlert>}

        {loading ? (
          <CgLoading />
        ) : patients.length === 0 ? (
          <CgEmpty title="No patients" message="Link a patient before requesting consultations." />
        ) : (
          <div className="cg-form-panel">
            <form onSubmit={submit} className="cg-form-stack">
              <div className="cg-field">
                <label htmlFor="cg-consult-patient">Patient</label>
                <select
                  id="cg-consult-patient"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  required
                >
                  {patients.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <p className="cg-hint">
                  Doctor: <strong>{selected.assignedDoctor?.name || "None assigned"}</strong>
                </p>
              )}

              <div className="cg-grid cg-grid-2">
                <div className="cg-field">
                  <label htmlFor="cg-consult-date">Date</label>
                  <input
                    id="cg-consult-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
                <div className="cg-field">
                  <label htmlFor="cg-consult-time">Time</label>
                  <input
                    id="cg-consult-time"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="cg-field">
                <label htmlFor="cg-consult-notes">Reason / notes</label>
                <textarea
                  id="cg-consult-notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why is this consultation needed?"
                />
              </div>

              <CgButton type="submit" disabled={submitting || !selected?.assignedDoctor}>
                {submitting ? "Sending request…" : "Submit consultation request"}
              </CgButton>

              {selected && !selected.assignedDoctor && (
                <CgAlert tone="error">This patient has no assigned doctor yet.</CgAlert>
              )}
            </form>
          </div>
        )}
      </div>
    </CaregiverLayout>
  );
}
