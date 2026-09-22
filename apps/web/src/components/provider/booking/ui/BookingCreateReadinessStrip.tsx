"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, Circle } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import type { CreateReadinessSummary } from "@beautonomi/provider-booking";
import { cn } from "@/lib/utils";

type Props = {
  summary: CreateReadinessSummary;
  onJumpToSection?: (sectionKey: string, participantIndex?: number) => void;
  forceExpanded?: boolean;
  className?: string;
};

const DEFAULT_LABELS: Record<string, string> = {
  group_date: "Date",
  group_time: "Time slot",
  group_duration: "Duration",
  group_service: "Default service",
  group_staff: "Team member",
  group_address: "At-home address",
  group_participants: "Participants",
  booking_client: "Client",
  booking_services: "Services or products",
  booking_schedule: "Date & time",
  booking_staff: "Staff assignment",
  booking_location: "Service address",
  booking_intake: "Client forms",
  booking_recurring: "Repeating series",
};

function participantLabel(id: string): string | null {
  const m = /^group_participant_(\d+)$/.exec(id);
  if (!m) return null;
  return `Participant ${Number(m[1]) + 1}`;
}

export function BookingCreateReadinessStrip({
  summary,
  onJumpToSection,
  forceExpanded = false,
  className,
}: Props) {
  const { t } = useTranslation();
  const rc = (key: string, opts?: Record<string, unknown>) =>
    t(`web.provider.bookings.createReadiness.${key}`, opts) as string;
  const [expanded, setExpanded] = useState(false);
  const showList = expanded || forceExpanded;
  const { completed, total, percent, nextItem } = summary;

  if (total === 0) return null;

  const labelFor = (id: string) => {
    const part = participantLabel(id);
    if (part) return part;
    const fromI18n = t(`web.provider.bookings.createReadiness.items.${id}`, {
      defaultValue: "",
    }) as string;
    if (fromI18n) return fromI18n;
    return DEFAULT_LABELS[id] ?? id;
  };

  const nextLabel = nextItem ? labelFor(nextItem.id) : null;

  return (
    <div
      className={cn(
        "mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/80 px-3 py-2.5",
        className,
      )}
      role="status"
      aria-label={rc("a11ySummary", { completed, total })}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
          {rc("title", { completed, total })}
        </span>
        <span className="text-xs font-bold text-indigo-700">{percent}%</span>
      </div>
      <div
        className="mb-2 h-1.5 overflow-hidden rounded-full bg-indigo-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
      >
        <div
          className="h-full bg-indigo-600 transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
      {nextLabel && !showList && onJumpToSection && nextItem ? (
        <button
          type="button"
          className="flex w-full items-center text-start text-sm font-medium text-indigo-900 hover:underline"
          onClick={() => {
            const idx =
              nextItem.id.startsWith("group_participant_") ?
                Number(nextItem.id.replace("group_participant_", ""))
              : undefined;
            onJumpToSection(nextItem.sectionKey, idx);
          }}
        >
          {rc("next", { label: nextLabel })}
        </button>
      ) : null}
      <button
        type="button"
        className="mt-1 flex items-center text-xs font-semibold text-indigo-700"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={showList}
      >
        {showList ? rc("hideRequirements") : rc("showRequirements")}
        {showList ?
          <ChevronUp className="ms-1 h-3.5 w-3.5" />
        : <ChevronDown className="ms-1 h-3.5 w-3.5" />}
      </button>
      {showList ?
        <ul className="mt-2 space-y-1 border-t border-indigo-100 pt-2">
          {summary.items
            .filter((i) => i.required)
            .map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={item.done || !onJumpToSection}
                  className={cn(
                    "flex w-full items-center gap-1.5 py-0.5 text-start text-xs",
                    item.done ? "text-gray-500 line-through" : "text-indigo-950 hover:underline",
                  )}
                  onClick={() => {
                    if (item.done || !onJumpToSection) return;
                    const idx =
                      item.id.startsWith("group_participant_") ?
                        Number(item.id.replace("group_participant_", ""))
                      : undefined;
                    onJumpToSection(item.sectionKey, idx);
                  }}
                >
                  {item.done ?
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  : <Circle className="h-3.5 w-3.5 shrink-0 text-indigo-500" />}
                  {labelFor(item.id)}
                </button>
              </li>
            ))}
        </ul>
      : null}
    </div>
  );
}
