type Row = {
  cohortMonth: string;
  cohortSize: number;
  m1: number | null;
  m3: number | null;
  m6: number | null;
};

function cellPct(v: number | null): string {
  if (v == null) return "—";
  return `${Math.round(v * 1000) / 10}%`;
}

function cellBg(v: number | null): string {
  if (v == null) return "bg-gray-50";
  const opacity = Math.min(1, Math.max(0.08, v));
  return `rgba(17, 24, 39, ${opacity})`;
}

export function AdminCohortTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">Not enough completed bookings for cohort retention.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-2 pr-3 font-medium">First visit month</th>
            <th className="py-2 pr-3 font-medium">Cohort size</th>
            <th className="py-2 pr-3 font-medium">M+1</th>
            <th className="py-2 pr-3 font-medium">M+3</th>
            <th className="py-2 font-medium">M+6</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(-12).map((r) => (
            <tr key={r.cohortMonth} className="border-b border-gray-50">
              <td className="py-2 pr-3 font-medium text-gray-800">{r.cohortMonth}</td>
              <td className="py-2 pr-3 tabular-nums">{r.cohortSize}</td>
              {([r.m1, r.m3, r.m6] as const).map((v, i) => (
                <td key={i} className="py-2 pr-3">
                  <span
                    className="inline-block min-w-[3rem] rounded px-2 py-1 tabular-nums text-gray-900"
                    style={{ backgroundColor: cellBg(v) }}
                  >
                    {cellPct(v)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
