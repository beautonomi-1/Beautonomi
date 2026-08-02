"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PermissionGateInlineProps {
  allowed: boolean;
  message?: string;
  children?: React.ReactNode;
  className?: string;
}

/** Inline permission gate — renders children when allowed, otherwise a compact notice. */
export function PermissionGateInline({
  allowed,
  message = "You do not have permission for this action.",
  children,
  className,
}: PermissionGateInlineProps) {
  if (allowed) return <>{children}</>;

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600",
        className,
      )}
    >
      <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}
