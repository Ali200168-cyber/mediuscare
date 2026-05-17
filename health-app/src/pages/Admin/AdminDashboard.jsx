import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config/api";
import AdminLayout from "./AdminLayout";
import {
  AdHero,
  AdStat,
  AdSection,
  AdPanel,
  AdAlert,
  AdEmpty,
  AdButton,
} from "../../components/admin/AdminUI";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [pendingDoctorVerifications, setPendingDoctorVerifications] = useState([]);
  const [assign, setAssign] = useState({ patientId: "", doctorId: "" });
  const [logs, setLogs] = useState([]);
  const [consultations, setConsultations] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/api/v1/admin/users`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/api/v1/admin/system-logs`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/api/v1/admin/assignment/bootstrap`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/api/consultation/details`, { headers }).then((r) => r.json()),
      fetch(`${API_URL}/api/v1/admin/doctor-verifications/pending`, { headers }).then((r) => r.json()),
    ])
      .then(([u, l, a, c, v]) => {
        if (!u.success || !l.success || !a.success || !c.success || !v.success) throw new Error("Unable to load admin data");
        setUsers(u.items || []);
        setLogs(l.items || []);
        setDoctors(a.doctors || []);
        setPatients(a.patients || []);
        setConsultations(c.items || []);
        setPendingDoctorVerifications(v.items || []);
      })
      .catch(() => setError("Failed to load admin panel data."));
  }, []);

  const counts = useMemo(
    () => ({
      total: users.length,
      patients: users.filter((u) => u.role === "patient").length,
      doctors: users.filter((u) => u.role === "doctor").length,
      caregivers: users.filter((u) => u.role === "caregiver").length,
      pending: pendingDoctorVerifications.length,
    }),
    [users, pendingDoctorVerifications],
  );

  const reviewDoctorVerification = async (doctorId, decision) => {
    try {
      setError("");
      setInfo("");
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/v1/admin/doctor-verifications/${doctorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!data.success) return setError(data.message || "Failed to update doctor verification.");
      setUsers((prev) => prev.map((u) => (u._id === doctorId ? data.item : u)));
      setDoctors((prev) => {
        const exists = prev.some((d) => d._id === doctorId);
        if (decision === "approve" && !exists) {
          return [{ _id: data.item._id, name: data.item.name, email: data.item.email, specialization: data.item.specialization }, ...prev];
        }
        return prev;
      });
      setPendingDoctorVerifications((prev) => prev.filter((item) => item._id !== doctorId));
      setInfo(`Doctor verification ${decision === "approve" ? "approved" : "rejected"} successfully.`);
    } catch {
      setError("Failed to update doctor verification.");
    }
  };

  const assignDoctor = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/v1/admin/assignment/assign-doctor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(assign),
      });
      const data = await res.json();
      if (!data.success) return setError(data.message || "Assignment failed");
      setError("");
      setInfo("Doctor assigned to patient successfully.");
      setPatients((prev) =>
        prev.map((p) => (p._id === data.patient._id ? { ...p, assignedDoctor: data.doctor._id } : p)),
      );
    } catch {
      setError("Assignment failed");
    }
  };

  const deleteUser = async (user) => {
    const ok = window.confirm(`Delete user "${user.name}" (${user.email})? This action cannot be undone.`);
    if (!ok) return;
    try {
      setError("");
      setInfo("");
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/v1/admin/users/${user._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) return setError(data.message || "Failed to delete user.");
      setUsers((prev) => prev.filter((u) => u._id !== user._id));
      setPatients((prev) => prev.filter((p) => p._id !== user._id));
      setDoctors((prev) => prev.filter((d) => d._id !== user._id));
      setInfo("User deleted successfully.");
    } catch {
      setError("Failed to delete user.");
    }
  };

  const toggleUserStatus = async (user) => {
    try {
      setError("");
      setInfo("");
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/v1/admin/users/${user._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      const data = await res.json();
      if (!data.success) return setError(data.message || "Failed to update account status.");
      setUsers((prev) => prev.map((u) => (u._id === user._id ? data.item : u)));
      setPatients((prev) => prev.map((u) => (u._id === user._id ? data.item : u)));
      setDoctors((prev) => prev.map((u) => (u._id === user._id ? data.item : u)));
      setInfo(`Account ${data.item.isActive ? "activated" : "suspended"} successfully.`);
    } catch {
      setError("Failed to update account status.");
    }
  };

  const updateUserRole = async (user, role) => {
    try {
      setError("");
      setInfo("");
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_URL}/api/v1/admin/users/${user._id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!data.success) return setError(data.message || "Failed to update role.");
      setUsers((prev) => prev.map((u) => (u._id === user._id ? data.item : u)));
      setPatients((prev) => prev.map((u) => (u._id === user._id ? data.item : u)));
      setDoctors((prev) => prev.map((u) => (u._id === user._id ? data.item : u)));
      setInfo("User role updated successfully.");
    } catch {
      setError("Failed to update role.");
    }
  };

  const handleSignOut = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {}
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("role");
    navigate("/login");
  };

  return (
    <AdminLayout onSignOut={handleSignOut}>
      <div className="ad-page">
        <AdHero
          eyebrow="Platform admin"
          title="MediusCare Control Center"
          subtitle="Manage accounts, doctor verifications, patient–doctor assignments, and system activity from one command dashboard."
        />

        {error && <AdAlert tone="error">{error}</AdAlert>}
        {info && <AdAlert tone="info">{info}</AdAlert>}

        <AdSection id="overview" title="Overview" desc="Live counts across the platform." badge="Dashboard">
          <div className="ad-stats">
            <AdStat label="Total users" value={counts.total} tone="accent" />
            <AdStat label="Patients" value={counts.patients} />
            <AdStat label="Doctors" value={counts.doctors} />
            <AdStat label="Caregivers" value={counts.caregivers} />
            <AdStat label="Pending verifications" value={counts.pending} tone="warn" />
          </div>
        </AdSection>

        <AdSection
          id="operations"
          title="Operations"
          desc="Assign doctors and review credential submissions."
          badge="Clinical"
        >
          <div className="ad-panel-grid">
            <AdPanel title="Doctor assignment">
              <div className="ad-form-row">
                <select
                  value={assign.patientId}
                  onChange={(e) => setAssign((p) => ({ ...p, patientId: e.target.value }))}
                >
                  <option value="">Select patient</option>
                  {patients.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.email})
                    </option>
                  ))}
                </select>
                <select value={assign.doctorId} onChange={(e) => setAssign((p) => ({ ...p, doctorId: e.target.value }))}>
                  <option value="">Select doctor</option>
                  {doctors.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} ({d.specialization || "Doctor"})
                    </option>
                  ))}
                </select>
                <AdButton onClick={assignDoctor} disabled={!assign.patientId || !assign.doctorId}>
                  Assign doctor
                </AdButton>
              </div>
            </AdPanel>

            <AdPanel title="Doctor verification queue">
              {pendingDoctorVerifications.length === 0 ? (
                <AdEmpty message="No pending doctor verifications." />
              ) : (
                pendingDoctorVerifications.map((doctor) => (
                  <div key={doctor._id} className="ad-verify-row">
                    <span>{doctor.name}</span>
                    <span>{doctor.specialization || "Doctor"}</span>
                    <span>{doctor.email}</span>
                    <a href={`${API_URL}${doctor.doctorProofFilePath}`} target="_blank" rel="noreferrer">
                      {doctor.doctorProofOriginalName || "View proof"}
                    </a>
                    <AdButton variant="success" onClick={() => reviewDoctorVerification(doctor._id, "approve")}>
                      Approve
                    </AdButton>
                    <AdButton variant="danger" onClick={() => reviewDoctorVerification(doctor._id, "reject")}>
                      Reject
                    </AdButton>
                  </div>
                ))
              )}
            </AdPanel>
          </div>
        </AdSection>

        <AdSection
          id="users"
          title="User management"
          desc="Roles, account status, and removal (showing up to 12 users)."
          badge="Accounts"
        >
          <AdPanel>
            <div className="ad-table">
              <div className="ad-table-row ad-table-row--head">
                <span>Name</span>
                <span>Role</span>
                <span>Email</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              {users.slice(0, 12).map((user) => (
                <div key={user._id} className="ad-table-row">
                  <span>{user.name}</span>
                  <select
                    value={user.role}
                    onChange={(e) => updateUserRole(user, e.target.value)}
                    disabled={user.role === "admin"}
                    title={user.role === "admin" ? "Admin role cannot be changed" : "Update role"}
                  >
                    <option value="patient">patient</option>
                    <option value="doctor">doctor</option>
                    <option value="caregiver">caregiver</option>
                    <option value="admin">admin</option>
                  </select>
                  <span>{user.email}</span>
                  <span>{user.isActive ? "Active" : "Inactive"}</span>
                  <div className="ad-row-actions">
                    <AdButton
                      variant="ghost"
                      onClick={() => toggleUserStatus(user)}
                      disabled={user.role === "admin"}
                    >
                      {user.isActive ? "Suspend" : "Activate"}
                    </AdButton>
                    <AdButton variant="danger" onClick={() => deleteUser(user)} disabled={user.role === "admin"}>
                      Delete
                    </AdButton>
                  </div>
                </div>
              ))}
            </div>
          </AdPanel>
        </AdSection>

        <AdSection
          id="activity"
          title="Consultations"
          desc="Recent patient–doctor consultation bookings."
          badge="Clinical"
        >
          <AdPanel className="ad-panel-flush">
            {consultations.length === 0 ? (
              <AdEmpty message="No consultations to show." />
            ) : (
              <div className="ad-data-table ad-data-table--consult">
                <div className="ad-data-table-head">
                  <span>Patient</span>
                  <span>Doctor</span>
                  <span>Date & time</span>
                  <span>Status</span>
                </div>
                <div className="ad-data-table-body">
                  {consultations.slice(0, 15).map((item) => (
                    <div key={item._id} className="ad-data-table-row">
                      <span className="ad-cell-primary">{item.patientId?.name || "Patient"}</span>
                      <span>{item.doctorId?.name || "Doctor"}</span>
                      <span className="ad-cell-muted">
                        {new Date(item.date).toLocaleDateString()} · {item.time}
                      </span>
                      <span>
                        <span className={`ad-status-pill ad-status-pill--${String(item.status || "pending").toLowerCase()}`}>
                          {item.status}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AdPanel>
        </AdSection>

        <AdSection
          id="audit"
          title="Audit logs"
          desc="System events — user changes, assignments, and security-related actions."
          badge={`${logs.length} entries`}
        >
          <AdPanel className="ad-audit-panel">
            {logs.length === 0 ? (
              <AdEmpty message="No audit entries recorded yet." />
            ) : (
              <>
                <p className="ad-audit-meta">
                  Showing the latest {Math.min(logs.length, 50)} of {logs.length} events (newest first).
                </p>
                <div className="ad-audit-scroll">
                  <div className="ad-data-table ad-data-table--audit">
                    <div className="ad-data-table-head">
                      <span>Timestamp</span>
                      <span>Action</span>
                      <span>Resource</span>
                      <span>Resource ID</span>
                      <span>IP address</span>
                    </div>
                    <div className="ad-data-table-body">
                      {logs.slice(0, 50).map((log) => (
                        <div key={log._id} className="ad-data-table-row">
                          <span className="ad-cell-muted ad-cell-nowrap">
                            {new Date(log.createdAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                          <span>
                            <span className="ad-action-pill">{log.action}</span>
                          </span>
                          <span className="ad-cell-primary">{log.resourceType}</span>
                          <span className="ad-cell-mono" title={log.resourceId || ""}>
                            {log.resourceId
                              ? `${String(log.resourceId).slice(0, 24)}${String(log.resourceId).length > 24 ? "…" : ""}`
                              : "—"}
                          </span>
                          <span className="ad-cell-muted">{log.ip || "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </AdPanel>
        </AdSection>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
