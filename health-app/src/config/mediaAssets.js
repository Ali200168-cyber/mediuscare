
const u = (photoPath, w = 1600, q = 80) =>
  `https://images.unsplash.com/${photoPath}?auto=format&fit=crop&w=${w}&q=${q}`;

const pexels = (path, w = 1200) =>
  `${path}?auto=compress&cs=tinysrgb&w=${w}&fit=crop`;

export const MEDIA = {
  backdrop: u("photo-1519494026892-80bbd2d6fd0d", 2400, 78),
  authHeroCare: u("photo-1576091160399-112ba8d25d1d", 1400, 82),
  aboutCollaboration: u("photo-1522071820081-009f0129c71c", 1200, 80),
  featureAi: u("photo-1576091160550-2173dba999ef", 800, 78),
  featureVitals: u("photo-1631217868264-e5b90bb7e133", 800, 78),
  featureConsult: u("photo-1622253692010-333f2da6031d", 800, 78),
  featureAlerts: u("photo-1559757148-5c350d0d3c56", 800, 78),
  featureReports: u("photo-1516321318423-f06f85e504b3", 800, 78),
  patientDashboard: u("photo-1504439468489-c8920d796a29", 1000, 80),
  doctorDashboard: u("photo-1622253692010-333f2da6031d", 1400, 80),
  caregiverHub: pexels("https://images.pexels.com/photos/5327585/pexels-photo-5327585.jpeg", 1100),
  cardAccent: u("photo-1559757148-5c350d0d3c56", 600, 72),
};

export const MEDIA_ALT = {
  authHeroCare: "Healthcare professionals collaborating in a hospital setting",
  aboutCollaboration: "Colleagues collaborating at a table in a bright office",
  featureAi: "Medical technology used for diagnostics and analysis",
  featureVitals: "Doctor reviewing patient charts and clinical information",
  featureConsult: "Clinician reviewing care information on a workstation",
  featureAlerts: "Pharmacy and medication context representing care alerts",
  featureReports: "Presenter explaining data on a wall screen",
  patientDashboard: "Person stretching in a bright indoor exercise space",
  doctorDashboard: "Physician using a computer for patient care workflows",
  caregiverHub: "Healthcare professional in a clinical coat with a stethoscope",
};
