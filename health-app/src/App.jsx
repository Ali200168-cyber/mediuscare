import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";


import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Home from "./pages/Home";
import ProtectedRoute from "./components/ProtectedRoute";

import PatientDashboard from "./pages/Patient/PatientDashboard";
import HealthDataEntry from "./pages/Patient/HealthDataEntry";
import AIPredictions from "./pages/Patient/AIPredictions";
import Consultation from "./pages/Patient/Consultation";
import PatientAlerts from "./pages/Patient/PatientAlerts";
import DoctorRequest from "./pages/Patient/DoctorRequest";
import CaregiverRequestsPatient from "./pages/Patient/CaregiverRequests";
import DoctorUpdates from "./pages/Patient/DoctorUpdates";


import DoctorDashboard from "./pages/Doctor/DoctorDashboard";
import PatientMonitoring from "./pages/Doctor/PatientMonitoring";
import DoctorAIReview from "./pages/Doctor/DoctorAIReview";
import PatientReport from "./pages/Patient/PatientReport";
import DoctorRequests from "./pages/Doctor/DoctorRequests";
import DoctorAssignmentRequests from "./pages/Doctor/DoctorAssignmentRequests";
import CaregiverDashboard from "./pages/Caregiver/CaregiverDashboard";
import CaregiverPatients from "./pages/Caregiver/CaregiverPatients";
import CaregiverAlerts from "./pages/Caregiver/CaregiverAlerts";
import CaregiverConsultation from "./pages/Caregiver/CaregiverConsultation";
import CaregiverChat from "./pages/Caregiver/CaregiverChat";
import CaregiverFeedback from "./pages/Caregiver/CaregiverFeedback";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import PatientChat from "./pages/Patient/PatientChat";
import DoctorChat from "./pages/Doctor/DoctorChat";

function App() {
  return (
    <BrowserRouter>
      <Routes>

       
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route path="/patient/dashboard" element={<ProtectedRoute roles={["patient"]}><PatientDashboard /></ProtectedRoute>} />
        <Route path="/patient/health-entry" element={<ProtectedRoute roles={["patient"]}><HealthDataEntry /></ProtectedRoute>} />
        <Route path="/patient/ai-predictions" element={<ProtectedRoute roles={["patient"]}><AIPredictions /></ProtectedRoute>} />
        <Route path="/patient/consultation" element={<ProtectedRoute roles={["patient"]}><Consultation /></ProtectedRoute>} />
        <Route path="/patient/alerts" element={<ProtectedRoute roles={["patient"]}><PatientAlerts /></ProtectedRoute>} />
        <Route path="/patient/doctor-request" element={<ProtectedRoute roles={["patient"]}><DoctorRequest /></ProtectedRoute>} />
        <Route path="/patient/doctor-updates" element={<ProtectedRoute roles={["patient"]}><DoctorUpdates /></ProtectedRoute>} />
        <Route path="/patient/caregiver-requests" element={<ProtectedRoute roles={["patient"]}><CaregiverRequestsPatient /></ProtectedRoute>} />
        <Route path="/patient/chat" element={<ProtectedRoute roles={["patient"]}><PatientChat /></ProtectedRoute>} />
        <Route path="/patient/reports" element={<ProtectedRoute roles={["patient"]}><PatientReport /></ProtectedRoute>} />

       
        <Route path="/doctor/dashboard" element={<ProtectedRoute roles={["doctor"]}><DoctorDashboard /></ProtectedRoute>} />
        <Route path="/doctor/patient-monitoring" element={<ProtectedRoute roles={["doctor"]}><PatientMonitoring /></ProtectedRoute>} />
        <Route path="/doctor/requests" element={<ProtectedRoute roles={["doctor"]}><DoctorRequests /></ProtectedRoute>} />
        <Route path="/doctor/assignment-requests" element={<ProtectedRoute roles={["doctor"]}><DoctorAssignmentRequests /></ProtectedRoute>} />
        <Route path="/doctor/chat" element={<ProtectedRoute roles={["doctor"]}><DoctorChat /></ProtectedRoute>} />
        <Route path="/doctor/ai-review" element={<ProtectedRoute roles={["doctor"]}><DoctorAIReview /></ProtectedRoute>} />

        <Route path="/caregiver" element={<Navigate to="/caregiver/dashboard" replace />} />
        <Route path="/caregiver/dashboard" element={<ProtectedRoute roles={["caregiver"]}><CaregiverDashboard /></ProtectedRoute>} />
        <Route path="/caregiver/patients" element={<ProtectedRoute roles={["caregiver"]}><CaregiverPatients /></ProtectedRoute>} />
        <Route path="/caregiver/alerts" element={<ProtectedRoute roles={["caregiver"]}><CaregiverAlerts /></ProtectedRoute>} />
        <Route path="/caregiver/consultation" element={<ProtectedRoute roles={["caregiver"]}><CaregiverConsultation /></ProtectedRoute>} />
        <Route path="/caregiver/chat" element={<ProtectedRoute roles={["caregiver"]}><CaregiverChat /></ProtectedRoute>} />
        <Route path="/caregiver/feedback" element={<ProtectedRoute roles={["caregiver"]}><CaregiverFeedback /></ProtectedRoute>} />

        <Route path="/admin/dashboard" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />

        
        <Route path="*" element={<Navigate to="/login" />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
