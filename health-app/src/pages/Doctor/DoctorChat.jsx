import DoctorLayout from "./DoctorLayout";
import DoctorPatientChat from "../Shared/DoctorPatientChat";
import "../../styles/Doctor/doctor-pages.css";

export default function DoctorChat() {
  return (
    <DoctorLayout>
      <div className="md-page">
        <div className="md-chat-frame">
          <DoctorPatientChat />
        </div>
      </div>
    </DoctorLayout>
  );
}
