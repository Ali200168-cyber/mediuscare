import { useEffect, useState } from "react";
import CaregiverLayout from "./CaregiverLayout";
import {
  CgHero,
  CgCard,
  CgBadge,
  CgButton,
  CgAlert,
  CgEmpty,
  CgLoading,
  CgSectionTitle,
  caregiverFetch,
} from "../../components/caregiver/CaregiverUI";

const reviewTone = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "approved") return "success";
  if (v === "rejected") return "danger";
  if (v === "modified") return "warning";
  return "neutral";
};

const asText = (value) => {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
  }
  return String(value);
};

export default function CaregiverFeedback() {
  const [feedback, setFeedback] = useState([]);
  const [aiItems, setAiItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await caregiverFetch("/api/caregiver/feedback");
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load feedback");
      setFeedback(data.feedback || []);
      setAiItems(data.aiRecommendations || []);
    } catch (e) {
      setError(e.message || "Failed to load feedback");
      setFeedback([]);
      setAiItems([]);
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
          variant="soft"
          eyebrow="Clinical updates"
          title="Doctor feedback"
          subtitle="Read-only notes and AI dosage decisions from physicians caring for your patients."
          actions={
            <CgButton variant="secondary" size="sm" onClick={load} disabled={loading}>
              Refresh
            </CgButton>
          }
        />

        {error && <CgAlert tone="error">{error}</CgAlert>}

        {loading ? (
          <CgLoading text="Loading feedback…" />
        ) : feedback.length === 0 && aiItems.length === 0 ? (
          <CgEmpty title="No feedback yet" message="Doctor notes and AI reviews will appear here." />
        ) : (
          <>
            <section className="cg-feedback-section">
              <CgSectionTitle>Doctor notes</CgSectionTitle>
              {feedback.length === 0 ? (
                <p className="cg-hint">No doctor feedback yet.</p>
              ) : (
                <div className="cg-grid" style={{ gap: 14 }}>
                  {feedback.map((f) => (
                    <CgCard key={f._id} flat className="cg-feedback-card">
                      <div className="cg-feedback-head">
                        <strong>{f.patientName}</strong>
                        <CgBadge tone="info">{f.doctorName}</CgBadge>
                        <time>{new Date(f.createdAt).toLocaleString()}</time>
                      </div>
                      {f.diagnosis && <p style={{ fontWeight: 600, margin: "0 0 8px" }}>{f.diagnosis}</p>}
                      {f.notes && <p style={{ margin: 0, color: "var(--cg-text-2)" }}>{f.notes}</p>}
                      {asText(f.recommendations) && (
                        <p className="cg-hint" style={{ marginTop: 10 }}>
                          <strong>Recommendations:</strong> {asText(f.recommendations)}
                        </p>
                      )}
                    </CgCard>
                  ))}
                </div>
              )}
            </section>

            <section className="cg-feedback-section">
              <CgSectionTitle>AI dosage recommendations</CgSectionTitle>
              {aiItems.length === 0 ? (
                <p className="cg-hint">No AI recommendations yet.</p>
              ) : (
                <div className="cg-grid" style={{ gap: 14 }}>
                  {aiItems.map((item) => (
                    <CgCard key={item._id} flat className="cg-feedback-card cg-feedback-card--ai">
                      <div className="cg-feedback-head">
                        <strong>{item.patientName}</strong>
                        <CgBadge tone={reviewTone(item.reviewStatus)}>{item.reviewStatus || "pending"}</CgBadge>
                        {item.riskLevel && <CgBadge tone="neutral">Risk: {item.riskLevel}</CgBadge>}
                      </div>
                      {item.suggestedDose != null && (
                        <p style={{ margin: "0 0 8px" }}>
                          Suggested dose: <strong>{item.suggestedDose} units</strong>
                        </p>
                      )}
                      {asText(item.reviewNotes) && (
                        <p style={{ margin: 0, color: "var(--cg-text-2)" }}>{asText(item.reviewNotes)}</p>
                      )}
                      {item.reviewedBy && (
                        <p className="cg-hint" style={{ marginTop: 8 }}>
                          Reviewed by {item.reviewedBy}
                          {item.reviewedAt ? ` · ${new Date(item.reviewedAt).toLocaleString()}` : ""}
                        </p>
                      )}
                    </CgCard>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </CaregiverLayout>
  );
}
