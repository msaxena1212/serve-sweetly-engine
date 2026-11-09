import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import { ChartCard } from "@/components/insight-charts";
import type { ReportColumn, ReportRow } from "@/lib/reports";

const axis = { fontSize: 11, fill: "#334155" };

// Draws the report's first numeric column against its first label column.
// Date labels give a trend line; other labels give bars for the top 12 rows.
export function ReportChart({ columns, rows }: { columns: ReportColumn[]; rows: ReportRow[] }) {
  const label = columns.find((c) => c.type === "date") ?? columns.find((c) => c.type === "text");
  const value = columns.find((c) => c.type === "money") ?? columns.find((c) => c.type === "int");
  if (!label || !value || rows.length < 2) return null;

  const isTrend = label.type === "date";
  const data = rows
    .map((r) => ({ label: String(r[label.key] ?? "—"), value: Number(r[value.key] ?? 0) }))
    .slice(0, isTrend ? 90 : 12)
    .map((d) => ({ ...d, label: d.label.length > 18 ? d.label.slice(0, 17) + "…" : d.label }));
  const fmt = (v: number) => value.type === "money" ? `₹${v.toLocaleString("en-IN")}` : v.toLocaleString("en-IN");

  return (
    <ChartCard
      title={`${value.label} by ${label.label.toLowerCase()}`}
      info={isTrend
        ? `Each point is ${value.label.toLowerCase()} for one ${label.label.toLowerCase()} from the table below, in date order. It shows how the figure moves over the selected period.`
        : `Bars show ${value.label.toLowerCase()} for the top ${data.length} rows of the table below, in the order the report lists them.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {isTrend ? (
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" tick={axis} />
            <YAxis tick={axis} tickFormatter={fmt} />
            <RTooltip formatter={(v: number) => fmt(v)} />
            <Line type="monotone" dataKey="value" name={value.label} stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" tick={{ ...axis, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={axis} tickFormatter={fmt} />
            <RTooltip formatter={(v: number) => fmt(v)} />
            <Bar dataKey="value" name={value.label} fill="#dc2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </ChartCard>
  );
}
