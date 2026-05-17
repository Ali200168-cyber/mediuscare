import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";
import PatientLayout from "./PatientLayout";
import { PtPageHeader, PtButton, PtAlert, patientFetch } from "../../components/patient/PatientUI";
import "../../styles/Patient/patient-pages.css";

const PRESET_SYMPTOMS = ["Headache", "Dizziness", "Fatigue", "Nausea", "Blurred vision", "Sweating", "Thirst", "Shaking"];
const REQUIRED = ["age", "gender", "weight", "glucose", "systolic", "diastolic", "meal", "mealHoursAgo"];

const HealthDataEntry = () => {
  const navigate = useNavigate();
  const [data, setData] = useState({
    age: "",
    gender: "",
    weight: "",
    glucose: "",
    systolic: "",
    diastolic: "",
    meal: "",
    mealHoursAgo: "",
    symptoms: [],
    customSymptom: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const completion = useMemo(() => {
    const filled = REQUIRED.filter((f) => String(data[f]).trim()).length;
    return Math.round((filled / REQUIRED.length) * 100);
  }, [data]);

  const set = (field, value) => {
    setData((p) => ({ ...p, [field]: value }));
    setErrors((p) => ({ ...p, [field]: "" }));
  };

  const toggleSymptom = (label) => {
    setData((p) => ({
      ...p,
      symptoms: p.symptoms.includes(label)
        ? p.symptoms.filter((x) => x !== label)
        : [...p.symptoms, label],
    }));
    setErrors((p) => ({ ...p, symptoms: "" }));
  };

  const addCustomSymptom = () => {
    const value = data.customSymptom.trim();
    if (!value) return;
    if (!data.symptoms.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setData((p) => ({ ...p, symptoms: [...p.symptoms, value], customSymptom: "" }));
    } else {
      setData((p) => ({ ...p, customSymptom: "" }));
    }
    setErrors((p) => ({ ...p, symptoms: "" }));
  };

  const removeSymptom = (label) => {
    setData((p) => ({ ...p, symptoms: p.symptoms.filter((s) => s !== label) }));
  };

  const validate = () => {
    const next = {};
    REQUIRED.forEach((f) => {
      if (!String(data[f]).trim()) next[f] = "Required";
    });
    if (!data.symptoms.length) next.symptoms = "Add at least one symptom";
    setErrors(next);
    return !Object.keys(next).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await patientFetch("/api/v1/health", {
        method: "POST",
        body: JSON.stringify({
          age: data.age,
          gender: data.gender,
          weight: data.weight,
          glucose: data.glucose,
          systolic: data.systolic,
          diastolic: data.diastolic,
          notes: data.meal,
          mealHoursAgo: data.mealHoursAgo,
          symptoms: data.symptoms,
        }),
      });
      const result = await res.json();
      if (result.success) navigate("/patient/dashboard");
      else alert(result.message || "Could not save.");
    } catch {
      alert("Connection error.");
    } finally {
      setSubmitting(false);
    }
  };

  const customOnly = data.symptoms.filter((s) => !PRESET_SYMPTOMS.includes(s));

  return (
    <PatientLayout>
      <div className="pt-vitals-page">
        <PtPageHeader
          title="Log vitals"
          subtitle="Quick daily check-in"
          actions={
            <div className="pt-vitals-progress" aria-label={`${completion}% complete`}>
              <div className="pt-vitals-progress-ring">
                <svg viewBox="0 0 36 36" aria-hidden>
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="var(--pt-surface-muted)"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="var(--pt-primary)"
                    strokeWidth="3"
                    strokeDasharray={`${completion}, 100`}
                    strokeLinecap="round"
                  />
                </svg>
                <span>{completion}%</span>
              </div>
            </div>
          }
        />

        <form className="pt-vitals-form" onSubmit={submit}>
          <section className="pt-vitals-section">
            <header className="pt-vitals-section-head">
              <span className="pt-vitals-step">1</span>
              <h2>About you</h2>
            </header>
            <div className="pt-vitals-fields pt-grid pt-grid-2">
              <label className="pt-field">
                <span className="pt-form-label">Age</span>
                <input className="pt-input" type="number" inputMode="numeric" placeholder="Years" value={data.age} onChange={(e) => set("age", e.target.value)} />
                {errors.age && <span className="pt-field-error">{errors.age}</span>}
              </label>
              <label className="pt-field">
                <span className="pt-form-label">Gender</span>
                <select className="pt-select" value={data.gender} onChange={(e) => set("gender", e.target.value)}>
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                {errors.gender && <span className="pt-field-error">{errors.gender}</span>}
              </label>
              <label className="pt-field pt-field-span-2">
                <span className="pt-form-label">Weight (kg)</span>
                <input className="pt-input" type="number" inputMode="decimal" placeholder="e.g. 70" value={data.weight} onChange={(e) => set("weight", e.target.value)} />
                {errors.weight && <span className="pt-field-error">{errors.weight}</span>}
              </label>
            </div>
          </section>

          <section className="pt-vitals-section">
            <header className="pt-vitals-section-head">
              <span className="pt-vitals-step">2</span>
              <h2>Vitals</h2>
            </header>
            <div className="pt-vitals-fields pt-grid pt-grid-2">
              <label className="pt-field">
                <span className="pt-form-label">Glucose</span>
                <div className="pt-input-unit">
                  <input className="pt-input" type="number" placeholder="118" value={data.glucose} onChange={(e) => set("glucose", e.target.value)} />
                  <span>mg/dL</span>
                </div>
                {errors.glucose && <span className="pt-field-error">{errors.glucose}</span>}
              </label>
              <label className="pt-field">
                <span className="pt-form-label">Blood pressure</span>
                <div className="pt-bp-row">
                  <input className="pt-input" type="number" placeholder="Sys" value={data.systolic} onChange={(e) => set("systolic", e.target.value)} aria-label="Systolic" />
                  <span>/</span>
                  <input className="pt-input" type="number" placeholder="Dia" value={data.diastolic} onChange={(e) => set("diastolic", e.target.value)} aria-label="Diastolic" />
                </div>
                {errors.systolic && <span className="pt-field-error">{errors.systolic}</span>}
                {errors.diastolic && <span className="pt-field-error">{errors.diastolic}</span>}
              </label>
            </div>
          </section>

          <section className="pt-vitals-section">
            <header className="pt-vitals-section-head">
              <span className="pt-vitals-step">3</span>
              <h2>Meal context</h2>
            </header>
            <div className="pt-vitals-fields pt-grid pt-grid-2">
              <label className="pt-field">
                <span className="pt-form-label">Last meal</span>
                <input className="pt-input" placeholder="e.g. Oatmeal" value={data.meal} onChange={(e) => set("meal", e.target.value)} />
                {errors.meal && <span className="pt-field-error">{errors.meal}</span>}
              </label>
              <label className="pt-field">
                <span className="pt-form-label">Hours ago</span>
                <input className="pt-input" type="number" placeholder="3" value={data.mealHoursAgo} onChange={(e) => set("mealHoursAgo", e.target.value)} />
                {errors.mealHoursAgo && <span className="pt-field-error">{errors.mealHoursAgo}</span>}
              </label>
            </div>
          </section>

          <section className="pt-vitals-section pt-vitals-section--symptoms">
            <header className="pt-vitals-section-head">
              <span className="pt-vitals-step">4</span>
              <h2>Symptoms</h2>
            </header>

            {data.symptoms.length > 0 && (
              <div className="pt-symptom-tags" role="list" aria-label="Selected symptoms">
                {data.symptoms.map((s) => (
                  <span key={s} className="pt-symptom-tag" role="listitem">
                    {s}
                    <button type="button" onClick={() => removeSymptom(s)} aria-label={`Remove ${s}`}>
                      <HiOutlineXMark />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <p className="pt-vitals-hint">Tap common symptoms or add your own below.</p>
            <div className="pt-symptom-presets">
              {PRESET_SYMPTOMS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`pt-symptom-preset${data.symptoms.includes(s) ? " is-selected" : ""}`}
                  onClick={() => toggleSymptom(s)}
                  aria-pressed={data.symptoms.includes(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="pt-custom-symptom-bar">
              <input
                className="pt-input"
                type="text"
                placeholder="Type a custom symptom..."
                value={data.customSymptom}
                onChange={(e) => set("customSymptom", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSymptom();
                  }
                }}
                aria-label="Custom symptom"
              />
              <button type="button" className="pt-custom-symptom-add" onClick={addCustomSymptom} aria-label="Add custom symptom">
                <HiOutlinePlus />
                Add
              </button>
            </div>

            {customOnly.length > 0 && (
              <p className="pt-vitals-hint pt-vitals-hint--muted">{customOnly.length} custom symptom(s) added</p>
            )}
            {errors.symptoms && <PtAlert tone="error">{errors.symptoms}</PtAlert>}
          </section>

          <footer className="pt-vitals-footer">
            <PtButton type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving..." : "Save vitals"}
            </PtButton>
          </footer>
        </form>
      </div>
    </PatientLayout>
  );
};

export default HealthDataEntry;
