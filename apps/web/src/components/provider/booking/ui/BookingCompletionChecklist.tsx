"use client";

import { useTranslation } from "@beautonomi/i18n";

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChecklistItem } from "@beautonomi/provider-booking";
import { BookingSectionCard } from "./BookingSectionCard";
import { BookingSectionLabel } from "./BookingSectionLabel";

interface BookingCompletionChecklistProps {
  items: ChecklistItem[];
  allDone?: boolean;
  blockingLabels?: string[];
  /** The visit is already completed, so these rows are leftover close-out, not a block on completing. */
  alreadyFinished?: boolean;
  className?: string;
  onPressItem?: (itemId: ChecklistItem["id"]) => void;
}

export function BookingCompletionChecklist({
  items,
  allDone,
  blockingLabels = [],
  alreadyFinished = false,
  className,
  onPressItem,
}: BookingCompletionChecklistProps) {
  const { t } = useTranslation();
  return (
    <BookingSectionCard className={className}>
      <BookingSectionLabel className="mb-3">
        {t(
          alreadyFinished
            ? "web.provider.bookings.detail.completion.stillOpen"
            : "web.provider.bookings.detail.completion.beforeCompleting",
        )}
      </BookingSectionLabel>
      <ul className="space-y-2">
        {items.map((item) => {
          const row = (
            <>
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
            </>
          );
          if (onPressItem && !item.done) {
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-lg px-1 py-0.5 text-start hover:bg-amber-100/80"
                  onClick={() => onPressItem(item.id)}
                >
                  {row}
                </button>
              </li>
            );
          }
          return (
            <li key={item.id} className="flex items-start gap-2">
              {row}
            </li>
          );
        })}
      </ul>
      {!alreadyFinished && !allDone && blockingLabels.length > 0 ? (
        <p className="mt-3 text-xs text-amber-800">
          {t("web.provider.bookings.detail.completion.blockedItems", { items: blockingLabels.join(", ") })}
        </p>
      ) : null}
    </BookingSectionCard>
  );
}
