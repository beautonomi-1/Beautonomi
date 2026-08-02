"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

function formatRelativeUpdate(ms: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (delta < 5) return "just now";
  if (delta < 60) return `${delta}s ago`;
  return `${Math.floor(delta / 60)}m ago`;
}

interface BookingLiveSyncIndicatorProps {
  lastUpdatedAt: number | null;
  className?: string;
}

export function BookingLiveSyncIndicator({ lastUpdatedAt, className }: BookingLiveSyncIndicatorProps) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!lastUpdatedAt) return;
    const timer = setInterval(() => tick((n) => n + 1), 15000);
    return () => clearInterval(timer);
  }, [lastUpdatedAt]);

  if (!lastUpdatedAt) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800",
        className,
      )}
    >
      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      <Radio className="h-3 w-3" />
      Live · updated {formatRelativeUpdate(lastUpdatedAt)}
    </div>
  );
}
