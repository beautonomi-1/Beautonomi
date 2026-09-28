import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Clock, Lock } from "lucide-react";
import { adminSpaTo } from "@/lib/adminSpaPath";
import { STAGE_META, type BrandCampaignStage } from "@/routes/brand/brandTypes";
import { cn } from "@/lib/cn";

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

type PlanBand = { pillar_name: string; year: number; quarter: number; gap: boolean };

const DAY_MS = 86400000;

function parseDay(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.slice(0, 10));
  return Number.isFinite(t) ? t : null;
}

function toDateIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function snapDays(deltaMs: number): number {
  return Math.round(deltaMs / DAY_MS) * DAY_MS;
}

export type BrandCalendarGanttHandle = {
  scrollToToday: () => void;
};

export const BrandCalendarGantt = forwardRef<
  BrandCalendarGanttHandle,
  {
    items: CampaignFlight[];
    groupBy?: "none" | "pillar";
    planBands?: PlanBand[];
    zoom?: "month" | "quarter" | "year";
    onReschedule?: (input: { id: string; flight_start: string; flight_end: string }) => Promise<void>;
    reschedulingId?: string | null;
  }
>(function BrandCalendarGantt(
  { items, groupBy = "none", planBands = [], zoom = "quarter", onReschedule, reschedulingId },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    id: string;
    pointerId: number;
    startMs: number;
    endMs: number;
    originX: number;
  } | null>(null);
  const [previewDeltaMs, setPreviewDeltaMs] = useState(0);
  const [collapsedPillars, setCollapsedPillars] = useState<Set<string>>(new Set());

  const zoomPadDays = zoom === "month" ? 14 : zoom === "year" ? 45 : 7;

  const { startMs, endMs, weeks, months, todayLeftPct } = useMemo(() => {
    const starts = items.map((c) => parseDay(c.flight_start)).filter((x): x is number => x != null);
    const ends = items.map((c) => parseDay(c.flight_end)).filter((x): x is number => x != null);
    const now = Date.now();
    let startMs = starts.length ? Math.min(...starts) : now;
    let endMs = ends.length ? Math.max(...ends) : now + 90 * DAY_MS;
    if (endMs <= startMs) endMs = startMs + 30 * DAY_MS;
    const pad = zoomPadDays * DAY_MS;
    startMs -= pad;
    endMs += pad;
    const weekMs = 7 * DAY_MS;
    const minWeeks = zoom === "month" ? 6 : zoom === "year" ? 52 : 8;
    const weekCount = Math.max(minWeeks, Math.ceil((endMs - startMs) / weekMs));
    const weeks: number[] = [];
    for (let i = 0; i < weekCount; i++) weeks.push(startMs + i * weekMs);

    const months: Array<{ label: string; startIdx: number; span: number }> = [];
    let i = 0;
    while (i < weeks.length) {
      const d = new Date(weeks[i]!);
      const label = d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      let j = i + 1;
      while (j < weeks.length) {
        const dj = new Date(weeks[j]!);
        if (`${dj.getFullYear()}-${dj.getMonth()}` !== monthKey) break;
        j++;
      }
      months.push({ label, startIdx: i, span: j - i });
      i = j;
    }

    const todayLeftPct = ((now - startMs) / (endMs - startMs)) * 100;
    return { startMs, endMs, weeks, months, todayLeftPct };
  }, [items, zoomPadDays, zoom]);

  const span = endMs - startMs;

  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      const el = scrollRef.current;
      if (!el) return;
      const trackWidth = el.scrollWidth - 200;
      const targetPx = (todayLeftPct / 100) * trackWidth - el.clientWidth / 2 + 100;
      el.scrollTo({ left: Math.max(0, targetPx), behavior: "smooth" });
    },
  }));

  const finishDrag = async (state: typeof drag, deltaMs: number) => {
    if (!state || !onReschedule) return;
    const snapped = snapDays(deltaMs);
    if (Math.abs(snapped) < DAY_MS / 2) return;
    const duration = state.endMs - state.startMs;
    const nextStart = state.startMs + snapped;
    const nextEnd = nextStart + duration;
    await onReschedule({
      id: state.id,
      flight_start: toDateIso(nextStart),
      flight_end: toDateIso(nextEnd),
    });
  };

  const grouped = useMemo(() => {
    if (groupBy !== "pillar") return [{ key: "__all__", label: null, items }];
    const map = new Map<string, CampaignFlight[]>();
    for (const c of items) {
      const key = c.pillar_name?.trim() || "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({ key, label: key, items: rows }));
  }, [items, groupBy]);

  const renderRow = (c: CampaignFlight) => {
    const a = parseDay(c.flight_start);
    const b = parseDay(c.flight_end);
    const isDragging = drag?.id === c.id;
    const deltaMs = isDragging ? previewDeltaMs : 0;
    const effStart = a != null ? a + deltaMs : null;
    const left = effStart != null ? ((effStart - startMs) / span) * 100 : 0;
    const width = a != null && b != null ? Math.max(2, ((b - a) / span) * 100) : a != null ? 4 : 0;
    const canDrag = c.stage === "planning" && a != null && b != null && Boolean(onReschedule);
    const stageKey = c.stage as BrandCampaignStage;
    const barClass = STAGE_META[stageKey]?.barClass ?? "bg-violet-400";
    const dragDates =
      isDragging && a != null && b != null
        ? `${toDateIso(a + snapDays(previewDeltaMs))} → ${toDateIso(b + snapDays(previewDeltaMs))}`
        : null;

    return (
      <div
        key={c.id}
        className="grid items-center border-b text-sm last:border-b-0"
        style={{ gridTemplateColumns: "200px 1fr" }}
      >
        <Link
          to={adminSpaTo(`/admin/brand/campaigns/${c.id}`)}
          className="sticky left-0 z-10 flex items-center gap-1 truncate border-r bg-white px-2 py-2 font-medium hover:underline"
        >
          <span className="min-w-0 truncate">{c.name}</span>
          {c.unlinked ? (
            <span title="Not linked to a plan">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Not linked to a plan" />
            </span>
          ) : null}
          {c.out_of_plan ? (
            <span title="Outside plan quarter">
              <Clock className="h-3.5 w-3.5 shrink-0 text-red-600" aria-label="Outside plan quarter" />
            </span>
          ) : null}
        </Link>
        <div className="relative h-10 border-l">
          {a != null ? (
            <>
              {dragDates ? (
                <div className="pointer-events-none absolute -top-6 left-1/2 z-20 -translate-x-1/2 rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-white">
                  {dragDates}
                </div>
              ) : null}
              <div
                role={canDrag ? "button" : undefined}
                tabIndex={canDrag ? 0 : undefined}
                className={cn(
                  "absolute top-2 flex h-6 items-center justify-center overflow-hidden rounded opacity-90",
                  barClass,
                  canDrag ? "cursor-grab touch-none active:cursor-grabbing" : "",
                  reschedulingId === c.id && "animate-pulse ring-2 ring-violet-400",
                )}
                style={{ left: `${left}%`, width: `${width}%`, minWidth: "4px" }}
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
                  setPreviewDeltaMs((deltaPx / rect.width) * span);
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
              >
                {width > 8 ? (
                  <span className="truncate px-1 text-[9px] font-medium text-white drop-shadow-sm">{c.name}</span>
                ) : null}
                {!canDrag && c.stage !== "planning" ? (
                  <Lock className="h-3 w-3 text-white/90" aria-label="Flight locked" />
                ) : null}
              </div>
            </>
          ) : (
            <span className="px-2 text-xs text-zinc-400">No flight dates</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div ref={scrollRef} className="max-h-[calc(100dvh-14rem)] overflow-auto rounded-xl border border-gray-200">
      <div className="min-w-[720px]">
        <div
          className="sticky top-0 z-20 grid border-b bg-zinc-50 text-xs text-zinc-500"
          style={{ gridTemplateColumns: "200px 1fr" }}
        >
          <div className="sticky left-0 z-30 border-r bg-zinc-50 px-2 py-1 font-medium text-zinc-700">Campaign</div>
          <div className="relative">
            <div className="flex border-b border-zinc-200/80">
              {months.map((m) => (
                <div
                  key={`${m.label}-${m.startIdx}`}
                  className="border-l border-zinc-200/80 px-1 py-1 text-center font-medium tabular-nums"
                  style={{ flex: m.span }}
                >
                  {m.label}
                </div>
              ))}
            </div>
            <div className="relative flex">
              {planBands.map((band, bi) => {
                const qStart = Date.UTC(band.year, (band.quarter - 1) * 3, 1);
                const qEnd = Date.UTC(band.year, band.quarter * 3, 0);
                if (qEnd < startMs || qStart > endMs) return null;
                const left = ((Math.max(qStart, startMs) - startMs) / span) * 100;
                const right = ((Math.min(qEnd, endMs) - startMs) / span) * 100;
                const width = right - left;
                return (
                  <div
                    key={`${band.pillar_name}-${band.year}-Q${band.quarter}-${bi}`}
                    className={cn(
                      "pointer-events-none absolute bottom-0 top-0 border-x border-violet-200/40",
                      band.gap ? "bg-amber-100/40" : "bg-violet-100/30",
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${band.pillar_name} Q${band.quarter} ${band.year}${band.gap ? " · gap" : ""}`}
                    aria-hidden
                  />
                );
              })}
              {weeks.map((w, i) => (
                <div key={w} className="relative z-[1] flex-1 border-l px-1 py-1 tabular-nums">
                  {i % 2 === 0 ? new Date(w).toISOString().slice(5, 10) : ""}
                </div>
              ))}
              {todayLeftPct >= 0 && todayLeftPct <= 100 ? (
                <div
                  className="pointer-events-none absolute bottom-0 top-0 z-[2] w-px bg-rose-500"
                  style={{ left: `${todayLeftPct}%` }}
                  aria-hidden
                />
              ) : null}
            </div>
          </div>
        </div>

        {grouped.map((group) => {
          const collapsed = group.label != null && collapsedPillars.has(group.key);
          return (
            <div key={group.key}>
              {group.label != null ? (
                <button
                  type="button"
                  className="sticky left-0 flex w-full items-center gap-2 border-b bg-violet-50/80 px-3 py-1.5 text-left text-xs font-semibold text-violet-900"
                  onClick={() =>
                    setCollapsedPillars((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                >
                  <span>{collapsed ? "▸" : "▾"}</span>
                  {group.label}
                  <span className="font-normal text-violet-700">({group.items.length})</span>
                </button>
              ) : null}
              {!collapsed ? group.items.map((c) => renderRow(c)) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});
