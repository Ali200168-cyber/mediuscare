import { useEffect, useState } from "react";
import DoctorLayout from "./DoctorLayout";
import { DrBadge, DrButton, DrEmpty, DrSkeletonGrid, DrAlert, doctorFetch } from "../../components/doctor/DoctorUI";
import "../../styles/Doctor/doctor-pages.css";

export default function DoctorAssignmentRequests() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const load = async () => {
    setLoading(true);
    setStatus("");
    const res = await doctorFetch("/api/v1/doctor-requests/inbox");
    const data = await res.json().catch(() => ({ success: false }));
    if (!data.success) {
      setStatus(data.message || "Failed to load.");
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(data.items || []);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => {
      setStatus("Failed to load.");
      setLoading(false);
    });
  }, []);

  const decide = async (id, decision) => {
    setStatus("");
    const res = await doctorFetch(`/api/v1/doctor-requests/${id}/decision`, {
      method: "PATCH",
      body: JSON.stringify({ decision }),
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (!data.success) {
      setStatus(data.message || "Failed to update.");
      return;
    }
    setItems((prev) => prev.filter((x) => x._id !== id));
  };

  return (
    <DoctorLayout headerActions={<DrButton size="sm" variant="secondary" onClick={load}>Refresh</DrButton>}>
      <div className="md-page">
        {status && <DrAlert tone="error">{status}</DrAlert>}
        {loading ? (
          <DrSkeletonGrid count={3} />
        ) : items.length === 0 ? (
          <DrEmpty title="Inbox empty" message="New patient requests appear here." />
        ) : (
          <div className="md-card-grid">
            {items.map((r) => (
              <article key={r._id} className="md-visit-card">
                <header>
                  <strong>{r.patientId?.name || "Patient"}</strong>
                  <DrBadge tone="warning">New</DrBadge>
                </header>
                <p className="md-visit-meta">{r.patientId?.email || "—"}</p>
                {r.message && <p className="md-visit-meta">{r.message}</p>}
                <footer>
                  <DrButton size="sm" onClick={() => decide(r._id, "accepted")}>
                    Accept
                  </DrButton>
                  <DrButton size="sm" variant="ghost" onClick={() => decide(r._id, "declined")}>
                    Decline
                  </DrButton>
                </footer>
              </article>
            ))}
          </div>
        )}
      </div>
    </DoctorLayout>
  );
}
