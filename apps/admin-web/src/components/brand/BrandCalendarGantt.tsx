import { useMemo, useState } from "react";
import { Link } from "react-router";
import { adminSpaTo } from "@/lib/adminSpaPath";

type CampaignFlight = {
  id: string;
  name: string;
  flight_start: string | null;
  flight_end: string | null;
  stage: string;
  pillar_name?: string | null;
  out_of_plan?: boolean;
  unlinked?: boolean;
};

const STAGE_COLOR: Record<string, string> = {
  planning: "bg-zinc-400",
  creative: "bg-violet-500",
  live: "bg-emerald-500",
  measuring: "bg-amber-500",
  closed: "bg-zinc-300",
};

const DAY_MS = 86400000;

function parseDay(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.slice(0, 10));
  return Number.isFinite(t) ? t : null;
}

function toDateIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function BrandCalendarGantt({
  items,
  groupBy = "none",
  onReschedule,
  reschedulingId,
}: {
  items: CampaignFlight[];
  groupBy?: "none" | "pillar";
  onReschedule?: (input: { id: string; flight_start: string; flight_end: string }) => Promise<void>;
  reschedulingId?: string | null;
}) {
  const [drag, setDrag] = useState<{
    id: string;
    pointerId: number;
    startMs: number;
    endMs: number;
    originX: number;
  } | null>(null);
  const [previewDeltaMs, setPreviewDeltaMs] = useState(0);

  const { startMs, endMs, weeks } = useMemo(() => {
    const starts = items.map((c) => parseDay(c.flight_start)).filter((x): x is number => x != null);
    const ends = items.map((c) => parseDay(c.flight_end)).filter((x): x is number => x != null);
    const now = Date.now();
    let startMs = starts.length ? Math.min(...starts) : now;
    let endMs = ends.length ? Math.max(...ends) : now + 90 * DAY_MS;
    if (endMs <= startMs) endMs = startMs + 30 * DAY_MS;
    const pad = 7 * DAY_MS;
    startMs -= pad;
    endMs += pad;
    const weekMs = 7 * DAY_MS;
    const weekCount = Math.max(4, Math.ceil((endMs - startMs) / weekMs));
    const weeks: number[] = [];
    for (let i = 0; i < weekCount; i++) weeks.push(startMs + i * weekMs);
    return { startMs, endMs, weeks };
  }, [items]);

  const span = endMs - startMs;

  const finishDrag = async (state: typeof drag, deltaMs: number) => {
    if (!state || !onReschedule || Math.abs(deltaMs) < DAY_MS / 2) return;
    const duration = state.endMs - state.startMs;
    const nextStart = state.startMs + deltaMs;
    const nextEnd = nextStart + duration;
    await onReschedule({
      id: state.id,
      flight_start: toDateIso(nextStart),
      flight_end: toDateIso(nextEnd),
    });
  };

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
        {(groupBy === "pillar"
          ? [...items].sort((a, b) => String(a.pillar_name ?? "").localeCompare(String(b.pillar_name ?? "")))
          : items
        ).map((c) => {
          const a = parseDay(c.flight_start);
          const b = parseDay(c.flight_end);
          const isDragging = drag?.id === c.id;
          const deltaMs = isDragging ? previewDeltaMs : 0;
          const effStart = a != null ? a + deltaMs : null;
          const left = effStart != null ? ((effStart - startMs) / span) * 100 : 0;
          const width =
            a != null && b != null ? Math.max(2, ((b - a) / span) * 100) : a != null ? 4 : 0;
          const canDrag = c.stage === "planning" && a != null && b != null && Boolean(onReschedule);

          return (
            <div
              key={c.id}
              className="grid items-center border-b text-sm last:border-b-0"
              style={{ gridTemplateColumns: "200px 1fr" }}
            >
              <Link to={adminSpaTo(`/admin/brand/campaigns/${c.id}`)} className="truncate px-2 py-2 font-medium hover:underline">
                {groupBy === "pillar" && c.pillar_name ? (
                  <span className="block text-xs text-zinc-500">{c.pillar_name}</span>
                ) : null}
                {c.name}
                {c.unlinked ? <span className="ml-1 text-amber-600">⚠</span> : null}
                {c.out_of_plan ? <span className="ml-1 text-red-600" title="Outside plan quarter">⏱</span> : null}
              </Link>
              <div className="relative h-10 border-l">
                {a != null ? (
                  <div
                    role={canDrag ? "button" : undefined}
                    tabIndex={canDrag ? 0 : undefined}
                    className={`absolute top-2 h-6 rounded ${STAGE_COLOR[c.stage] ?? "bg-violet-400"} opacity-90 ${
                      canDrag ? "cursor-grab touch-none active:cursor-grabbing" : ""
                    } ${reschedulingId === c.id ? "animate-pulse ring-2 ring-violet-400" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={
                      canDrag
                        ? `${c.stage} · drag to reschedule · ${(c.flight_start ?? "").slice(0, 10)} → ${(c.flight_end ?? "").slice(0, 10)}`
                        : `${c.stage} · ${(c.flight_start ?? "").slice(0, 10)} → ${(c.flight_end ?? "").slice(0, 10)}`
                    }
                    onPointerDown={(e) => {
                      if (!canDrag || a == null || b == null) return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      setDrag({ id: c.id, pointerId: e.pointerId, startMs: a, endMs: b, originX: e.clientX });
                      setPreviewDeltaMs(0);
                    }}
                    onPointerMove={(e) => {
                      if (!drag || drag.id !== c.id) return;
                      const track = e.currentTarget.parentElement;
                      if (!track) return;
                      const rect = track.getBoundingClientRect();
                      const deltaPx = e.clientX - drag.originX;
                      const deltaMsRaw = (deltaPx / rect.width) * span;
                      setPreviewDeltaMs(deltaMsRaw);
                    }}
                    onPointerUp={(e) => {
                      if (!drag || drag.id !== c.id) return;
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      const track = e.currentTarget.parentElement;
                      const deltaMs =
                        track != null ? ((e.clientX - drag.originX) / track.getBoundingClientRect().width) * span : previewDeltaMs;
                      void finishDrag(drag, deltaMs);
                      setDrag(null);
                      setPreviewDeltaMs(0);
                    }}
                    onPointerCancel={() => {
                      if (drag?.id === c.id) {
                        setDrag(null);
                        setPreviewDeltaMs(0);
                      }
                    }}
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
