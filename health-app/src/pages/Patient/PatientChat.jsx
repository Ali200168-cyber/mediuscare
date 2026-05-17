import PatientLayout from "./PatientLayout";
import DoctorPatientChat from "../Shared/DoctorPatientChat";
import { PtPageHeader } from "../../components/patient/PatientUI";
import "../../styles/Patient/patient-pages.css";

export default function PatientChat() {
  return (
    <PatientLayout>
      <PtPageHeader title="Messages" />
      <div className="pt-chat-wrap">
        <DoctorPatientChat />
      </div>
    </PatientLayout>
  );
}
