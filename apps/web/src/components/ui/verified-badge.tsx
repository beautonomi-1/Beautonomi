"use client";

/**
 * Compact identity-verification badge used across provider web surfaces (clients,
 * bookings, messaging, product orders) and account headers to show whether a
 * user has completed identity verification.
 *
 * - verified=true  → green "Verified" pill with a shield checkmark.
 * - verified=false → neutral "Unverified" pill (only when showUnverified).
 *
 * Use iconOnly for tight rows (just the icon, still accessible via title/aria).
 */
import { ShieldCheck, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  verified: boolean | null | undefined;
  showUnverified?: boolean;
  iconOnly?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function VerifiedBadge({
  verified,
  showUnverified = false,
  iconOnly = false,
  size = "sm",
  className,
}: VerifiedBadgeProps) {
  const isVerified = Boolean(verified);
  if (!isVerified && !showUnverified) return null;

  const label = isVerified ? "Verified" : "Unverified";
  const a11y = isVerified ? "Identity verified" : "Identity not verified";
  const iconClass = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  if (iconOnly) {
    return isVerified ? (
      <ShieldCheck
        className={cn("text-green-600 shrink-0", iconClass, className)}
        aria-label={a11y}
      />
    ) : (
      <Shield
        className={cn("text-gray-400 shrink-0", iconClass, className)}
        aria-label={a11y}
      />
    );
  }

  return (
    <span
      aria-label={a11y}
      title={a11y}
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-semibold leading-none",
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
        isVerified
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-500",
        className,
      )}
    >
      {isVerified ? (
        <ShieldCheck className={iconClass} />
      ) : (
        <Shield className={iconClass} />
      )}
      {label}
    </span>
  );
}

export default VerifiedBadge;
