import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlinePlus, HiOutlineXMark } from "react-icons/hi2";
import PatientLayout from "./PatientLayout";
import { PtPageHeader, PtButton, PtAlert, patientFetch } from "../../components/patient/PatientUI";
import "../../styles/Patient/patient-pages.css";

const PRESET_SYMPTOMS = ["Headache", "Dizziness", "Fatigue", "Nausea", "Blurred vision", "Sweating", "Thirst", "Shaking"];
const NO_SYMPTOMS_LABEL = "No symptoms";
const REQUIRED = ["age", "gender", "weight", "glucose", "systolic", "diastolic", "meal", "mealHoursAgo"];

const parseNum = (value) => {
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : NaN;
};

const NUMERIC_RULES = {
  age: { min: 1, max: 120, label: "Age" },
  weight: { min: 0.1, max: 500, label: "Weight" },
  glucose: { min: 0.1, max: 600, label: "Glucose" },
  systolic: { min: 0.1, max: 300, label: "Systolic BP" },
  diastolic: { min: 0.1, max: 200, label: "Diastolic BP" },
  mealHoursAgo: { min: 0, max: 72, label: "Hours since meal" },
};

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
    setData((p) => {
      if (label === NO_SYMPTOMS_LABEL) {
        const has = p.symptoms.includes(NO_SYMPTOMS_LABEL);
        return { ...p, symptoms: has ? [] : [NO_SYMPTOMS_LABEL] };
      }
      const withoutNone = p.symptoms.filter((x) => x !== NO_SYMPTOMS_LABEL);
      return {
        ...p,
        symptoms: withoutNone.includes(label)
          ? withoutNone.filter((x) => x !== label)
          : [...withoutNone, label],
      };
    });
    setErrors((p) => ({ ...p, symptoms: "" }));
  };

  const addCustomSymptom = () => {
    const value = data.customSymptom.trim();
    if (!value) return;
    if (value.toLowerCase() === NO_SYMPTOMS_LABEL.toLowerCase()) {
      setData((p) => ({ ...p, symptoms: [NO_SYMPTOMS_LABEL], customSymptom: "" }));
      setErrors((p) => ({ ...p, symptoms: "" }));
      return;
    }
    if (!data.symptoms.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setData((p) => ({
        ...p,
        symptoms: [...p.symptoms.filter((s) => s !== NO_SYMPTOMS_LABEL), value],
        customSymptom: "",
      }));
    } else {
      setData((p) => ({ ...p, customSymptom: "" }));
    }
    setErrors((p) => ({ ...p, symptoms: "" }));
  };

  const removeSymptom = (label) => {
    setData((p) => ({ ...p, symptoms: p.symptoms.filter((s) => s !== label) }));
  };

  const validateNumeric = (field, next) => {
    const rule = NUMERIC_RULES[field];
    if (!rule) return;
    const raw = String(data[field]).trim();
    if (!raw) {
      next[field] = "Required";
      return;
    }
    const n = parseNum(raw);
    if (Number.isNaN(n)) {
      next[field] = "Enter a valid number";
      return;
    }
    if (n < 0) {
      next[field] = "Cannot be negative";
      return;
    }
    if (n < rule.min) {
      next[field] = `${rule.label} must be at least ${rule.min}`;
      return;
    }
    if (n > rule.max) {
      next[field] = `${rule.label} must be at most ${rule.max}`;
    }
  };

  const validate = () => {
    const next = {};
    REQUIRED.forEach((f) => {
      if (["age", "weight", "glucose", "systolic", "diastolic", "mealHoursAgo"].includes(f)) {
        validateNumeric(f, next);
      } else if (!String(data[f]).trim()) {
        next[f] = "Required";
      }
    });
    if (data.symptoms.length === 0) {
      next.symptoms = "Select symptoms or choose “No symptoms”";
    }
    if (!next.systolic && !next.diastolic) {
      const sys = parseNum(data.systolic);
      const dia = parseNum(data.diastolic);
      if (Number.isFinite(sys) && Number.isFinite(dia) && sys <= dia) {
        next.systolic = "Systolic should be higher than diastolic";
      }
    }
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
      else {
        const msg = result.message || "Could not save.";
        if (msg.toLowerCase().includes("symptom")) setErrors((p) => ({ ...p, symptoms: msg }));
        else alert(msg);
      }
    } catch {
      alert("Connection error.");
    } finally {
      setSubmitting(false);
    }
  };

  const customOnly = data.symptoms.filter((s) => !PRESET_SYMPTOMS.includes(s) && s !== NO_SYMPTOMS_LABEL);
  const symptomsLocked = data.symptoms.includes(NO_SYMPTOMS_LABEL);

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
                <input className="pt-input" type="number" inputMode="numeric" min={1} placeholder="Years" value={data.age} onChange={(e) => set("age", e.target.value)} />
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
                <input className="pt-input" type="number" inputMode="decimal" min={0} step="0.1" placeholder="e.g. 70" value={data.weight} onChange={(e) => set("weight", e.target.value)} />
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
                  <input className="pt-input" type="number" min={0} placeholder="118" value={data.glucose} onChange={(e) => set("glucose", e.target.value)} />
                  <span>mg/dL</span>
                </div>
                {errors.glucose && <span className="pt-field-error">{errors.glucose}</span>}
              </label>
              <label className="pt-field">
                <span className="pt-form-label">Blood pressure</span>
                <div className="pt-bp-row">
                  <input className="pt-input" type="number" min={0} placeholder="Sys" value={data.systolic} onChange={(e) => set("systolic", e.target.value)} aria-label="Systolic" />
                  <span>/</span>
                  <input className="pt-input" type="number" min={0} placeholder="Dia" value={data.diastolic} onChange={(e) => set("diastolic", e.target.value)} aria-label="Diastolic" />
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
                <input className="pt-input" type="number" min={0} placeholder="3" value={data.mealHoursAgo} onChange={(e) => set("mealHoursAgo", e.target.value)} />
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

            <p className="pt-vitals-hint">Tap a symptom, choose “No symptoms” if you feel fine, or add your own below.</p>
            <div className="pt-symptom-presets">
              <button
                type="button"
                className={`pt-symptom-preset pt-symptom-preset--none${data.symptoms.includes(NO_SYMPTOMS_LABEL) ? " is-selected" : ""}`}
                onClick={() => toggleSymptom(NO_SYMPTOMS_LABEL)}
                aria-pressed={data.symptoms.includes(NO_SYMPTOMS_LABEL)}
              >
                {NO_SYMPTOMS_LABEL}
              </button>
              {PRESET_SYMPTOMS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`pt-symptom-preset${data.symptoms.includes(s) ? " is-selected" : ""}`}
                  onClick={() => toggleSymptom(s)}
                  aria-pressed={data.symptoms.includes(s)}
                  disabled={symptomsLocked}
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
                disabled={symptomsLocked}
              />
              <button
                type="button"
                className="pt-custom-symptom-add"
                onClick={addCustomSymptom}
                aria-label="Add custom symptom"
                disabled={symptomsLocked}
              >
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
