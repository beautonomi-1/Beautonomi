"use client";

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@beautonomi/provider-booking";
import { BookingSectionCard } from "./BookingSectionCard";
import { BookingSectionLabel } from "./BookingSectionLabel";

interface BookingCompletionChecklistProps {
  items: ChecklistItem[];
  allDone?: boolean;
  blockingLabels?: string[];
  className?: string;
}

export function BookingCompletionChecklist({
  items,
  allDone,
  blockingLabels = [],
  className,
}: BookingCompletionChecklistProps) {
  return (
    <BookingSectionCard className={className}>
      <BookingSectionLabel className="mb-3">Before completing</BookingSectionLabel>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2">
            {item.done ? (
              <Check className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 mt-0.5 text-gray-300" />
            )}
            <div className="min-w-0">
              <p className={cn("text-sm", item.done ? "text-gray-500 line-through" : "text-gray-900")}>
                {item.label}
              </p>
              {item.detail && !item.done ? (
                <p className="text-xs text-amber-700">{item.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {!allDone && blockingLabels.length > 0 ? (
        <p className="mt-3 text-xs text-amber-800">
          Blocked: {blockingLabels.join(", ")}
        </p>
      ) : null}
    </BookingSectionCard>
  );
}
