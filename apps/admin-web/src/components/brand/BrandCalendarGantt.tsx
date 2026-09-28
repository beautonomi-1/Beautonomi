import { useMemo } from "react";
import { Link } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";

type CampaignFlight = {
  id: string;
  name: string;
  flight_start: string | null;
  flight_end: string | null;
  stage: string;
};

const STAGE_COLOR: Record<string, string> = {
  planning: "bg-zinc-400",
  creative: "bg-violet-500",
  live: "bg-emerald-500",
  measuring: "bg-amber-500",
  closed: "bg-zinc-300",
};

function parseDay(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.slice(0, 10));
  return Number.isFinite(t) ? t : null;
}

export function BrandCalendarGantt({ items }: { items: CampaignFlight[] }) {
  const { startMs, endMs, weeks } = useMemo(() => {
    const starts = items.map((c) => parseDay(c.flight_start)).filter((x): x is number => x != null);
    const ends = items.map((c) => parseDay(c.flight_end)).filter((x): x is number => x != null);
    const now = Date.now();
    let startMs = starts.length ? Math.min(...starts) : now;
    let endMs = ends.length ? Math.max(...ends) : now + 90 * 86400000;
    if (endMs <= startMs) endMs = startMs + 30 * 86400000;
    const pad = 7 * 86400000;
    startMs -= pad;
    endMs += pad;
    const weekMs = 7 * 86400000;
    const weekCount = Math.max(4, Math.ceil((endMs - startMs) / weekMs));
    const weeks: number[] = [];
    for (let i = 0; i < weekCount; i++) weeks.push(startMs + i * weekMs);
    return { startMs, endMs, weeks };
  }, [items]);

  const span = endMs - startMs;

  return (
    <div className="overflow-x-auto rounded border">
      <div className="min-w-[720px]">
        <div className="grid border-b bg-zinc-50 text-xs text-zinc-500" style={{ gridTemplateColumns: "200px 1fr" }}>
          <div className="px-2 py-1">Campaign</div>
          <div className="relative flex">
            {weeks.map((w, i) => (
              <div key={w} className="flex-1 border-l px-1 py-1 tabular-nums">
                {i % 2 === 0 ? new Date(w).toISOString().slice(5, 10) : ""}
              </div>
            ))}
          </div>
        </div>
        {items.map((c) => {
          const a = parseDay(c.flight_start);
          const b = parseDay(c.flight_end);
          const left = a != null ? ((a - startMs) / span) * 100 : 0;
          const width =
            a != null && b != null ? Math.max(2, ((b - a) / span) * 100) : a != null ? 4 : 0;
          return (
            <div
              key={c.id}
              className="grid items-center border-b text-sm last:border-b-0"
              style={{ gridTemplateColumns: "200px 1fr" }}
            >
              <Link to={adminSpaTo(`/admin/brand/campaigns/${c.id}`)} className="truncate px-2 py-2 font-medium hover:underline">
                {c.name}
              </Link>
              <div className="relative h-10 border-l">
                {a != null ? (
                  <div
                    className={`absolute top-2 h-6 rounded ${STAGE_COLOR[c.stage] ?? "bg-violet-400"} opacity-90`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${c.stage} · ${(c.flight_start ?? "").slice(0, 10)} → ${(c.flight_end ?? "").slice(0, 10)}`}
                  />
                ) : (
                  <span className="px-2 text-xs text-zinc-400">No flight dates</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
