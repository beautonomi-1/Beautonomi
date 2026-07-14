/**
 * CustomOfferCard — shared React (web) card for custom-offer chat bubbles.
 *
 * Design mirrors the native card: white card with a 4 px accent stripe, a status
 * pill in the top-right corner, and role-driven CTA buttons. Styled with Tailwind.
 *
 * Used by the web customer messages page and the provider messaging client so
 * both sides see an identical card design.
 */
import React from "react";
import {
  getOfferEffectiveStatus,
  getStatusAccentColor,
  shouldShowCustomerAcceptCta,
  shouldShowCustomerResumeCta,
  shouldShowCustomerRequestChangesCta,
  shouldShowProviderEditCta,
  shouldShowViewBookingCta,
  shouldShowWithdrawCta,
  type CustomOfferAttachmentBase,
  type OfferStatusOverride,
} from "../customOfferCardLogic";

// ── Palette ──────────────────────────────────────────────────────────────────
const STRIPE: Record<string, string> = {
  active: "#FF0077",
  paid: "#059669",
  pending: "#D97706",
  muted: "#9CA3AF",
};

const BADGE_BG: Record<string, string> = {
  paid: "bg-emerald-50 text-emerald-700",
  processing: "bg-amber-50 text-amber-700",
  expired: "bg-amber-50 text-amber-600",
  declined: "bg-red-50 text-red-600",
  withdrawn: "bg-gray-100 text-gray-500",
  needs_support: "bg-red-50 text-red-600",
  changes_requested: "bg-blue-50 text-blue-700",
};

function formatMoney(price: number, currency?: string): string {
  if (!currency) return price.toFixed(2);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(price);
  } catch {
    return `${currency} ${price.toFixed(2)}`;
  }
}

function formatPreferredStart(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return (
    d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

function formatExpiry(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return (
    "Expires " +
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " at " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export type CustomOfferCardProps = {
  attachment: CustomOfferAttachmentBase;
  statusOverride?: OfferStatusOverride;
  /** Whether this message was sent by the current user (determines CTA visibility). */
  isMe: boolean;
  role: "customer" | "provider";
  /** Called when the card body is clicked (open detail modal). */
  onClick?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onRequestChanges?: () => void;
  onResume?: () => void;
  /** Provider: retract/withdraw the offer. */
  onWithdraw?: () => void;
  /** Provider (web): edit and resend the offer. */
  onEdit?: () => void;
  onViewBooking?: () => void;
  /** Called when the customer taps "Contact support" on a finalize_failed card. */
  onContactSupport?: () => void;
  /** When true, the decline button shows a loading spinner. */
  isDeclineLoading?: boolean;
  className?: string;
};

export function CustomOfferCard({
  attachment,
  statusOverride,
  isMe,
  role,
  onClick,
  onAccept,
  onDecline,
  onRequestChanges,
  onResume,
  onWithdraw,
  onEdit,
  onViewBooking,
  onContactSupport,
  isDeclineLoading = false,
  className = "",
}: CustomOfferCardProps) {
  const s = getOfferEffectiveStatus(attachment, statusOverride);
  const accentType = getStatusAccentColor(s);
  const stripeColor = STRIPE[accentType] ?? STRIPE.active;

  const showAccept = shouldShowCustomerAcceptCta(s, isMe);
  const showRequestChanges = shouldShowCustomerRequestChangesCta(s, isMe);
  const showResume = shouldShowCustomerResumeCta(s, isMe);
  const showViewBooking = shouldShowViewBookingCta(s);
  const showWithdraw = shouldShowWithdrawCta(s, isMe, role);
  const showEdit = shouldShowProviderEditCta(s, isMe, role);

  const preferredLabel = formatPreferredStart(attachment.preferred_start_at);
  const expiryLabel = !s.isInactive ? formatExpiry(attachment.expiration_at) : null;

  const badgeCls = s.badge ? (BADGE_BG[s.badge.type] ?? "bg-gray-100 text-gray-600") : "";

  return (
    <div
      className={[
        "rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm max-w-[300px] w-full",
        s.isMuted ? "opacity-70" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Accent stripe */}
      <div style={{ height: 4, backgroundColor: stripeColor }} />

      {/* Body */}
      <div
        className={["px-3.5 pt-3 pb-2.5", onClick ? "cursor-pointer hover:bg-gray-50 transition-colors" : ""].join(" ")}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
      >
        {/* Header: label + badge */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold tracking-[1.4px] text-gray-400 uppercase">Custom offer</span>
          {s.badge ? (
            <span
              className={["text-[10px] font-bold tracking-[0.4px] px-2 py-0.5 rounded-full flex items-center gap-1", badgeCls].join(" ")}
            >
              {s.badge.type === "processing" ? (
                <span className="inline-block w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : null}
              {s.badge.label}
            </span>
          ) : null}
        </div>

        {/* Price */}
        {typeof attachment.price === "number" ? (
          <p className="text-xl font-bold text-gray-900 mb-0.5">
            {formatMoney(attachment.price, attachment.currency)}
          </p>
        ) : null}

        {/* Duration */}
        {attachment.duration_minutes ? (
          <p className="text-xs text-gray-500">{attachment.duration_minutes} min</p>
        ) : null}

        {/* Preferred start */}
        {preferredLabel && !s.isInactive ? (
          <p className="text-xs text-gray-500 mt-0.5">{preferredLabel}</p>
        ) : null}

        {/* Expiry */}
        {expiryLabel ? (
          <p className="text-xs text-amber-600 mt-1">{expiryLabel}</p>
        ) : null}

        {s.isChangesRequested && attachment.change_request_note ? (
          <p className="text-xs text-blue-700 mt-2 bg-blue-50 rounded-md px-2 py-1.5">
            <span className="font-semibold">Requested changes: </span>
            {attachment.change_request_note}
          </p>
        ) : null}

        {/* finalize_failed: surface payment reference so the customer can quote it to support */}
        {s.isFinalizeFailed && attachment.payment_reference ? (
          <p className="text-[10px] text-gray-400 mt-1.5">
            Ref: <span className="font-mono">{attachment.payment_reference}</span>
          </p>
        ) : null}

        {/* Tap hint */}
        {onClick && !s.isInactive ? (
          <p className="text-[10px] text-gray-300 mt-2">Tap for details</p>
        ) : null}
      </div>

      {/* Footer CTAs */}
      {(showAccept || showRequestChanges || showResume || showViewBooking || showWithdraw || showEdit || s.isFinalizeFailed) ? (
        <div className="px-3.5 pb-3 pt-2 border-t border-gray-100 flex flex-col gap-2">
          {showAccept ? (
            <>
              <button
                type="button"
                onClick={onAccept}
                className="w-full rounded-lg py-2 text-xs font-bold text-white transition-opacity active:opacity-80"
                style={{ backgroundColor: "#FF0077" }}
              >
                Accept &amp; pay
              </button>
              {showRequestChanges ? (
                <button
                  type="button"
                  onClick={onRequestChanges}
                  className="w-full rounded-lg py-2 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  Request changes
                </button>
              ) : null}
              <button
                type="button"
                onClick={onDecline}
                disabled={isDeclineLoading}
                className="w-full rounded-lg py-2 text-xs font-semibold text-gray-500 border border-gray-200 bg-transparent hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {isDeclineLoading ? (
                  <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : "Decline"}
              </button>
            </>
          ) : null}

          {showResume ? (
            <button
              type="button"
              onClick={onResume}
              className="w-full rounded-lg py-2 text-xs font-bold border-2 border-[#FF0077] text-[#FF0077] bg-transparent hover:bg-pink-50 transition-colors"
            >
              Resume payment
            </button>
          ) : null}

          {showViewBooking ? (
            <button
              type="button"
              onClick={onViewBooking}
              className="w-full rounded-lg py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
            >
              View booking
            </button>
          ) : null}

          {s.isFinalizeFailed && role === "customer" ? (
            <button
              type="button"
              onClick={onContactSupport}
              className="w-full rounded-lg py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors"
            >
              Contact support
            </button>
          ) : null}

          {showWithdraw && !showViewBooking ? (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={onWithdraw}
                className="flex-1 rounded-lg py-2 text-xs font-semibold text-gray-500 border border-gray-200 bg-transparent hover:bg-gray-50 transition-colors"
              >
                Retract
              </button>
              {(showEdit || onEdit) ? (
                <button
                  type="button"
                  onClick={onEdit}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold text-gray-600 border border-gray-200 bg-transparent hover:bg-gray-50 transition-colors"
                >
                  {s.isChangesRequested ? "Edit offer" : "Edit &amp; resend"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
