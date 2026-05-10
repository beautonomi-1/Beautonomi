"use client";

const ACCENT = "var(--primary, #FF0077)";
const BG = "#F3F4F6";
const TEXT_PRIMARY = "#111827";
const TEXT_SECONDARY = "#6B7280";

/**
 * Human-readable full-screen loading state for payment / checkout flows
 * (used where a bare spinner alone is easy to misread as a frozen page).
 */
export function PaymentLoadingHero({
  title = "Please wait",
  subtitle = "We are preparing your checkout…",
}: {
  title?: string;
  subtitle?: string | null;
}) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: BG }}
    >
      <div
        className="w-11 h-11 rounded-full border-2 border-t-transparent animate-spin mb-5"
        style={{ borderColor: ACCENT }}
        aria-hidden
      />
      <p className="text-lg font-bold text-center max-w-sm" style={{ color: TEXT_PRIMARY }}>
        {title}
      </p>
      {subtitle ? (
        <p className="text-sm text-center mt-3 max-w-sm leading-relaxed" style={{ color: TEXT_SECONDARY }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
