/**
 * CustomOfferCard — shared React Native card for custom-offer chat bubbles.
 *
 * Design: white card with a 4 px gradient accent stripe that reflects status,
 * a status pill in the top-right corner, and role-driven CTA buttons.
 *
 * Used by both the customer and provider mobile apps so the card looks
 * identical regardless of which app the user is in.
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import {
  getOfferEffectiveStatus,
  getStatusAccentColor,
  shouldShowCustomerAcceptCta,
  shouldShowCustomerResumeCta,
  shouldShowViewBookingCta,
  shouldShowWithdrawCta,
  type CustomOfferAttachmentBase,
  type OfferStatusOverride,
} from "../customOfferCardLogic";

// ── Palette ──────────────────────────────────────────────────────────────────
const ACCENT_ACTIVE = "#FF0077";   // primary
const ACCENT_PAID = "#059669";     // emerald-600
const ACCENT_PENDING = "#D97706";  // amber-600
const ACCENT_MUTED = "#9CA3AF";    // gray-400
const BORDER_COLOR = "#E5E7EB";
const TEXT_STRONG = "#111827";
const TEXT_SOFT = "#6B7280";

function stripeColor(type: "active" | "paid" | "pending" | "muted"): string {
  if (type === "paid") return ACCENT_PAID;
  if (type === "pending") return ACCENT_PENDING;
  if (type === "muted") return ACCENT_MUTED;
  return ACCENT_ACTIVE;
}

function badgeBg(type: string): string {
  if (type === "paid") return "rgba(5,150,105,0.12)";
  if (type === "processing") return "rgba(217,119,6,0.12)";
  if (type === "expired") return "rgba(245,158,11,0.12)";
  if (type === "declined" || type === "needs_support") return "rgba(220,38,38,0.10)";
  if (type === "withdrawn") return "rgba(156,163,175,0.18)";
  return "rgba(0,0,0,0.06)";
}

function badgeText(type: string): string {
  if (type === "paid") return ACCENT_PAID;
  if (type === "processing") return ACCENT_PENDING;
  if (type === "expired") return "#B45309";
  if (type === "declined" || type === "needs_support") return "#DC2626";
  if (type === "withdrawn") return "#6B7280";
  return TEXT_STRONG;
}

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
  /** Called when the card body is tapped (open detail modal). */
  onPress?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onResume?: () => void;
  onWithdraw?: () => void;
  onViewBooking?: () => void;
  /** Customer: tapped "Contact support" on a finalize_failed card. */
  onContactSupport?: () => void;
  style?: ViewStyle;
};

export function CustomOfferCard({
  attachment,
  statusOverride,
  isMe,
  role,
  onPress,
  onAccept,
  onDecline,
  onResume,
  onWithdraw,
  onViewBooking,
  onContactSupport,
  style,
}: CustomOfferCardProps) {
  const s = getOfferEffectiveStatus(attachment, statusOverride);
  const accentType = getStatusAccentColor(s);
  const stripe = stripeColor(accentType);

  const showAccept = shouldShowCustomerAcceptCta(s, isMe);
  const showResume = shouldShowCustomerResumeCta(s, isMe);
  const showViewBooking = shouldShowViewBookingCta(s);
  const showWithdraw = shouldShowWithdrawCta(s, isMe, role);

  const preferredLabel = formatPreferredStart(attachment.preferred_start_at);
  const expiryLabel = !s.isInactive ? formatExpiry(attachment.expiration_at) : null;

  return (
    <View
      style={[
        styles.card,
        s.isMuted && styles.cardMuted,
        style,
      ]}
    >
      {/* Gradient accent stripe */}
      <View style={[styles.stripe, { backgroundColor: stripe }]} />

      <TouchableOpacity
        activeOpacity={onPress ? 0.85 : 1}
        onPress={onPress}
        accessibilityRole="button"
        style={styles.body}
      >
        {/* Header row: label + badge */}
        <View style={styles.headerRow}>
          <Text style={styles.labelText}>CUSTOM OFFER</Text>
          {s.badge ? (
            <View style={[styles.badge, { backgroundColor: badgeBg(s.badge.type) }]}>
              {s.badge.type === "processing" ? (
                <ActivityIndicator size="small" color={badgeText("processing")} style={{ marginRight: 4 }} />
              ) : null}
              <Text style={[styles.badgeText, { color: badgeText(s.badge.type) }]}>
                {s.badge.label}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Price */}
        {typeof attachment.price === "number" ? (
          <Text style={styles.price}>{formatMoney(attachment.price, attachment.currency)}</Text>
        ) : null}

        {/* Duration */}
        {attachment.duration_minutes ? (
          <Text style={styles.secondary}>{attachment.duration_minutes} min</Text>
        ) : null}

        {/* Preferred start */}
        {preferredLabel && !s.isInactive ? (
          <Text style={styles.secondary}>{preferredLabel}</Text>
        ) : null}

        {/* Expiry */}
        {expiryLabel ? (
          <Text style={[styles.secondary, { color: ACCENT_PENDING }]}>{expiryLabel}</Text>
        ) : null}

        {/* finalize_failed: surface payment reference so the customer can quote it to support */}
        {s.isFinalizeFailed && attachment.payment_reference ? (
          <Text style={[styles.secondary, { fontSize: 10, marginTop: 6 }]}>
            Ref: {attachment.payment_reference}
          </Text>
        ) : null}

        {/* Tap hint */}
        {onPress && !s.isInactive ? (
          <Text style={styles.tapHint}>Tap for details</Text>
        ) : null}
      </TouchableOpacity>

      {/* Footer CTAs */}
      {(showAccept || showResume || showViewBooking || showWithdraw || s.isFinalizeFailed) ? (
        <View style={styles.footer}>
          {showAccept ? (
            <>
              <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnPrimary]} onPress={onAccept} activeOpacity={0.85}>
                <Text style={styles.ctaBtnPrimaryText}>Accept &amp; pay</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnGhost]} onPress={onDecline} activeOpacity={0.85}>
                <Text style={styles.ctaBtnGhostText}>Decline</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {showResume ? (
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnOutline]} onPress={onResume} activeOpacity={0.85}>
              <Text style={styles.ctaBtnOutlineText}>Resume payment</Text>
            </TouchableOpacity>
          ) : null}

          {showViewBooking ? (
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnPaid]} onPress={onViewBooking} activeOpacity={0.85}>
              <Text style={styles.ctaBtnPaidText}>View booking</Text>
            </TouchableOpacity>
          ) : null}

          {s.isFinalizeFailed && role === "customer" ? (
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnDanger]} onPress={onContactSupport} activeOpacity={0.85}>
              <Text style={styles.ctaBtnDangerText}>Contact support</Text>
            </TouchableOpacity>
          ) : null}

          {showWithdraw && !showViewBooking ? (
            <TouchableOpacity style={[styles.ctaBtn, styles.ctaBtnGhost]} onPress={onWithdraw} activeOpacity={0.85}>
              <Text style={styles.ctaBtnGhostText}>Withdraw offer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    maxWidth: 300,
    width: "100%",
  },
  cardMuted: {
    opacity: 0.72,
  },
  stripe: {
    height: 4,
    width: "100%",
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  labelText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: TEXT_SOFT,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  price: {
    fontSize: 22,
    fontWeight: "700",
    color: TEXT_STRONG,
    marginBottom: 4,
  },
  secondary: {
    fontSize: 12,
    color: TEXT_SOFT,
    marginTop: 2,
  },
  tapHint: {
    fontSize: 10,
    color: "#D1D5DB",
    marginTop: 8,
  },
  footer: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    gap: 8,
  },
  ctaBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnPrimary: {
    backgroundColor: ACCENT_ACTIVE,
  },
  ctaBtnPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  ctaBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  ctaBtnGhostText: {
    color: TEXT_SOFT,
    fontSize: 13,
    fontWeight: "600",
  },
  ctaBtnOutline: {
    borderWidth: 1.5,
    borderColor: ACCENT_ACTIVE,
    backgroundColor: "transparent",
  },
  ctaBtnOutlineText: {
    color: ACCENT_ACTIVE,
    fontSize: 13,
    fontWeight: "700",
  },
  ctaBtnPaid: {
    backgroundColor: ACCENT_PAID,
  },
  ctaBtnPaidText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  ctaBtnDanger: {
    backgroundColor: "#DC2626",
  },
  ctaBtnDangerText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
