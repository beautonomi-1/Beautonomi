"use client";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MODE_ACCENT, MODE_LABEL, type BookingSheetMode } from "../tokens";

interface BookingBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: BookingSheetMode;
  title?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function BookingBottomSheet({
  open,
  onOpenChange,
  mode,
  title,
  header,
  footer,
  children,
  className,
}: BookingBottomSheetProps) {
  const accent = MODE_ACCENT[mode];
  const resolvedTitle = title ?? MODE_LABEL[mode];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "flex flex-col p-0 gap-0 max-w-2xl mx-auto w-full h-[min(92vh,900px)] overflow-hidden",
          className,
        )}
      >
        <SheetTitle className="sr-only">{resolvedTitle}</SheetTitle>

        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 shrink-0">
          <div className="h-1 w-10 rounded-full bg-gray-300" aria-hidden />
        </div>

        {/* Mode accent bar */}
        <div className="h-1 w-full shrink-0" style={{ backgroundColor: accent }} />

        {/* Sticky header */}
        <div className="sticky top-0 z-10 shrink-0 border-b bg-white px-4 py-3">
          {header ?? (
            <h2 className="text-lg font-semibold text-gray-900 truncate">{resolvedTitle}</h2>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>

        {/* Sticky footer */}
        {footer ? (
          <div className="sticky bottom-0 z-10 shrink-0 border-t bg-white px-4 py-3 safe-area-pb">
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
