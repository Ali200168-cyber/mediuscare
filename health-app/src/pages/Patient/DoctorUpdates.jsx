import { useEffect, useMemo, useState } from "react";
import PatientLayout from "./PatientLayout";
import {
  PtPageHeader,
  PtCard,
  PtBadge,
  PtButton,
  PtAlert,
  PtEmpty,
  PtSkeletonGrid,
  patientFetch,
} from "../../components/patient/PatientUI";

const DoctorUpdates = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [fbRes, aiRes] = await Promise.all([
        patientFetch("/api/doctor/my-feedback?limit=100").then((r) => r.json()),
        patientFetch("/api/ai/history?limit=100&page=1").then((r) => r.json()),
      ]);
      if (!fbRes.success || !aiRes.success) throw new Error();
      setFeedbackItems(fbRes.items || []);
      setReviewItems(
        (aiRes.items || [])
          .filter((item) => ["approved", "rejected", "modified"].includes(String(item.reviewStatus || "").toLowerCase()))
          .map((item) => {
            const mod = (item.output || []).find((m) => m?.doctor_review_status || m?.doctor_review_notes) || null;
            return {
              _id: item._id,
              decision: mod?.doctor_review_status || item.reviewStatus,
              notes: mod?.doctor_review_notes || item.reviewNotes || "",
              suggestion: mod?.doctor_suggestion || "",
              reviewedAt: item.reviewedAt || item.createdAt,
              aiDose: mod?.prediction?.suggested_dose_units ?? null,
            };
          }),
      );
    } catch {
      setError("Could not load updates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const timeline = useMemo(() => {
    const fb = feedbackItems.map((item) => ({ type: "feedback", time: new Date(item.createdAt).getTime(), item }));
    const rv = reviewItems.map((item) => ({ type: "decision", time: new Date(item.reviewedAt).getTime(), item }));
    return [...fb, ...rv].sort((a, b) => b.time - a.time);
  }, [feedbackItems, reviewItems]);

  const decisionTone = (d) => {
    const v = String(d).toLowerCase();
    if (v === "approved") return "success";
    if (v === "rejected") return "danger";
    return "warning";
  };

  return (
    <PatientLayout>
      <PtPageHeader
        title="Doctor updates"
        actions={<PtButton variant="secondary" size="sm" onClick={loadData} disabled={loading}>Refresh</PtButton>}
      />
      {error && <PtAlert tone="error">{error}</PtAlert>}

      <div className="pt-grid pt-grid-3 pt-section">
        <PtCard title="Feedback" value={feedbackItems.length} flat />
        <PtCard title="Dosage reviews" value={reviewItems.length} flat />
        <PtCard title="Total" value={timeline.length} flat />
      </div>

      {loading ? (
        <PtSkeletonGrid count={2} />
      ) : timeline.length === 0 ? (
        <PtEmpty title="No updates yet" message="Feedback and AI decisions from your doctor appear here." />
      ) : (
        timeline.map((entry) =>
          entry.type === "feedback" ? (
            <PtCard key={`fb-${entry.item._id}`} flat style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <PtBadge tone="info">Feedback</PtBadge>
                <small style={{ color: "var(--pt-muted)" }}>{new Date(entry.item.createdAt).toLocaleString()}</small>
              </div>
              <p style={{ margin: "0 0 8px", fontWeight: 600 }}>{entry.item.doctorId?.name || "Doctor"}</p>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--pt-muted)" }}>{entry.item.notes}</p>
              {entry.item.diagnosis && <p style={{ marginTop: 8, fontSize: "0.85rem" }}>{entry.item.diagnosis}</p>}
            </PtCard>
          ) : (
            <PtCard key={`rv-${entry.item._id}`} flat style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <PtBadge tone={decisionTone(entry.item.decision)}>{entry.item.decision}</PtBadge>
                <small style={{ color: "var(--pt-muted)" }}>{new Date(entry.item.reviewedAt).toLocaleString()}</small>
              </div>
              {entry.item.aiDose != null && <p style={{ margin: "0 0 6px" }}>Dose: {entry.item.aiDose} units</p>}
              {entry.item.notes && <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--pt-muted)" }}>{entry.item.notes}</p>}
              {entry.item.suggestion && <p style={{ marginTop: 6, fontSize: "0.85rem" }}>{entry.item.suggestion}</p>}
            </PtCard>
          ),
        )
      )}
    </PatientLayout>
  );
};

export default DoctorUpdates;
