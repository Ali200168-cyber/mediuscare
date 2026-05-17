import React, { useEffect, useState } from "react";
import PatientLayout from "./PatientLayout";
import { PtPageHeader, PtCard, PtButton, PtBadge, PtAlert } from "../../components/patient/PatientUI";
import { HiOutlineVideoCamera, HiOutlineCalendar, HiOutlineUser } from "react-icons/hi2";
import "../../styles/Patient/patient-pages.css";
import { API_URL } from "../../config/api";
import ZegoCallPanel from "../../components/ZegoCallPanel";

export default function Consultation() {
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [selectedDoctor, setSelectedDoctor] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [assignedDoctor, setAssignedDoctor] = useState(null);
  const [activeCallConsultation, setActiveCallConsultation] = useState(null);

  const token = localStorage.getItem("token");

  const fetchWithAuth = (url, options = {}) =>
    fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  const loadAssignedDoctor = async () => {
    const res = await fetchWithAuth(`${API_URL}/api/v1/patient/assigned-doctor`);
    const data = await res.json();
    if (data.success) {
      setAssignedDoctor(data.doctor || null);
      if (data.doctor?._id) setSelectedDoctor(data.doctor._id);
    }
  };

  const loadDoctors = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/doctors`);
      const data = await res.json();
      setDoctors(data.success ? data.doctors || [] : []);
    } catch {
      setDoctors([]);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const loadAppointments = async () => {
    try {
      const res = await fetchWithAuth(`${API_URL}/api/consultation/patient`);
      const data = await res.json();
      setAppointments(data.success ? data.items || [] : []);
    } catch {
      setAppointments([]);
    } finally {
      setLoadingAppointments(false);
    }
  };

  useEffect(() => {
    Promise.all([loadDoctors(), loadAssignedDoctor(), loadAppointments()]).catch(() => {});
  }, []);

  const handleBooking = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!selectedDoctor || !date || !time) {
      setMessage("Please select doctor, date and time.");
      return;
    }

    const now = new Date();
    const selectedDate = new Date(`${date}T00:00:00`);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (Number.isNaN(selectedDate.getTime()) || selectedDate < today) {
      setMessage("Please enter a valid future date");
      return;
    }

    const selectedDateTime = new Date(`${date}T${time}:00`);
    if (selectedDate.toDateString() === today.toDateString() && selectedDateTime <= now) {
      setMessage("Please select a valid future time");
      return;
    }

    try {
      const res = await fetchWithAuth(`${API_URL}/api/consultation/request`, {
        method: "POST",
        body: JSON.stringify({
          doctorId: selectedDoctor,
          date,
          time,
          notes,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setMessage("Consultation request submitted with Pending status.");
        setDate("");
        setTime("");
        setNotes("");
        await loadAppointments();
      } else {
        setMessage(data.message || "Failed to submit consultation request.");
      }
    } catch {
      setMessage("Server error while requesting consultation.");
    }
  };

  const statusClass = (status = "") => String(status).toLowerCase();
  const now = new Date();
  const minDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const minTimeToday = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const parseDateTime = (item) => {
    const dt = new Date(item.date);
    const [h, m] = String(item.time || "00:00").split(":").map((v) => Number.parseInt(v, 10) || 0);
    dt.setHours(h, m, 0, 0);
    return dt;
  };

  const activeMeeting = appointments.find((a) => a.status === "Accepted" && a.zegoLink);
  const activeMeetingIsJoinable = Boolean(activeMeeting?.zegoLink && activeMeeting?.meetingProvider === "zego");
  const pendingAppointments = appointments.filter((a) => a.status === "Pending");
  const upcomingMeeting = appointments
    .filter((a) => a.status === "Accepted")
    .map((a) => ({ ...a, _dt: parseDateTime(a) }))
    .sort((a, b) => a._dt - b._dt)
    .find((a) => a._dt >= new Date());
  const isJoinNow =
    Boolean(upcomingMeeting?.zegoLink) &&
    Math.abs(parseDateTime(upcomingMeeting).getTime() - Date.now()) <= 15 * 60 * 1000;
  const isTodaySelected = date === minDate;

  return (
    <PatientLayout>
      <div className={`consultation-page ${activeCallConsultation ? "in-call" : ""}`}>
        <PtPageHeader title="Visits" subtitle="Book and join consultations" />
        <div className="page-header" style={{ display: "none" }}>
          <h1>Consultation</h1>
          {upcomingMeeting && (
            <div className={`reminder-banner ${isJoinNow ? "join-now" : ""}`}>
              <div>
                <strong>Upcoming Consultation</strong>
                <p>
                  {new Date(upcomingMeeting.date).toLocaleDateString()} at {upcomingMeeting.time}
                </p>
              </div>
              {isJoinNow ? (
                <button className="consult-btn consult-btn-primary pulse" onClick={() => setActiveCallConsultation(upcomingMeeting)}>
                  Join Now
                </button>
              ) : (
                <span className="reminder-tag">Scheduled</span>
              )}
            </div>
          )}
        </div>

        <div className="pt-consult-grid">
         
          <PtCard className="pt-consult-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <HiOutlineVideoCamera style={{ fontSize: "1.25rem", color: "var(--pt-primary)" }} />
              <h2>Video call</h2>
            </div>
            {activeMeetingIsJoinable ? (
              <div className="coming-soon-box">
                <span className="coming-soon-badge">Meeting Ready</span>
                <p className="coming-soon-text">
                  Time: {new Date(activeMeeting.date).toLocaleDateString()} • {activeMeeting.time}
                </p>
                <button className="consult-btn consult-btn-primary" onClick={() => setActiveCallConsultation(activeMeeting)}>
                  Join Zego Call →
                </button>
              </div>
            ) : (
              <div className="coming-soon-box">
                <span className="coming-soon-badge">{activeMeeting?.zegoLink ? "Meeting Not Ready" : "Pending"}</span>
                <p className="coming-soon-text">
                  {activeMeeting?.zegoLink
                    ? "Doctor must recreate a real ZEGOCLOUD room link (current link is invalid)."
                    : "Doctor will assign time and generate meeting link after approval."}
                </p>
              </div>
            )}
          </PtCard>

          <PtCard className="pt-consult-card">
            <div className="card-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <HiOutlineCalendar style={{ fontSize: "1.25rem", color: "var(--pt-primary)" }} />
              <h2>Book visit</h2>
            </div>

            {loadingDoctors ? (
              <div className="skeleton-stack">
                <div className="skeleton-line" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
                <div className="skeleton-btn" />
              </div>
            ) : doctors.length === 0 ? (
              <div className="coming-soon-box">
                <span className="coming-soon-badge">No Doctors Available</span>
              </div>
            ) : (
              <form className="booking-form" onSubmit={handleBooking}>
                <label>Select Doctor:</label>
                <select value={selectedDoctor} onChange={(e) => setSelectedDoctor(e.target.value)}>
                  <option value="">-- Select --</option>
                  {doctors.map((doc) => (
                    <option key={doc._id} value={doc._id}>
                      {doc.name} ({doc.specialization})
                    </option>
                  ))}
                </select>

                <label>Date:</label>
                <input type="date" min={minDate} value={date} onChange={e => setDate(e.target.value)} />

                <label>Time:</label>
                <input type="time" min={isTodaySelected ? minTimeToday : undefined} value={time} onChange={e => setTime(e.target.value)} />

                <label>Notes (optional):</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add consultation notes"
                />

                <button type="submit">Request Consultation</button>
              </form>
            )}

            {message && <p className="booking-msg">{message}</p>}
          </PtCard>

          <div className="consult-card pt-consult-card">
            <div className="card-header">
              <HiOutlineUser style={{ fontSize: "1.25rem", color: "var(--pt-primary)" }} />
              <h2>Your Assigned Doctor</h2>
            </div>
            <div className="doctor-box">
              {assignedDoctor ? (
                <>
                  <p><strong>{assignedDoctor.name}</strong></p>
                  <p>{assignedDoctor.specialization}</p>
                  <p>Email: {assignedDoctor.email}</p>
                </>
              ) : (
                <p className="muted">No doctor assigned yet. Awaiting approval.</p>
              )}
            </div>
          </div>
        </div>

        <div className="consult-card" style={{ marginTop: "14px" }}>
          <div className="card-header">
            <HiOutlineCalendar style={{ fontSize: "1.25rem", color: "var(--pt-primary)" }} />
            <h2>Upcoming Appointments</h2>
          </div>
          {loadingAppointments ? (
            <div className="appointments-list">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="appointment-card skeleton-card" />
              ))}
            </div>
          ) : pendingAppointments.length === 0 ? (
            <p className="muted">No pending consultation appointments found.</p>
          ) : (
            <div className="appointments-list">
              {pendingAppointments.map((item) => (
                <div key={item._id} className="appointment-card">
                  <div className="appointment-top">
                    <h3>{item.doctorId?.name || "Assigned doctor"}</h3>
                    <span className={`status-badge ${statusClass(item.status)}`}>{item.status}</span>
                  </div>
                  <p className="appointment-meta"><strong>Date:</strong> {new Date(item.date).toLocaleDateString()}</p>
                  <p className="appointment-meta"><strong>Time:</strong> {item.time}</p>
                  <p className="appointment-meta"><strong>Notes:</strong> {item.notes || "—"}</p>
                  {item.zegoLink && item.status === "Accepted" && item.meetingProvider === "zego" && (
                    <button className="consult-btn consult-btn-primary" onClick={() => setActiveCallConsultation(item)}>
                      Join Meeting
                    </button>
                  )}
                  {item.zegoLink && item.status === "Accepted" && item.meetingProvider !== "zego" && (
                    <p className="muted">Meeting link is invalid. Waiting for doctor to recreate a real ZEGOCLOUD room.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {activeCallConsultation && (
        <ZegoCallPanel consultation={activeCallConsultation} onClose={() => setActiveCallConsultation(null)} />
      )}
    </PatientLayout>
  );
}
