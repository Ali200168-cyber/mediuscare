import "../styles/MlModelsGuide.css";

export const ML_MODELS = [
  {
    id: "glucose",
    icon: "📈",
    name: "Glucose forecast",
    model: "HistGradientBoosting on lagged vitals",
    input: "Last 6+ glucose readings, meal timing, weight",
    output: "6–24h mg/dL curve + trend",
    forRole: "patient",
  },
  {
    id: "bp",
    icon: "🫀",
    name: "BP risk class",
    model: "Multinomial logistic regression",
    input: "Systolic, diastolic, age, weight",
    output: "Normal → Stage 2 HTN + score",
    forRole: "doctor",
  },
  {
    id: "anomaly",
    icon: "⚡",
    name: "Anomaly guard",
    model: "Isolation Forest + safety thresholds",
    input: "Glucose + BP combined pattern",
    output: "Low / Medium / High alert level",
    forRole: "caregiver",
  },
];

const MlModelsGuide = ({ audience = "all", compact = false }) => {
  const models =
    audience === "all" ? ML_MODELS : ML_MODELS.filter((m) => m.forRole === audience);

  return (
    <section className={`ml-guide${compact ? " ml-guide--compact" : ""}`} aria-label="AI models explained">
      {!compact && (
        <header className="ml-guide-head">
          <h3>How our AI works</h3>
          <p>Decision support only — clinicians approve every dose change.</p>
        </header>
      )}
      <div className="ml-guide-grid">
        {models.map((m) => (
          <article key={m.id} className={`ml-card ml-card--${m.id}`}>
            <span className="ml-card-icon" aria-hidden>{m.icon}</span>
            <h4>{m.name}</h4>
            <dl>
              <div>
                <dt>Model</dt>
                <dd>{m.model}</dd>
              </div>
              <div>
                <dt>In</dt>
                <dd>{m.input}</dd>
              </div>
              <div>
                <dt>Out</dt>
                <dd>{m.output}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
};

export default MlModelsGuide;
