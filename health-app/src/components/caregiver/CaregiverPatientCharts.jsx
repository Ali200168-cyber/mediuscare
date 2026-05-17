import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const buildTrendData = (entries = []) =>
  [...entries]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((e, idx) => ({
      idx: idx + 1,
      date: new Date(e.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      glucose: e.glucose ?? null,
      systolic: e.systolic ?? null,
      diastolic: e.diastolic ?? null,
      weight: e.weight ?? null,
    }));

export function CaregiverGlucoseChart({ entries }) {
  const data = buildTrendData(entries);
  if (!data.some((d) => d.glucose != null)) {
    return <p className="cg-chart-empty">No glucose readings to chart yet.</p>;
  }
  return (
    <div className="cg-chart-box">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9e0f5" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
          <Tooltip />
          <Line type="monotone" dataKey="glucose" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} name="Glucose" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CaregiverBpChart({ entries }) {
  const data = buildTrendData(entries);
  if (!data.some((d) => d.systolic != null)) {
    return <p className="cg-chart-empty">No blood pressure readings to chart yet.</p>;
  }
  return (
    <div className="cg-chart-box">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e9e0f5" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="systolic" stroke="#e11d48" strokeWidth={2} dot={{ r: 3 }} name="Systolic" />
          <Line type="monotone" dataKey="diastolic" stroke="#f472b6" strokeWidth={2} dot={{ r: 3 }} name="Diastolic" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
