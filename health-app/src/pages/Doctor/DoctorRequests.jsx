import { useEffect, useMemo, useState } from "react";
import DoctorLayout from "./DoctorLayout";
import {
  DrPageHeader,
  DrAlert,
  DrBadge,
  DrButton,
  DrEmpty,
  DrSkeletonGrid,
  DrCard,
  doctorFetch,
} from "../../components/doctor/DoctorUI";
import "../../styles/Doctor/doctor-pages.css";
import ZegoCallPanel from "../../components/ZegoCallPanel";

const normalizeStatus = (status = "") => {
  const normalized = String(status).toLowerCase();
  return normalized === "accepted" ? "approved" : normalized;
};

const statusTone = (s) => {
  const v = normalizeStatus(s);
  if (v === "approved") return "success";
  if (v === "pending") return "warning";
  if (v === "rejected") return "danger";
  return "neutral";
};

export default function DoctorRequests() {
  const [items, setItems] = useState([]);
  const [assignedPatients, setAssignedPatients] = useState([]);
  const [zegoStatus, setZegoStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("queue");
  const [showCreate, setShowCreate] = useState(false);
  const [activeCallConsultation, setActiveCallConsultation] = useState(null);
  const [createForm, setCreateForm] = useState({ patientId: "", date: "", time: "" });
  const [rescheduleModal, setRescheduleModal] = useState({
    open: false,
    consultationId: null,
    date: "",
    time: "",
  });

  const getConsultationDateTime = (item) => {
    const dt = new Date(item.date);
    const [hours, minutes] = String(item.time || "00:00").split(":").map((v) => Number.parseInt(v, 10) || 0);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  };

  const canStartSession = (item) => getConsultationDateTime(item) <= new Date();

  const load = async () => {
    const [consultationRes, zegoRes, patientsRes] = await Promise.all([
      doctorFetch("/api/consultation/doctor"),
      doctorFetch("/api/zego/status"),
      doctorFetch("/api/v1/doctor/assigned-patients"),
    ]);
    const consultationData = await consultationRes.json();
    const zegoData = await zegoRes.json();
    const patientsData = await patientsRes.json().catch(() => ({ success: false }));
    if (!consultationData.success) throw new Error();
    setItems(consultationData.items || []);
    if (zegoData?.success) setZegoStatus(zegoData);
    if (patientsData?.success) setAssignedPatients(patientsData.patients || []);
    setLoading(false);
    return consultationData.items || [];
  };

  useEffect(() => {
    load().catch(() => {
      setError("Failed to load consultations.");
      setLoading(false);
    });
  }, []);

  const updateStatus = async (id, status, extra = {}, errorOverride) => {
    const raw = String(status || "").trim();
    const canonicalByLower = {
      pending: "Pending",
      accepted: "Accepted",
      approved: "Accepted",
      rejected: "Rejected",
      completed: "Completed",
    };
    const canonical = canonicalByLower[raw.toLowerCase()] || raw;
    const variants = Array.from(
      new Set([canonical, canonical.toLowerCase(), canonical.charAt(0).toUpperCase() + canonical.slice(1).toLowerCase()]),
    );
    let data = { success: false };
    let statusUsed = canonical;

    for (const candidate of variants) {
      const res = await doctorFetch("/api/consultation/status", {
        method: "PUT",
        body: JSON.stringify({ consultationId: id, status: candidate, ...extra }),
      });
      data = await res.json().catch(() => ({ success: false }));
      if (data.success) {
        statusUsed = candidate;
        break;
      }
    }

    if (!data.success) {
      setError(errorOverride || data.message || "Could not update status.");
      return false;
    }
    setError("");
    setItems((prev) => {
      const nextStatus = String(statusUsed || "").toLowerCase();
      if (nextStatus === "completed" || nextStatus === "rejected") {
        return prev.filter((item) => item._id !== id);
      }
      return prev.map((item) => (item._id === id ? { ...item, status: statusUsed, ...extra } : item));
    });
    load().catch(() => {});
    return true;
  };

  const handleAccept = async (item) => {
    const accepted = await updateStatus(item._id, "Accepted", {}, "Could not accept consultation.");
    if (!accepted) return;
    const nextItems = await load().catch(() => null);
    const updated = Array.isArray(nextItems) ? nextItems.find((x) => x._id === item._id) : null;
    if (updated && !updated.zegoRoomId) {
      await createMeeting(updated);
    }
  };

  const openReschedule = (item) => {
    const day = new Date(item.date);
    setRescheduleModal({
      open: true,
      consultationId: item._id,
      date: day.toISOString().slice(0, 10),
      time: item.time || "09:00",
    });
  };

  const submitReschedule = async (e) => {
    e.preventDefault();
    setError("");
    const { consultationId, date, time } = rescheduleModal;
    const res = await doctorFetch(`/api/consultation/reschedule/${consultationId}`, {
      method: "PUT",
      body: JSON.stringify({ date, time }),
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (!data.success) {
      setError(data.message || "Reschedule failed.");
      return;
    }
    setRescheduleModal({ open: false, consultationId: null, date: "", time: "" });
    await load().catch(() => {});
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    setError("");
    if (!createForm.patientId || !createForm.date || !createForm.time) {
      setError("Select patient, date, and time.");
      return;
    }
    const res = await doctorFetch("/api/consultation/doctor-create", {
      method: "POST",
      body: JSON.stringify(createForm),
    });
    const data = await res.json().catch(() => ({ success: false }));
    if (!data.success) {
      setError(data.message || "Could not create consultation.");
      return;
    }
    setCreateForm({ patientId: "", date: "", time: "" });
    setShowCreate(false);
    await load().catch(() => {});
  };

  const createMeeting = async (item) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const res = await doctorFetch("/api/zego/create-room", {
      method: "POST",
      body: JSON.stringify({
        consultationId: item._id,
        title: `Consultation - ${item.patientId?.name || "Patient"}`,
        date: new Date(item.date).toISOString().slice(0, 10),
        time: item.time,
        duration: Number(item.durationMinutes || 30),
        timezone: item.timezone || tz,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      setError(data.message || "Failed to create video room.");
      return;
    }
    setError("");
    await load();
  };

  const visibleItems = useMemo(
    () =>
      items
        .filter((item) => {
          const s = normalizeStatus(item.status);
          return s === "pending" || s === "approved";
        })
        .filter((item) => {
          const s = normalizeStatus(item.status);
          if (s !== "pending") return true;
          return getConsultationDateTime(item) >= new Date();
        })
        .sort((a, b) => getConsultationDateTime(a) - getConsultationDateTime(b)),
    [items],
  );

  const pendingItems = useMemo(
    () => visibleItems.filter((i) => normalizeStatus(i.status) === "pending"),
    [visibleItems],
  );

  const approvedItems = useMemo(
    () => visibleItems.filter((i) => normalizeStatus(i.status) === "approved"),
    [visibleItems],
  );

  const displayItems = tab === "pending" ? pendingItems : tab === "approved" ? approvedItems : visibleItems;

  const patientOptions = assignedPatients
    .map((item) => {
      const p = item?.patient || item;
      return { id: p?._id || "", name: p?.name || "Patient", email: p?.email || "" };
    })
    .filter((p) => p.id);

  const formatWhen = (item) => {
    const d = new Date(item.date);
    return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${item.time}`;
  };

  const renderCard = (r) => {
    const isPending = normalizeStatus(r.status) === "pending";
    return (
      <article key={r._id} className="md-visit-card">
        <header>
          <div className="dr-consult-patient">
            <span className="dr-avatar-sm">{(r.patientId?.name || "P")[0]}</span>
            <div>
              <strong>{r.patientId?.name || "Patient"}</strong>
              <small>{r.patientId?.email || "—"}</small>
            </div>
          </div>
          <DrBadge tone={statusTone(r.status)}>{isPending ? "Pending" : "Approved"}</DrBadge>
        </header>
        <ul className="dr-consult-meta">
          <li>{formatWhen(r)}</li>
          {r.notes && <li className="dr-consult-notes">{r.notes}</li>}
        </ul>
        <footer>
          {isPending ? (
            <>
              <DrButton size="sm" onClick={() => handleAccept(r)}>Accept</DrButton>
              <DrButton size="sm" variant="secondary" onClick={() => openReschedule(r)}>Reschedule</DrButton>
              <DrButton size="sm" variant="ghost" onClick={() => updateStatus(r._id, "Rejected")}>Decline</DrButton>
            </>
          ) : (
            <>
              {!r.zegoRoomId && (
                <DrButton size="sm" onClick={() => createMeeting(r)}>Create room</DrButton>
              )}
              <DrButton
                size="sm"
                onClick={() => setActiveCallConsultation(r)}
                disabled={!canStartSession(r) || !r.zegoRoomId}
              >
                Start session
              </DrButton>
              <DrButton size="sm" variant="secondary" onClick={() => openReschedule(r)}>Reschedule</DrButton>
              <DrButton size="sm" variant="ghost" onClick={() => updateStatus(r._id, "Completed")}>Complete</DrButton>
            </>
          )}
        </footer>
      </article>
    );
  };

  return (
    <DoctorLayout headerActions={<DrButton variant="secondary" size="sm" onClick={() => load()}>Refresh</DrButton>}>
      <div className="md-page">
        {error && <DrAlert tone="error">{error}</DrAlert>}
        {zegoStatus?.success && zegoStatus.zegoConfigured === false && (
          <DrAlert tone="warning">Video calls unavailable — configure ZEGO on the server.</DrAlert>
        )}

        <section className="md-bento" style={{ marginBottom: 32 }}>
          <article className="md-stat-tile"><DrCard title="Pending" value={pendingItems.length} flat /></article>
          <article className="md-stat-tile"><DrCard title="Approved" value={approvedItems.length} flat /></article>
          <article className="md-stat-tile"><DrCard title="Queue" value={visibleItems.length} flat /></article>
        </section>

        {showCreate && (
          <section className="dr-card dr-consult-create">
            <h3 className="dr-section-title">Schedule visit</h3>
            <form className="dr-consult-form" onSubmit={submitCreate}>
              <label className="dr-field">
                <span className="dr-form-label">Patient</span>
                <select
                  className="dr-input"
                  value={createForm.patientId}
                  onChange={(e) => setCreateForm((p) => ({ ...p, patientId: e.target.value }))}
                  disabled={!patientOptions.length}
                >
                  <option value="">{patientOptions.length ? "Select patient" : "No assigned patients"}</option>
                  {patientOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dr-field">
                <span className="dr-form-label">Date</span>
                <input
                  className="dr-input"
                  type="date"
                  value={createForm.date}
                  onChange={(e) => setCreateForm((p) => ({ ...p, date: e.target.value }))}
                />
              </label>
              <label className="dr-field">
                <span className="dr-form-label">Time</span>
                <input
                  className="dr-input"
                  type="time"
                  value={createForm.time}
                  onChange={(e) => setCreateForm((p) => ({ ...p, time: e.target.value }))}
                />
              </label>
              <DrButton type="submit">Create</DrButton>
            </form>
          </section>
        )}

        <div className="dr-tabs dr-consult-tabs">
          {[
            { id: "queue", label: `All (${visibleItems.length})` },
            { id: "pending", label: `Pending (${pendingItems.length})` },
            { id: "approved", label: `Approved (${approvedItems.length})` },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`dr-tab${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <DrSkeletonGrid count={3} />
        ) : displayItems.length === 0 ? (
          <DrEmpty icon="📅" title="No consultations" message="New requests will appear here." />
        ) : (
          <div className="md-card-grid">{displayItems.map(renderCard)}</div>
        )}

        {activeCallConsultation && (
          <ZegoCallPanel consultation={activeCallConsultation} onClose={() => setActiveCallConsultation(null)} />
        )}

        {rescheduleModal.open && (
          <div className="dr-modal-overlay" onClick={() => setRescheduleModal({ open: false, consultationId: null, date: "", time: "" })}>
            <div className="dr-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Reschedule</h3>
              <form onSubmit={submitReschedule}>
                <label className="dr-field">
                  <span className="dr-form-label">Date</span>
                  <input
                    className="dr-input"
                    type="date"
                    value={rescheduleModal.date}
                    onChange={(e) => setRescheduleModal((p) => ({ ...p, date: e.target.value }))}
                    required
                  />
                </label>
                <label className="dr-field">
                  <span className="dr-form-label">Time</span>
                  <input
                    className="dr-input"
                    type="time"
                    value={rescheduleModal.time}
                    onChange={(e) => setRescheduleModal((p) => ({ ...p, time: e.target.value }))}
                    required
                  />
                </label>
                <div className="dr-modal-actions">
                  <DrButton type="submit">Save</DrButton>
                  <DrButton variant="ghost" type="button" onClick={() => setRescheduleModal({ open: false, consultationId: null, date: "", time: "" })}>
                    Cancel
                  </DrButton>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DoctorLayout>
  );
}

