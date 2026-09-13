"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  CreditCard,
  Calendar,
  MapPin,
  Wallet,
  Gift,
  Banknote,
  Check,
  Plus,
  Shield,
  ArrowLeft,
  Lock,
  Info,
  Heart,
  Repeat,
  Clock,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { BookingState, type BookingStep } from "../booking-flow";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { initializePayment } from "../../actions/payment-actions";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { getTravelBuffer } from "@/lib/config/house-call-config";
import { fetcher } from "@/lib/http/fetcher";
import { getUserFacingMessage, extractErrorCode } from "@/lib/errors/user-messages";
import { useTranslation, buildCancellationPolicyLines, cancellationRequiresAck } from "@beautonomi/i18n";
import type { CancellationPolicyView } from "@beautonomi/i18n";
import LoginModal from "@/components/global/login-modal";
import { useMultipleFeatureFlags } from "@/hooks/useFeatureFlag";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { subscribeRecurringEligible } from "@/lib/recurring/subscribe-recurring-eligibility";
import { formatLocalDateYYYYMMDD } from "@/lib/dates/format-local-date-yyyymmdd";
import { reconcileBookingInstantWithSlotLabel } from "@/lib/bookings/reconcile-booking-instant-with-slot-label";
import { getHoldTimeRemaining, lineHasHouseCallAdjustment, percentOf, serverNowToClockOffsetMs } from "@beautonomi/utils";
import { HouseCallLineFootnote } from "@/components/booking/HouseCallPricingNotes";

type PublicBookingCreateResult = {
  booking_id: string;
  booking_number: string;
  payment_url?: string | null;
  wallet_amount_applied?: number;
  gift_card_amount_applied?: number;
  paystack_amount?: number;
  recurring_subscription?: { created: boolean; pending?: boolean; message?: string };
};

type HoldVerificationResponse = {
  data?: {
    expires_at?: string | null;
    server_now?: string | null;
  };
  expires_at?: string | null;
  server_now?: string | null;
};

interface SavedCard {
  id: string;
  type: string;
  card_type?: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  expiry_label?: string;
  is_expired?: boolean;
  cardholder_name?: string;
  is_default: boolean;
  is_active: boolean;
}

interface StepPaymentProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  /** Navigate by step id (works when `?package=` reorders steps). */
  onNavigateToStep: (step: BookingStep) => void | Promise<void>;
}

/** Services + add-ons + products + travel fee, minus discounts — tip percentages apply to this (before tax & platform fees). */
/**
 * Minimal UUIDv4 generator — avoids taking a runtime dep for a single
 * client-side idempotency key. Falls back to Math.random when
 * crypto.randomUUID is unavailable (very old browsers).
 */
function generateUuidV4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSubtotalAfterDiscounts(state: BookingState): number {
  let services = 0;
  if (state.isGroupBooking && state.groupParticipants) {
    services = state.groupParticipants.reduce((total, participant) => {
      const participantTotal = participant.serviceIds.reduce((sum, serviceId) => {
        const service = state.selectedServices.find((s) => s.id === serviceId);
        return sum + (service?.price || 0);
      }, 0);
      return total + participantTotal;
    }, 0);
  } else {
    services = state.selectedServices.reduce((sum, s) => sum + s.price, 0);
  }
  const addons = state.selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const products = state.selectedProducts.reduce((sum, p) => sum + p.price * p.quantity, 0);
  const travelFee = state.address?.travelFee || 0;
  const subtotal = services + addons + products + travelFee;
  const discounts =
    (state.promotions.couponDiscount || 0) +
    (state.promotions.loyaltyDiscount || 0) +
    (state.promotions.membershipDiscount || 0);
  return Math.max(0, subtotal - discounts);
}

function roundTipAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** Common preset percentages for gratuity (computed from subtotal after discounts). */
const TIP_PERCENT_PRESETS = [10, 15, 18, 20] as const;

function HoldCountdown({
  expiresAt,
  clockOffsetMs,
  onBackToCalendar,
}: {
  expiresAt: string;
  clockOffsetMs: number;
  onBackToCalendar: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [tick, setTick] = useState(() => getHoldTimeRemaining(expiresAt, clockOffsetMs));

  useEffect(() => {
    setTick(getHoldTimeRemaining(expiresAt, clockOffsetMs));
  }, [expiresAt, clockOffsetMs]);

  useEffect(() => {
    const id = setInterval(() => setTick(getHoldTimeRemaining(expiresAt, clockOffsetMs)), 1000);
    return () => clearInterval(id);
  }, [expiresAt, clockOffsetMs]);

  const urgent = !tick.expired && tick.minutes < 2;

  return (
    <div
      role="status"
      className="rounded-2xl border p-4 flex gap-3 items-start"
      style={{
        backgroundColor: tick.expired
          ? "rgba(254, 242, 242, 0.95)"
          : urgent
            ? "rgba(255, 251, 235, 0.95)"
            : "rgba(239, 246, 255, 0.95)",
        borderColor: tick.expired ? "#fecaca" : urgent ? "#fde68a" : "#bfdbfe",
      }}
    >
      <Clock
        className="h-5 w-5 shrink-0 mt-0.5"
        style={{ color: tick.expired ? "#dc2626" : urgent ? "#d97706" : "#2563eb" }}
      />
      <div
        className="min-w-0 flex-1 text-sm font-medium"
        style={{ color: tick.expired ? "#991b1b" : urgent ? "#92400e" : "#1e40af" }}
      >
        {tick.expired ? (
          <>
            <p>{t("web.booking.stepPayment.holdExpiredBody")}</p>
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              onClick={onBackToCalendar}
            >
              {t("web.booking.stepPayment.backToCalendar")}
            </Button>
          </>
        ) : (
          <p>
            {t("web.booking.stepPayment.slotHeldBefore")}
            <span className="tabular-nums">
              {tick.minutes}:{String(tick.seconds).padStart(2, "0")}
            </span>
            {t("web.booking.stepPayment.slotHeldAfter")}
          </p>
        )}
      </div>
    </div>
  );
}

export default function StepPayment({
  bookingState,
  updateBookingState,
  onNavigateToStep,
}: StepPaymentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Prefer hold created by the new booking flow (bookingState.holdId); fall back
  // to URL param for bookings started from the old /book/[slug] flow.
  const holdId = bookingState.holdId || searchParams.get("hold_id")?.trim() || null;
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(
    bookingState.holdExpiresAt ?? null
  );
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [isHoldLoading, setIsHoldLoading] = useState(false);
  const [isHoldExpired, setIsHoldExpired] = useState(false);
  const [holdLoadError, setHoldLoadError] = useState<string | null>(null);
  const adCampaignId = searchParams.get("campaign_id")?.trim() || null;
  const { user, isLoading: authLoading } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const paymentInFlightRef = useRef(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState(bookingState.tipAmount || 0);
  const [tipPercentSelection, setTipPercentSelection] = useState<number | null>(
    bookingState.tipPercentSelection ?? null
  );
  const [tipSuggestions, setTipSuggestions] = useState<number[]>([0, 50, 100, 150, 200]);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash" | "giftcard">(
    bookingState.paymentMethod || "card"
  );
  const [paymentOption, setPaymentOption] = useState<"deposit" | "full">(
    bookingState.paymentOption || "full"
  );
  const [saveCard, setSaveCard] = useState(bookingState.saveCard || false);
  const [setAsDefault, setSetAsDefault] = useState(bookingState.setAsDefault || false);
  const [acceptedCancellationPolicy, setAcceptedCancellationPolicy] = useState(false);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [isChargingCard, setIsChargingCard] = useState(false);
  const { t } = useTranslation();
  const [cancellationPolicy, setCancellationPolicy] = useState<{
    policy_text?: string | null;
    hours_before_cutoff?: number;
    late_cancellation_type?: string;
    grace_window_minutes?: number;
    late_refund_percentage?: number;
    refund_percentage?: number;
    fee_amount?: number;
    fee_type?: "fixed" | "percentage";
    no_show_fee_enabled?: boolean;
    no_show_fee_amount?: number;
    currency?: string;
  } | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [removingCardId, setRemovingCardId] = useState<string | null>(null);

  // Map cancellation policy API response (snake_case) to canonical CancellationPolicyView
  const cancellationPolicyView: CancellationPolicyView | null = cancellationPolicy
    ? (() => {
        // Prefer explicit refund percentage (refund_percentage is the raw DB field / enforcement driver;
        // late_refund_percentage is the hold-API output name), otherwise derive from the coarse type.
        const latePct = cancellationPolicy.late_refund_percentage ?? cancellationPolicy.refund_percentage;
        const lateType = cancellationPolicy.late_cancellation_type ?? "no_refund";
        const effectiveLatePct =
          latePct !== undefined && latePct !== null && !Number.isNaN(Number(latePct))
            ? Number(latePct)
            : lateType === "full_refund"
              ? 100
              : lateType === "partial_refund"
                ? 50
                : 0;
        return {
          cancellationWindowHours: cancellationPolicy.hours_before_cutoff,
          graceWindowMinutes: cancellationPolicy.grace_window_minutes,
          lateRefundPercentage: effectiveLatePct,
          noShowFeeEnabled: cancellationPolicy.no_show_fee_enabled,
          noShowFeeAmount: cancellationPolicy.no_show_fee_amount,
          currency: cancellationPolicy.currency,
          policyText: cancellationPolicy.policy_text,
        } satisfies CancellationPolicyView;
      })()
    : null;

  const cancellationPolicyContent = buildCancellationPolicyLines(cancellationPolicyView, {
    t,
    formatCurrency: (amount, cur) => formatCurrency(amount, cur || "ZAR"),
  });
  const cancellationRequiresAckForPolicy = cancellationRequiresAck(cancellationPolicyView);
  const [packageEntitlements, setPackageEntitlements] = useState<
    Array<{
      id: string;
      package_id: string;
      sessions_remaining: number;
      valid_from?: string | null;
      valid_until?: string | null;
    }>
  >([]);
  const [packageEntitlementsLoading, setPackageEntitlementsLoading] = useState(false);
  // Package catalog for the at-checkout picker (canonical pattern: package
  // can only be applied here, mirroring customer-app `book-checkout.tsx`).
  const [packageCatalog, setPackageCatalog] = useState<
    Array<{
      id: string;
      name: string;
      description?: string | null;
      price: number;
      currency: string;
      discount_percentage?: number | null;
      /** Offering IDs (services) bundled in this package — used to show only packages relevant to cart. */
      serviceOfferingIds: string[];
    }>
  >([]);
  const [packageCatalogLoading, setPackageCatalogLoading] = useState(false);
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletCurrency, setWalletCurrency] = useState<string>(tenantCurrency);
  const [walletLoading, setWalletLoading] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState<number>(30);
  const [providerRequiresDeposit, setProviderRequiresDeposit] = useState<boolean>(false);
  const useWallet = bookingState.useWallet ?? false;
  const { features: featureFlags, loading: flagsLoading } = useMultipleFeatureFlags([
    "payment_paystack",
    "gift_cards",
    "payment_wallet",
  ]);
  const paystackEnabled = flagsLoading ? true : (featureFlags["payment_paystack"] ?? false);
  const giftCardsEnabled = flagsLoading ? true : (featureFlags["gift_cards"] ?? false);
  const walletEnabled = flagsLoading ? true : (featureFlags["payment_wallet"] ?? false);
  const [cashEnabledOnPlatform, setCashEnabledOnPlatform] = useState(false);

  const saveCardInfo = useMemo(() => {
    const example = formatCurrency(1, tenantCurrency);
    return t("web.booking.stepPayment.saveCardInfo", { example });
  }, [tenantCurrency, t]);

  const returnToCalendarForHold = async () => {
    updateBookingState({
      holdId: null,
      holdExpiresAt: null,
      selectedTimeSlot: null,
      selectedSlotStart: null,
      selectedSlotEnd: null,
      selectedSlotAvailableStaffIds: null,
      availabilityRefreshToken: Date.now(),
    });
    await onNavigateToStep("calendar");
  };

  useEffect(() => {
    setHoldExpiresAt(bookingState.holdExpiresAt ?? null);
  }, [bookingState.holdExpiresAt]);

  useEffect(() => {
    if (!holdId) {
      setHoldExpiresAt(null);
      setIsHoldExpired(false);
      setHoldLoadError(t("web.booking.stepPayment.missingHoldId"));
      setIsHoldLoading(false);
      return;
    }

    let cancelled = false;
    setIsHoldLoading(true);
    setHoldLoadError(null);

    fetcher
      .get<HoldVerificationResponse>(`/api/public/booking-holds/${holdId}`, { staleTimeMs: 0 })
      .then((res) => {
        if (cancelled) return;
        const data = res?.data ?? res;
        const expiresAt =
          typeof data?.expires_at === "string"
            ? data.expires_at
            : (bookingState.holdExpiresAt ?? null);
        const serverNow = typeof data?.server_now === "string" ? data.server_now : null;
        setServerClockOffsetMs(serverNow ? serverNowToClockOffsetMs(serverNow) : 0);
        setHoldExpiresAt(expiresAt);
        setIsHoldExpired(
          expiresAt
            ? getHoldTimeRemaining(expiresAt, serverNow ? serverNowToClockOffsetMs(serverNow) : 0)
                .expired
            : false
        );
        setHoldLoadError(null);
      })
      .catch((error: { status?: number; code?: string; message?: string }) => {
        if (cancelled) return;
        const expired =
          error?.code === "HOLD_INVALID" ||
          error?.code === "HOLD_EXPIRED" ||
          (error?.status === 410 &&
            (error?.code === "HOLD_INVALID" || error?.code === "HOLD_EXPIRED"));
        const inactive = error?.code === "HOLD_INACTIVE";
        setIsHoldExpired(expired);
        setHoldLoadError(
          expired
            ? t("web.booking.stepPayment.holdExpired")
            : inactive
              ? t("web.booking.stepPayment.slotUnavailable")
              : error?.message || t("web.booking.stepPayment.holdVerifyFailed")
        );
      })
      .finally(() => {
        if (!cancelled) setIsHoldLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [holdId, bookingState.holdExpiresAt]);

  useEffect(() => {
    if (!holdExpiresAt) {
      setIsHoldExpired(false);
      return;
    }
    setIsHoldExpired(getHoldTimeRemaining(holdExpiresAt, serverClockOffsetMs).expired);
    const id = setInterval(() => {
      if (getHoldTimeRemaining(holdExpiresAt, serverClockOffsetMs).expired) {
        setIsHoldExpired(true);
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt, serverClockOffsetMs]);

  // When Paystack / gift cards / cash are disabled, switch away from that method
  useEffect(() => {
    if (paymentMethod === "card" && !paystackEnabled) {
      setPaymentMethod(giftCardsEnabled ? "giftcard" : cashEnabledOnPlatform ? "cash" : "card");
    } else if (paymentMethod === "giftcard" && !giftCardsEnabled) {
      setPaymentMethod(paystackEnabled ? "card" : cashEnabledOnPlatform ? "cash" : "giftcard");
    } else if (paymentMethod === "cash" && !cashEnabledOnPlatform) {
      setPaymentMethod(paystackEnabled ? "card" : giftCardsEnabled ? "giftcard" : "cash");
    }
  }, [paystackEnabled, giftCardsEnabled, paymentMethod, cashEnabledOnPlatform]);

  // Fetch platform fees only to determine cash availability.
  // Tax and Platform Fee amounts are computed by booking-flow.tsx from the same API and stored in
  // bookingState — we trust those values here to keep fees perfectly consistent across all steps.
  useEffect(() => {
    let cancelled = false;
    fetcher
      .get<{ data?: { cash_enabled_on_platform?: boolean } }>("/api/public/platform-fees")
      .then((res) => {
        if (cancelled) return;
        const d = res?.data as { cash_enabled_on_platform?: boolean } | undefined;
        setCashEnabledOnPlatform(d?.cash_enabled_on_platform === true);
      })
      .catch(() => {
        if (!cancelled) setCashEnabledOnPlatform(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetDefaultCard = async (cardId: string) => {
    setSettingDefaultId(cardId);
    try {
      await fetcher.patch(`/api/me/payment-methods/${cardId}`, { is_default: true });
      const listRes = await fetcher.get<{ data: SavedCard[] }>("/api/me/payment-methods");
      const active = (listRes.data || []).filter((c) => c.is_active);
      setSavedCards(active);
      toast.success(t("web.booking.stepPayment.defaultCardUpdated"));
    } catch {
      toast.error(t("web.booking.stepPayment.setDefaultFailed"));
    } finally {
      setSettingDefaultId(null);
    }
  };

  // Inline saved-card removal during checkout. We confirm first to avoid
  // accidental deletion in a dense list, then optimistically prune the local
  // state and re-pick the next default so the customer can keep checking out
  // without an extra refresh round-trip.
  const handleRemoveSavedCard = async (cardId: string) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        t("web.booking.stepPayment.removeCardConfirm")
      );
      if (!ok) return;
    }
    setRemovingCardId(cardId);
    try {
      await fetcher.delete(`/api/me/payment-methods/${cardId}`);
      const next = savedCards.filter((c) => c.id !== cardId);
      setSavedCards(next);
      if (selectedCardId === cardId) {
        const fallback = next.find((c) => c.is_default) || next[0] || null;
        if (fallback) {
          setSelectedCardId(fallback.id);
          setUseNewCard(false);
        } else {
          setSelectedCardId(null);
          setUseNewCard(true);
        }
      }
      toast.success(t("web.booking.stepPayment.cardRemoved"));
    } catch {
      toast.error(t("web.booking.stepPayment.removeCardFailed"));
    } finally {
      setRemovingCardId(null);
    }
  };

  // Fetch cancellation policy for the provider
  useEffect(() => {
    const fetchCancellationPolicy = async () => {
      if (!bookingState.providerId) return;

      try {
        const locationType = bookingState.mode === "salon" ? "at_salon" : "at_home";
        // First try to get policy for specific location type
        let response = await fetcher.get<{ data: any[] }>(
          `/api/public/cancellation-policy?provider_id=${bookingState.providerId}&location_type=${locationType}`
        );

        // If no specific policy, try to get general policy (location_type = null)
        if (!response.data || response.data.length === 0) {
          response = await fetcher.get<{ data: any[] }>(
            `/api/public/cancellation-policy?provider_id=${bookingState.providerId}`
          );
        }

        if (response.data && response.data.length > 0) {
          setCancellationPolicy(response.data[0]);
        }
      } catch (error) {
        console.error("Error fetching cancellation policy:", error);
        // Set a default policy if fetch fails (canonical default: 24h cutoff, no refund on late cancel)
        setCancellationPolicy({
          policy_text:
            t("web.booking.stepPayment.defaultPolicyText"),
          hours_before_cutoff: 24,
          grace_window_minutes: 15,
          late_cancellation_type: "no_refund",
          late_refund_percentage: 0,
        });
      }
    };

    fetchCancellationPolicy();
  }, [bookingState.providerId, bookingState.mode]);

  useEffect(() => {
    if (!bookingState.selectedPackage?.id || !user?.id || !bookingState.providerId) {
      setPackageEntitlements([]);
      if (bookingState.customerPackageEntitlementId) {
        updateBookingState({ customerPackageEntitlementId: undefined });
      }
      return;
    }
    let cancelled = false;
    setPackageEntitlementsLoading(true);
    const q = new URLSearchParams({
      provider_id: bookingState.providerId,
      package_id: bookingState.selectedPackage.id,
    });
    fetcher
      .get<{ data?: { entitlements?: typeof packageEntitlements } }>(
        `/api/me/package-entitlements?${q}`
      )
      .then((res) => {
        if (cancelled) return;
        setPackageEntitlements(res?.data?.entitlements ?? []);
      })
      .catch(() => {
        if (!cancelled) setPackageEntitlements([]);
      })
      .finally(() => {
        if (!cancelled) setPackageEntitlementsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, bookingState.providerId, bookingState.selectedPackage?.id, updateBookingState]);

  // Load this provider's published service packages so the customer can apply
  // one at the confirmation step (parity with customer-app book-checkout).
  useEffect(() => {
    const slug =
      searchParams.get("slug") ||
      searchParams.get("partnerId") ||
      searchParams.get("provider_id") ||
      bookingState.providerId ||
      "";
    if (!slug) {
      setPackageCatalog([]);
      return;
    }
    let cancelled = false;
    setPackageCatalogLoading(true);
    fetcher
      .get<{ data?: unknown } | unknown[]>(
        `/api/public/providers/${encodeURIComponent(slug)}/packages`
      )
      .then((res) => {
        if (cancelled) return;
        const raw = (res as { data?: unknown } | unknown) ?? null;
        const inner =
          raw &&
          typeof raw === "object" &&
          "data" in (raw as Record<string, unknown>) &&
          !Array.isArray(raw)
            ? (raw as { data: unknown }).data
            : raw;
        const arr = Array.isArray(inner) ? (inner as Array<Record<string, unknown>>) : [];
        setPackageCatalog(
          arr
            .map((p) => {
              const servicesRaw = Array.isArray(p.services)
                ? (p.services as Array<{ id?: string; type?: string }>)
                : [];
              const serviceOfferingIds = servicesRaw
                .filter((row) => !row.type || row.type === "service")
                .map((row) => String(row.id ?? "").trim())
                .filter(Boolean);
              return {
                id: String(p.id ?? ""),
                name: String(p.name ?? "Package"),
                description: (p.description as string | null | undefined) ?? null,
                price: Number(p.price) || 0,
                currency: String(p.currency ?? tenantCurrency),
                discount_percentage:
                  p.discount_percentage != null ? Number(p.discount_percentage) : null,
                serviceOfferingIds,
              };
            })
            .filter((p) => p.id)
        );
      })
      .catch(() => {
        if (!cancelled) setPackageCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setPackageCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, bookingState.providerId, tenantCurrency]);

  /** Only show packages that bundle at least one service currently in the cart. */
  const packagesRelevantToBooking = useMemo(() => {
    const selected = new Set(bookingState.selectedServices.map((s) => s.id));
    return packageCatalog.filter((pkg) => {
      const { serviceOfferingIds } = pkg;
      if (!serviceOfferingIds.length) return false;
      return serviceOfferingIds.some((oid) => selected.has(oid));
    });
  }, [packageCatalog, bookingState.selectedServices]);

  useEffect(() => {
    const id = bookingState.selectedPackage?.id;
    if (!id) return;
    if (!packagesRelevantToBooking.some((p) => p.id === id)) {
      updateBookingState({ selectedPackage: undefined, customerPackageEntitlementId: null });
    }
  }, [bookingState.selectedPackage?.id, packagesRelevantToBooking, updateBookingState]);

  // Fetch provider online booking settings: tip suggestions, deposit requirements
  useEffect(() => {
    if (!bookingState.providerId) return;
    let cancelled = false;
    fetcher
      .get<{
        data?: {
          tip_suggestions?: number[];
          deposit_required?: boolean;
          deposit_percent?: number | null;
        };
      }>(`/api/public/provider-online-booking-settings?provider_id=${bookingState.providerId}`)
      .then((res) => {
        if (cancelled) return;
        const d = res?.data;
        const tips = d?.tip_suggestions;
        setTipSuggestions(Array.isArray(tips) && tips.length > 0 ? tips : [0, 50, 100, 150, 200]);
        if (d?.deposit_required) {
          setProviderRequiresDeposit(true);
          setDepositPercentage(Number(d.deposit_percent ?? 30));
        }
      })
      .catch(() => {
        if (!cancelled) setTipSuggestions([0, 50, 100, 150, 200]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingState.providerId]);

  // True when the user has a saved card selected (not entering a new card).
  // When true we pass payment_method_id to the booking API so the server charges it
  // at the correct deposit amount, avoiding a separate client-side charge.
  const usingSavedCard =
    paymentMethod === "card" && Boolean(selectedCardId) && !useNewCard && savedCards.length > 0;

  const tipPercentageBase = useMemo(() => getSubtotalAfterDiscounts(bookingState), [bookingState]);

  // Keep tip amount in sync when user chose a % and the subtotal changes (e.g. promo applied earlier)
  useEffect(() => {
    if (tipPercentSelection === null) return;
    if (tipPercentageBase <= 0) {
      setTipAmount(0);
      return;
    }
    setTipAmount(roundTipAmount((tipPercentageBase * tipPercentSelection) / 100));
  }, [tipPercentSelection, tipPercentageBase]);

  // Fetch saved payment methods
  useEffect(() => {
    if (!user) return;
    const loadCards = async () => {
      setCardsLoading(true);
      try {
        const res = await fetcher.get<{ data: SavedCard[] }>("/api/me/payment-methods");
        const active = (res.data || []).filter((c) => c.is_active && !c.is_expired);
        setSavedCards(active);
        const defaultCard = active.find((c) => c.is_default) || active[0];
        if (defaultCard && !selectedCardId) {
          setSelectedCardId(defaultCard.id);
        }
      } catch {
        // Silently fail - user can still pay with new card
      } finally {
        setCardsLoading(false);
      }
    };
    loadCards();
  }, [user]);

  // Fetch wallet balance when user is logged in (for "Use wallet" option)
  useEffect(() => {
    if (!user) return;
    setWalletLoading(true);
    fetcher
      .get<{ data: { wallet: { balance: number; currency: string }; transactions: any[] } }>(
        "/api/me/wallet",
        { cache: "no-store" }
      )
      .then((res) => {
        if (res?.data?.wallet) {
          setWalletBalance(Number(res.data.wallet.balance) || 0);
          setWalletCurrency(res.data.wallet.currency || tenantCurrency);
        } else {
          setWalletCurrency(tenantCurrency);
        }
      })
      .catch(() => {
        setWalletBalance(0);
      })
      .finally(() => setWalletLoading(false));
  }, [user]);

  // Update booking state when payment options change
  useEffect(() => {
    updateBookingState({
      tipAmount,
      tipPercentSelection,
      paymentMethod,
      paymentOption,
      useWallet,
      saveCard,
      setAsDefault,
    });
  }, [
    tipAmount,
    tipPercentSelection,
    paymentMethod,
    paymentOption,
    useWallet,
    saveCard,
    setAsDefault,
  ]);

  // Calculate totals - for group bookings, sum all participant services
  const calculateServicesTotal = () => {
    if (bookingState.isGroupBooking && bookingState.groupParticipants) {
      // For group bookings, calculate from participants
      return bookingState.groupParticipants.reduce((total, participant) => {
        const participantTotal = participant.serviceIds.reduce((sum, serviceId) => {
          const service = bookingState.selectedServices.find((s) => s.id === serviceId);
          return sum + (service?.price || 0);
        }, 0);
        return total + participantTotal;
      }, 0);
    }
    // Regular booking - sum selected services
    return bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0);
  };

  const totals = {
    services: calculateServicesTotal(),
    addons: bookingState.selectedAddons.reduce((sum, a) => sum + a.price, 0),
    products: bookingState.selectedProducts.reduce((sum, p) => sum + p.price * p.quantity, 0),
    travelFee: bookingState.address?.travelFee || 0,
    travelFeeBreakdown: bookingState.address?.breakdown || [],
    subtotal: 0,
    discounts:
      (bookingState.promotions.couponDiscount || 0) +
      (bookingState.promotions.loyaltyDiscount || 0) +
      (bookingState.promotions.membershipDiscount || 0),
    subtotalAfterDiscounts: 0,
    taxAmount: bookingState.taxAmount || 0,
    taxRate: bookingState.taxRate || 0,
    serviceFeeAmount: bookingState.serviceFeeAmount || 0,
    serviceFeePercentage: bookingState.serviceFeePercentage || 0,
    tipAmount,
    total: 0,
    currency: bookingState.selectedServices[0]?.currency || tenantCurrency,
  };

  totals.subtotal = totals.services + totals.addons + totals.products + totals.travelFee;
  totals.subtotalAfterDiscounts = getSubtotalAfterDiscounts(bookingState);
  // Fee amounts come from bookingState (set by booking-flow.tsx on mount from /api/public/platform-fees).
  // Do NOT re-estimate here — that would cause fees to appear/change between steps if platform-fees
  // API responds at slightly different times. bookingState is the single source of truth.
  totals.total =
    totals.subtotalAfterDiscounts + totals.taxAmount + totals.serviceFeeAmount + totals.tipAmount;

  const createBookingDraft = async () => {
    if (!bookingState.providerId || !bookingState.selectedDate || !bookingState.selectedTimeSlot) {
      throw new Error(t("web.booking.stepPayment.missingBookingInfo"));
    }

    // Validate salon bookings have location_id
    if (bookingState.mode === "salon" && !bookingState.selectedLocationId) {
      throw new Error(t("web.booking.stepPayment.selectSalonLocation"));
    }

    // Validate mobile bookings have address
    if (bookingState.mode === "mobile" && !bookingState.address) {
      throw new Error(t("web.booking.stepPayment.provideHomeAddress"));
    }

    // Note: Minimum booking amount validation will be done server-side
    // We can add client-side validation here if provider info is available

    // §Release-audit 2026-04: prefer the ISO start that the availability
    // engine produced when the user selected the slot. Only fall back to
    // deriving an instant from the HH:MM label + provider TZ when an older
    // persisted draft is missing `selectedSlotStart` — this eliminates the
    // "invalid time" rejection on non-UTC servers that double-translated
    // the wall-clock time.
    const dateYmd = formatLocalDateYYYYMMDD(new Date(bookingState.selectedDate!));
    const bookingDateTime = reconcileBookingInstantWithSlotLabel(
      bookingState.selectedSlotStart,
      dateYmd,
      bookingState.selectedTimeSlot!,
      bookingState.providerTimezone
    );

    // For group bookings, create services array from all participants
    // For regular bookings, use selected services
    const servicesForBooking =
      bookingState.isGroupBooking && bookingState.groupParticipants
        ? bookingState.groupParticipants.flatMap((participant) =>
            participant.serviceIds.map((serviceId) => {
              const service = bookingState.selectedServices.find((s) => s.id === serviceId);
              return {
                offering_id: serviceId,
                staff_id: service?.staffId || null,
              };
            })
          )
        : bookingState.selectedServices.map((s) => ({
            offering_id: s.id,
            staff_id: s.staffId,
          }));

    const bookingData: any = {
      provider_id: bookingState.providerId,
      services: servicesForBooking,
      selected_datetime: bookingDateTime.toISOString(),
      location_type: bookingState.mode === "salon" ? "at_salon" : "at_home",
      location_id: bookingState.selectedLocationId || null,
      address:
        bookingState.mode === "mobile" && bookingState.address
          ? {
              line1:
                bookingState.address.structuredAddress?.line1 ||
                bookingState.address.fullAddress.split(",")[0] ||
                bookingState.address.fullAddress,
              city:
                bookingState.address.structuredAddress?.city ||
                bookingState.address.fullAddress.split(",").slice(-2)[0]?.trim() ||
                "",
              country:
                bookingState.address.structuredAddress?.country ||
                bookingState.address.fullAddress.split(",").slice(-1)[0]?.trim() ||
                "",
              postal_code: bookingState.address.structuredAddress?.postalCode,
              latitude: bookingState.address.coordinates?.lat,
              longitude: bookingState.address.coordinates?.lng,
              apartment_unit: bookingState.address.apartmentUnit,
              building_name: bookingState.address.buildingName,
              floor_number: bookingState.address.floorNumber,
              access_codes: bookingState.address.accessCodes,
              parking_instructions: bookingState.address.parkingInstructions,
              location_landmarks: bookingState.address.locationLandmarks,
            }
          : null,
      addons: bookingState.selectedAddons.map((a) => a.id),
      products: bookingState.selectedProducts.map((p) => {
        // id may be "productUUID" or "productUUID:variantUUID" for variant products
        const colonIdx = p.id.indexOf(":");
        const productId = colonIdx !== -1 ? p.id.slice(0, colonIdx) : p.id;
        const productVariantId = colonIdx !== -1 ? p.id.slice(colonIdx + 1) : null;
        return {
          productId,
          productVariantId: productVariantId || null,
          quantity: p.quantity,
          unitPrice: p.price,
          totalPrice: p.price * p.quantity,
        };
      }),
      package_id: bookingState.selectedPackage?.id || null,
      customer_package_entitlement_id: bookingState.customerPackageEntitlementId || null,
      tip_amount: tipAmount,
      travel_fee: bookingState.address?.travelFee || 0,
      special_requests: bookingState.clientInfo?.specialRequests || null,
      house_call_instructions:
        bookingState.mode === "mobile"
          ? bookingState.clientInfo?.houseCallInstructions || null
          : null,
      client_info: bookingState.clientInfo,
      payment_method: paymentMethod,
      payment_option: paymentOption,
      payment_method_id: usingSavedCard ? selectedCardId : null,
      save_card: saveCard,
      set_as_default: setAsDefault,
      promotion_code: bookingState.promotions.couponCode || null,
      gift_card_code: bookingState.promotions.giftCardCode || null,
      membership_plan_id: bookingState.promotions.membershipPlanId || null,
      ...(bookingState.promotions.loyaltyPointsUsed != null &&
      bookingState.promotions.loyaltyPointsUsed > 0
        ? { loyalty_points_used: bookingState.promotions.loyaltyPointsUsed }
        : {}),
      use_wallet: bookingState.useWallet ?? false,
      hold_id: holdId || null,
      // B11: forward provider form responses and booking custom field values
      // collected on the new "forms" step. API validates these against the
      // active provider_forms / custom_field_definitions the same way
      // /book/continue does.
      ...(bookingState.providerFormResponses &&
      Object.keys(bookingState.providerFormResponses).length > 0
        ? { provider_form_responses: bookingState.providerFormResponses }
        : {}),
      ...(bookingState.customFieldValues && Object.keys(bookingState.customFieldValues).length > 0
        ? { custom_field_values: bookingState.customFieldValues }
        : {}),
      ...(adCampaignId ? { campaign_id: adCampaignId } : {}),
      ...(bookingState.mode === "mobile"
        ? {
            availability_travel_buffer_minutes: getTravelBuffer(
              "mobile",
              bookingState.address?.travelTimeMinutes
            ),
          }
        : {}),
    };

    // Add group booking data if it's a group booking
    if (bookingState.isGroupBooking && bookingState.groupParticipants) {
      bookingData.is_group_booking = true;
      bookingData.group_participants = bookingState.groupParticipants.map((p) => ({
        name: p.name,
        email: p.email,
        phone: p.phone,
        service_ids: p.serviceIds,
        notes: p.notes,
      }));
    }

    const freq = bookingState.recurringFrequency || "weekly";
    if (
      user &&
      bookingState.subscribeRecurring === true &&
      subscribeRecurringEligible({
        subscribe_recurring: { enabled: true, frequency: freq },
        reschedule_booking_id: null,
        is_group_booking: bookingState.isGroupBooking,
        has_group_participants: Boolean(
          bookingState.groupParticipants && bookingState.groupParticipants.length > 0
        ),
      })
    ) {
      bookingData.subscribe_recurring = { enabled: true, frequency: freq };
    }

    // §15.4-24 (audit 2026-04): client-generated idempotency key so a
    // retried POST (e.g. due to a mobile network blip after the server
    // already created the booking) returns the same booking_id +
    // payment_url instead of creating a duplicate + double-charging.
    // Reused across this payment attempt; regenerated if the user
    // abandons and re-enters the flow.
    const idempotencyKey = bookingState.idempotencyKey ?? generateUuidV4();
    if (!bookingState.idempotencyKey) {
      updateBookingState({ idempotencyKey });
    }

    const response = await fetcher.post<{
      data: PublicBookingCreateResult;
    }>("/api/public/bookings", bookingData, {
      headers: { "Idempotency-Key": idempotencyKey },
      // Server often runs validate + create_booking RPC + Paystack init; 10s default aborts before response.
      timeoutMs: 120000,
    });

    return response.data;
  };

  const handlePayment = async () => {
    if (paymentInFlightRef.current) {
      return;
    }

    // Check authentication before proceeding
    if (!user && !authLoading) {
      setIsLoginModalOpen(true);
      toast.info(t("web.booking.stepPayment.signInToComplete"));
      return;
    }

    // If still loading auth, wait a bit
    if (authLoading) {
      toast.info(t("web.booking.stepPayment.verifyingAccount"));
      return;
    }

    if (!bookingState.clientInfo) {
      toast.error(t("web.booking.stepPayment.completeInfoFirst"));
      return;
    }

    if (paymentMethod === "giftcard" && !bookingState.promotions.giftCardCode) {
      toast.error(t("web.booking.stepPayment.enterGiftCardCode"));
      return;
    }
    if (paymentMethod === "giftcard") {
      const depositAmount = percentOf(totals.total, depositPercentage);
      const amountDueNow = paymentOption === "deposit" ? depositAmount : totals.total;
      if ((bookingState.promotions.giftCardAmount || 0) + 0.005 < amountDueNow) {
        toast.error(
          t("web.booking.stepPayment.giftCardDoesNotCover")
        );
        return;
      }
    }

    if (cancellationRequiresAckForPolicy && !acceptedCancellationPolicy) {
      toast.error(t("checkout.acceptCancellationPolicyRequired"));
      return;
    }

    if (!holdId) {
      toast.error(t("web.booking.stepPayment.slotNotReserved"));
      await returnToCalendarForHold();
      return;
    }

    if (isHoldLoading) {
      toast.info(t("web.booking.stepPayment.verifyingSlot"));
      return;
    }

    if (
      isHoldExpired ||
      (holdExpiresAt && getHoldTimeRemaining(holdExpiresAt, serverClockOffsetMs).expired)
    ) {
      toast.error(t("web.booking.stepPayment.holdExpiredSelectAgain"), { duration: 6000 });
      await returnToCalendarForHold();
      return;
    }

    if (holdLoadError && !holdExpiresAt) {
      toast.error(t("web.booking.stepPayment.couldNotVerifySlot"));
      await returnToCalendarForHold();
      return;
    }

    paymentInFlightRef.current = true;
    setIsProcessing(true);
    let bookingResult: PublicBookingCreateResult | null = null;

    const notifyRecurringFromResult = (
      sub?: PublicBookingCreateResult["recurring_subscription"]
    ) => {
      if (!bookingState.subscribeRecurring || !user) return;
      if (sub?.created) {
        toast.success(
          t("web.booking.stepPayment.recurringSaved")
        );
      } else if (sub?.pending) {
        toast.info(
          t("web.booking.stepPayment.recurringPending")
        );
      } else if (sub && sub.created === false && sub.message) {
        toast.error(sub.message);
      }
    };

    try {
      // Step 1: Create booking draft first
      try {
        bookingResult = await createBookingDraft();
      } catch (error: any) {
        const errCode = error?.code as string | undefined;
        const errStatus = error?.status as number | undefined;

        if (errCode === "HOLD_IN_FLIGHT" || (errStatus === 409 && errCode === "HOLD_IN_FLIGHT")) {
          toast.error(
            t("web.booking.stepPayment.holdInFlight"),
            { duration: 6000 }
          );
          return;
        }

        if (errCode === "HOLD_INACTIVE" || (errStatus === 410 && errCode === "HOLD_INACTIVE")) {
          updateBookingState({ holdId: null, holdExpiresAt: null, selectedTimeSlot: null });
          toast.error(t("web.booking.stepPayment.slotNoLongerAvailable"), {
            duration: 6000,
          });
          onNavigateToStep("calendar");
          return;
        }

        const isHoldExpired =
          errCode === "HOLD_INVALID" ||
          errCode === "HOLD_EXPIRED" ||
          (errStatus === 410 && (errCode === "HOLD_INVALID" || errCode === "HOLD_EXPIRED"));
        if (isHoldExpired) {
          updateBookingState({ holdId: null, holdExpiresAt: null, selectedTimeSlot: null });
          toast.error(t("web.booking.stepPayment.holdExpiredSelectAgain"), { duration: 6000 });
          onNavigateToStep("calendar");
          return;
        }

        const slotConflictCodes = new Set([
          "CONFLICT",
          "AVAILABILITY_OVERLAP",
          "BOOKING_SLOT_CONFLICT",
          "RESOURCE_UNAVAILABLE",
        ]);
        const messageLooksLikeSlotConflict =
          /slot|time|overlap|unavailable|already booked|conflict|resource/i.test(
            error.message ?? ""
          );
        // VALIDATION_ERROR must never be shown as "time slot taken" — it means the request itself
        // was malformed (e.g. zero-duration service, invalid time range). Show the real message.
        const isAvailabilityConflict =
          (slotConflictCodes.has(error.code) ||
            (error.status === 409 && messageLooksLikeSlotConflict)) &&
          error.code !== "VALIDATION_ERROR";
        if (isAvailabilityConflict) {
          updateBookingState({ holdId: null, holdExpiresAt: null, selectedTimeSlot: null });
          toast.error(t("web.booking.stepPayment.slotJustTaken"), {
            duration: 6000,
          });
          onNavigateToStep("calendar");
          return;
        }

        toast.error(
          getUserFacingMessage(
            extractErrorCode(error),
            error.message,
            t("web.booking.stepPayment.createBookingFailed"),
          ),
        );
        return;
      }

      if (adCampaignId && bookingResult.booking_id && bookingState.providerId) {
        fetcher
          .post("/api/public/ads/event", {
            event_type: "book",
            campaign_id: adCampaignId,
            provider_id: bookingState.providerId,
            idempotency_key: `web-book:${adCampaignId}:${bookingResult.booking_id}`,
          })
          .catch(() => {});
      }

      // Step 2: Process payment based on method
      if (paymentMethod === "cash") {
        // Cash payment - booking already created, just redirect
        const isAtHome = bookingState.mode === "mobile";
        const cashLocationMsg = isAtHome
          ? t("web.booking.stepPayment.cashConfirmedHome")
          : t("web.booking.stepPayment.cashConfirmedSalon");
        toast.success(cashLocationMsg);
        notifyRecurringFromResult(bookingResult.recurring_subscription);
        router.push(`/booking/confirmation?bookingId=${bookingResult.booking_id}`);
        return;
      }

      if (paymentMethod === "giftcard") {
        // Gift card payment - booking already created, payment processed in backend
        toast.success(t("web.booking.stepPayment.giftCardPaid"));
        notifyRecurringFromResult(bookingResult.recurring_subscription);
        router.push(`/booking/confirmation?bookingId=${bookingResult.booking_id}`);
        return;
      }

      const draftWithUrl = bookingResult;

      const paystackRemainder = Number(draftWithUrl.paystack_amount ?? NaN);
      const noCardLeg =
        draftWithUrl.payment_url == null ||
        draftWithUrl.payment_url === "" ||
        (Number.isFinite(paystackRemainder) && paystackRemainder <= 0);
      // Wallet/gift covered full amount — server returned no Paystack URL
      if ((bookingState.useWallet ?? false) && noCardLeg) {
        toast.success(t("web.booking.stepPayment.walletGiftPaid"));
        notifyRecurringFromResult(bookingResult.recurring_subscription);
        router.push(`/booking/confirmation?bookingId=${bookingResult.booking_id}`);
        return;
      }

      // Saved card: server charged it directly (payment_method_id was sent); payment_url will be null
      if (usingSavedCard) {
        if (draftWithUrl.payment_url == null || draftWithUrl.payment_url === "") {
          toast.success(t("web.booking.stepPayment.paymentSuccessful"));
          notifyRecurringFromResult(bookingResult.recurring_subscription);
          router.push(`/booking/confirmation?bookingId=${bookingResult.booking_id}`);
        } else {
          // Server returned a URL despite saved card — unexpected; fall back to redirect
          toast.info(t("web.booking.stepPayment.redirectingPayment"));
          notifyRecurringFromResult(bookingResult.recurring_subscription);
          window.location.href = draftWithUrl.payment_url;
        }
        return;
      }

      // New card / Paystack redirect flow
      if (draftWithUrl.payment_url && draftWithUrl.payment_url.trim() !== "") {
        notifyRecurringFromResult(bookingResult.recurring_subscription);
        window.location.href = draftWithUrl.payment_url;
        return;
      }

      // Fallback: initialize payment client-side if API did not return payment_url
      const depositAmount = percentOf(totals.total, depositPercentage);
      const amountDueNow = paymentOption === "deposit" ? depositAmount : totals.total;
      const giftCardApplied = Math.min(bookingState.promotions.giftCardAmount || 0, amountDueNow);
      const walletApplied =
        paymentMethod === "card" && useWallet
          ? Math.min(walletBalance, Math.max(0, amountDueNow - giftCardApplied))
          : 0;
      const amountToCharge = Math.max(0, amountDueNow - giftCardApplied - walletApplied);
      const freqFallback = bookingState.recurringFrequency || "weekly";
      const paystackFallbackRecurring =
        user &&
        bookingState.subscribeRecurring === true &&
        subscribeRecurringEligible({
          subscribe_recurring: { enabled: true, frequency: freqFallback },
          reschedule_booking_id: null,
          is_group_booking: bookingState.isGroupBooking,
          has_group_participants: Boolean(
            bookingState.groupParticipants && bookingState.groupParticipants.length > 0
          ),
        });

      const result = await initializePayment({
        email: bookingState.clientInfo.email,
        amount: amountToCharge,
        metadata: {
          bookingId: bookingResult.booking_id,
          bookingNumber: bookingResult.booking_number,
          paymentOption,
          saveCard: saveCard.toString(),
          setAsDefault: setAsDefault.toString(),
          ...(paystackFallbackRecurring ? { subscribe_recurring_frequency: freqFallback } : {}),
        },
      });

      if (result.authorization_url) {
        notifyRecurringFromResult(
          bookingResult.recurring_subscription ??
            (paystackFallbackRecurring ? { created: false, pending: true } : undefined)
        );
        window.location.href = result.authorization_url;
      } else {
        toast.error(t("web.booking.stepPayment.initPaymentFailed"));
        toast.info(t("web.booking.stepPayment.draftCreatedRetry"));
      }
    } catch (error: any) {
      const errorMessage = getUserFacingMessage(
        extractErrorCode(error),
        error.message,
        t("web.booking.stepPayment.paymentInitFailed"),
      );
      toast.error(errorMessage);

      // If booking draft was created but payment failed, provide retry option
      if (bookingResult) {
        toast.info(t("web.booking.stepPayment.draftCreatedRetry"), {
          action: {
            label: t("web.booking.stepPayment.viewBooking"),
            onClick: () =>
              router.push(`/booking/confirmation?bookingId=${bookingResult!.booking_id}`),
          },
        });
      }
    } finally {
      paymentInFlightRef.current = false;
      setIsProcessing(false);
    }
  };

  return (
    <div className="px-4 py-6 space-y-6 pb-32">
      {/* Booking Summary */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-900">{t("booking.reviewBooking")}</h2>
        {holdExpiresAt ? (
          <HoldCountdown
            expiresAt={holdExpiresAt}
            clockOffsetMs={serverClockOffsetMs}
            onBackToCalendar={returnToCalendarForHold}
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start text-sm text-amber-900">
            <Clock className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <p className="font-medium">{t("web.booking.stepPayment.slotNeedsReserve")}</p>
              <p className="mt-1">
                {t("web.booking.stepPayment.goBackToCalendar")}
              </p>
            </div>
          </div>
        )}

        {/* Services */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">
              {bookingState.isGroupBooking ? t("web.booking.stepPayment.groupBooking") : t("web.booking.actionBar.services")}
            </h3>
            <button
              type="button"
              onClick={() => onNavigateToStep("services")}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t("web.booking.stepPayment.change")}
            </button>
          </div>
          {bookingState.isGroupBooking && bookingState.groupParticipants
            ? // Show participants for group bookings
              bookingState.groupParticipants.map((participant) => {
                const participantServices = participant.serviceIds
                  .map((id) => bookingState.selectedServices.find((s) => s.id === id))
                  .filter(Boolean) as typeof bookingState.selectedServices;
                const participantTotal = participantServices.reduce((sum, s) => sum + s.price, 0);

                return (
                  <div
                    key={participant.id}
                    className="border-b border-gray-200 pb-3 last:border-0 last:pb-0"
                  >
                    <p className="font-medium text-gray-900 mb-2">{participant.name}</p>
                    {participantServices.map((service) => {
                      const snapshotLine = {
                        price: service.price,
                        base_price: service.base_price,
                        at_home_price_adjustment: service.at_home_price_adjustment,
                      };
                      return (
                        <div key={service.id} className="ms-4 mb-2">
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate text-gray-600">
                              {service.title}
                              {service.staffName && ` - ${service.staffName}`}
                            </span>
                            <span className="flex-shrink-0 font-medium whitespace-nowrap">
                              {formatCurrency(service.price, totals.currency)}
                            </span>
                          </div>
                          {bookingState.mode === "mobile" &&
                          lineHasHouseCallAdjustment(snapshotLine) ? (
                            <HouseCallLineFootnote
                              line={snapshotLine}
                              currency={totals.currency}
                              t={t}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="flex justify-between text-sm font-medium mt-2 ms-4">
                      <span>{t("web.booking.actionBar.subtotal")}</span>
                      <span>{formatCurrency(participantTotal, totals.currency)}</span>
                    </div>
                  </div>
                );
              })
            : // Show services for regular bookings
              bookingState.selectedServices.map((service) => {
                const snapshotLine = {
                  price: service.price,
                  base_price: service.base_price,
                  at_home_price_adjustment: service.at_home_price_adjustment,
                };
                return (
                  <div key={service.id} className="space-y-0.5">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-gray-600">
                        {service.title}
                        {service.staffName && ` - ${service.staffName}`}
                      </span>
                      <span className="flex-shrink-0 font-medium whitespace-nowrap">
                        {formatCurrency(service.price, totals.currency)}
                      </span>
                    </div>
                    {bookingState.mode === "mobile" &&
                    lineHasHouseCallAdjustment(snapshotLine) ? (
                      <HouseCallLineFootnote
                        line={snapshotLine}
                        currency={totals.currency}
                        t={t}
                      />
                    ) : null}
                  </div>
                );
              })}
          {bookingState.selectedAddons.map((addon) => (
            <div key={addon.id} className="flex justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-gray-600">+ {addon.title}</span>
              <span className="flex-shrink-0 font-medium whitespace-nowrap">
                {formatCurrency(addon.price, totals.currency)}
              </span>
            </div>
          ))}
          {bookingState.selectedProducts.map((product) => (
            <div key={product.id} className="flex justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-gray-600">
                {product.name} {product.quantity > 1 && `× ${product.quantity}`}
              </span>
              <span className="flex-shrink-0 font-medium whitespace-nowrap">
                {formatCurrency(
                  product.price * product.quantity,
                  product.currency || totals.currency
                )}
              </span>
            </div>
          ))}
          {totals.travelFee > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {t("web.booking.actionBar.travelFee")}
                </span>
                <span className="font-medium">
                  {formatCurrency(totals.travelFee, totals.currency)}
                </span>
              </div>
              {totals.travelFeeBreakdown && totals.travelFeeBreakdown.length > 0 && (
                <div className="ps-4 text-xs text-gray-500 space-y-0.5">
                  {totals.travelFeeBreakdown.map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{item.label}:</span>
                      <span>{formatCurrency(item.amount, totals.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {bookingState.address?.distanceKm && (
                <div className="ps-4 text-xs text-gray-500">
                  {t("web.booking.stepPayment.distanceTravel", { km: bookingState.address.distanceKm.toFixed(1) })}
                  {bookingState.address.travelTimeMinutes &&
                    t("web.booking.stepPayment.estTravel", { minutes: bookingState.address.travelTimeMinutes })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Date & Time */}
        {bookingState.selectedDate && bookingState.selectedTimeSlot && (
          <div className="p-4 bg-gray-50 rounded-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {formatDate(bookingState.selectedDate)}
                </p>
                <p className="text-xs text-gray-600">{formatTime(bookingState.selectedTimeSlot)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateToStep("calendar")}
              className="text-sm font-medium text-primary hover:underline shrink-0"
            >
              {t("web.booking.stepPayment.change")}
            </button>
          </div>
        )}

        {/* Location */}
        {bookingState.mode === "salon" ? (
          <div className="p-4 bg-gray-50 rounded-lg flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900">{t("web.booking.confirmation.atTheSalon")}</p>
            </div>
          </div>
        ) : (
          bookingState.address && (
            <div className="p-4 bg-gray-50 rounded-lg flex items-center gap-3">
              <MapPin className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{t("web.booking.confirmation.houseCall")}</p>
                <p className="text-xs text-gray-600">{bookingState.address.fullAddress}</p>
              </div>
            </div>
          )
        )}

        {/* Redeem prepaid package — only packages that include a selected service (canonical: mirrors customer-app `book-checkout.tsx`) */}
        {packagesRelevantToBooking.length > 0 && (
          <div className="p-4 bg-violet-50/60 border border-violet-200/70 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-violet-700 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {bookingState.selectedPackage?.id
                    ? t("web.booking.stepPayment.packageApplied")
                    : t("web.booking.stepPayment.redeemPackage")}
                </p>
                <p className="text-xs text-gray-600">
                  {t("web.booking.stepPayment.packageHint")}
                </p>
              </div>
            </div>
            {packageCatalogLoading ? (
              <p className="text-sm text-gray-500">{t("web.booking.stepPayment.loadingPackages")}</p>
            ) : (
              <div className="space-y-2">
                {packagesRelevantToBooking.map((pkg) => {
                  const selected = bookingState.selectedPackage?.id === pkg.id;
                  return (
                    <button
                      type="button"
                      key={pkg.id}
                      onClick={() => {
                        if (selected) {
                          updateBookingState({
                            selectedPackage: undefined,
                            customerPackageEntitlementId: null,
                          });
                        } else {
                          updateBookingState({
                            selectedPackage: {
                              id: pkg.id,
                              title: pkg.name,
                              price: pkg.price,
                              discount: pkg.discount_percentage ?? 0,
                            },
                            customerPackageEntitlementId: null,
                          });
                        }
                      }}
                      className={cn(
                        "w-full text-start flex items-start gap-3 rounded-lg border p-3 transition-colors",
                        selected
                          ? "border-violet-500 bg-white ring-1 ring-violet-300"
                          : "border-gray-200 bg-white hover:border-violet-300"
                      )}
                      aria-pressed={selected}
                    >
                      <span
                        className={cn(
                          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                          selected
                            ? "border-violet-600 bg-violet-600 text-white"
                            : "border-gray-300 bg-white text-transparent"
                        )}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{pkg.name}</p>
                        {pkg.description ? (
                          <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                            {pkg.description}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-sm font-semibold text-gray-900 shrink-0">
                        {formatCurrency(pkg.price, pkg.currency)}
                        {pkg.discount_percentage != null && pkg.discount_percentage > 0 ? (
                          <span className="ms-1 text-xs font-medium text-emerald-600">
                            {t("web.booking.stepPayment.savePercent", { percent: pkg.discount_percentage })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
                {bookingState.selectedPackage?.id && (
                  <button
                    type="button"
                    onClick={() =>
                      updateBookingState({
                        selectedPackage: undefined,
                        customerPackageEntitlementId: null,
                      })
                    }
                    className="text-xs font-medium text-violet-700 hover:text-violet-900"
                  >
                    {t("web.booking.stepPayment.removePackage")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {user && bookingState.selectedPackage?.id && bookingState.providerId && (
          <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-amber-700 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{t("web.booking.stepPayment.packageCredit")}</p>
                <p className="text-xs text-gray-600">
                  {t("web.booking.stepPayment.packageCreditHint")}
                </p>
              </div>
            </div>
            {packageEntitlementsLoading ? (
              <p className="text-sm text-gray-500">{t("web.booking.stepPayment.loadingCredits")}</p>
            ) : packageEntitlements.length > 0 ? (
              <div className="space-y-1">
                <Label htmlFor="package-entitlement" className="text-xs text-gray-600">
                  {t("web.booking.stepPayment.usePrepaidSession")}
                </Label>
                <select
                  id="package-entitlement"
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                  value={bookingState.customerPackageEntitlementId ?? ""}
                  onChange={(e) =>
                    updateBookingState({
                      customerPackageEntitlementId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">{t("web.booking.stepPayment.payWithMethodBelow")}</option>
                  {packageEntitlements.map((e) => (
                    <option key={e.id} value={e.id}>
                      {t("web.booking.stepPayment.useCreditSessions", { count: e.sessions_remaining })}
                      {e.valid_until
                        ? t("web.booking.stepPayment.useCreditUntil", { date: new Date(e.valid_until).toLocaleDateString() })
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-gray-500">{t("web.booking.stepPayment.noPrepaidSessions")}</p>
            )}
          </div>
        )}

        {/* Totals */}
        <div className="p-4 bg-gray-50 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">{t("web.booking.stepPayment.servicesAddonsProducts")}</span>
            <span className="font-medium">
              {formatCurrency(totals.services + totals.addons + totals.products, totals.currency)}
            </span>
          </div>
          {totals.travelFee > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("web.booking.actionBar.travelFee")}</span>
              <span>{formatCurrency(totals.travelFee, totals.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs text-gray-500 border-b border-gray-200/80 pb-2">
            <span>{t("web.booking.stepPayment.bookingSubtotalBeforeDiscounts")}</span>
            <span>{formatCurrency(totals.subtotal, totals.currency)}</span>
          </div>
          {bookingState.promotions.couponDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t("booking.discount")}</span>
              <span>
                -{formatCurrency(bookingState.promotions.couponDiscount, totals.currency)}
              </span>
            </div>
          )}
          {bookingState.promotions.loyaltyDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{t("web.booking.actionBar.loyaltyPoints")}</span>
              <span>
                -{formatCurrency(bookingState.promotions.loyaltyDiscount, totals.currency)}
              </span>
            </div>
          )}
          {bookingState.promotions.membershipDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>{bookingState.promotions.membershipPlanName || t("web.booking.actionBar.membershipFallback")}</span>
              <span>
                -{formatCurrency(bookingState.promotions.membershipDiscount, totals.currency)}
              </span>
            </div>
          )}
          {totals.subtotalAfterDiscounts !== totals.subtotal && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>{t("web.booking.actionBar.subtotal")}</span>
              <span>{formatCurrency(totals.subtotalAfterDiscounts, totals.currency)}</span>
            </div>
          )}
          {totals.serviceFeeAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>
                {totals.serviceFeePercentage > 0
                  ? t("web.booking.actionBar.platformFeeWithPct", { pct: totals.serviceFeePercentage })
                  : t("web.booking.actionBar.platformFee")}
              </span>
              <span>{formatCurrency(totals.serviceFeeAmount, totals.currency)}</span>
            </div>
          )}
          {totals.taxAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>{totals.taxRate > 0 ? t("web.booking.actionBar.taxWithRate", { rate: Number(totals.taxRate).toFixed(2) }) : t("web.booking.actionBar.tax")}</span>
              <span>{formatCurrency(totals.taxAmount, totals.currency)}</span>
            </div>
          )}
          {tipAmount > 0 && (
            <div className="flex justify-between text-sm text-gray-700">
              <span className="flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-primary shrink-0" />
                {t("web.booking.actionBar.tip")}
              </span>
              <span className="font-medium">{formatCurrency(tipAmount, totals.currency)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold pt-2 border-t">
            <span>{t("booking.total")}</span>
            <span>{formatCurrency(totals.total, totals.currency)}</span>
          </div>

          {bookingState.promotions.giftCardAmount > 0 &&
            (() => {
              const depositAmount = percentOf(totals.total, depositPercentage);
              const amountDueNow = paymentOption === "deposit" ? depositAmount : totals.total;
              const giftCardApplied = Math.min(
                bookingState.promotions.giftCardAmount || 0,
                amountDueNow
              );
              return (
                <div className="flex justify-between text-sm text-blue-700">
                  <span>{t("web.booking.actionBar.giftCardTender")}</span>
                  <span>−{formatCurrency(giftCardApplied, totals.currency)}</span>
                </div>
              );
            })()}

          {/* Wallet split — show breakdown of what wallet covers vs what Paystack charges */}
          {paymentMethod === "card" &&
            useWallet &&
            walletBalance > 0 &&
            (() => {
              const depositAmount = percentOf(totals.total, depositPercentage);
              const amountDueNow = paymentOption === "deposit" ? depositAmount : totals.total;
              const giftCardApplied = Math.min(
                bookingState.promotions.giftCardAmount || 0,
                amountDueNow
              );
              const walletApplied = Math.min(
                walletBalance,
                Math.max(0, amountDueNow - giftCardApplied)
              );
              const paystackRemainder = Math.max(0, amountDueNow - giftCardApplied - walletApplied);
              return (
                <div className="mt-3 pt-3 border-t border-dashed border-gray-300 space-y-1.5">
                  <div className="flex justify-between text-sm text-green-700">
                    <span className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5" />
                      {t("web.booking.stepPayment.walletCreditApplied")}
                    </span>
                    <span className="font-medium">
                      −{formatCurrency(walletApplied, walletCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold text-gray-900 bg-gray-100 rounded-lg px-3 py-2">
                    <span>{t("web.booking.stepPayment.youPayViaPaystack")}</span>
                    <span>
                      {paystackRemainder <= 0
                        ? formatCurrency(0, totals.currency)
                        : formatCurrency(paystackRemainder, totals.currency)}
                    </span>
                  </div>
                  {paystackRemainder <= 0 && (
                    <p className="text-xs text-green-700 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {t("web.booking.stepPayment.walletCoversAll")}
                    </p>
                  )}
                </div>
              );
            })()}
        </div>
      </div>

      {/* Tip — % presets (of subtotal after discounts) + optional fixed amounts from provider */}
      {bookingState.providerId && (
        <div className="p-4 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-white to-pink-50/40 shadow-sm space-y-5">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Heart className="w-5 h-5 text-primary shrink-0" />
            {t("web.booking.stepPayment.addTipOptional")}
          </h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            {t("web.booking.stepPayment.tipPercentHintBefore")}
            <strong>{t("web.booking.stepPayment.tipPercentHintStrong")}</strong>
            {t("web.booking.stepPayment.tipPercentHintAfter")}
          </p>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-900">{t("web.booking.stepPayment.tipByPercentage")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipPercentSelection(null);
                  setTipAmount(0);
                }}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm font-semibold min-h-[48px] min-w-[72px] transition-colors border-2 flex flex-col items-center justify-center gap-0.5",
                  tipAmount === 0 && tipPercentSelection === null
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-gray-800 border-gray-200 hover:border-primary/50"
                )}
              >
                <span>{t("web.booking.stepPayment.noTip")}</span>
              </button>
              {TIP_PERCENT_PRESETS.map((p) => {
                const computed =
                  tipPercentageBase > 0 ? roundTipAmount((tipPercentageBase * p) / 100) : 0;
                const selected = tipPercentSelection === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={tipPercentageBase <= 0}
                    onClick={() => setTipPercentSelection(p)}
                    title={
                      tipPercentageBase <= 0
                        ? t("web.booking.stepPayment.addServicesForPercentTips")
                        : t("web.booking.stepPayment.percentOfBase", { percent: p, amount: formatCurrency(tipPercentageBase, totals.currency) })
                    }
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-sm min-h-[48px] min-w-[76px] transition-colors border-2 flex flex-col items-center justify-center gap-0.5",
                      tipPercentageBase <= 0 && "opacity-50 cursor-not-allowed",
                      selected
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-white text-gray-800 border-gray-200 hover:border-primary/50"
                    )}
                  >
                    <span className="font-bold leading-tight">{p}%</span>
                    <span
                      className={cn(
                        "text-[11px] leading-tight",
                        selected ? "text-white/90" : "text-gray-600"
                      )}
                    >
                      {tipPercentageBase <= 0 ? "—" : formatCurrency(computed, totals.currency)}
                    </span>
                  </button>
                );
              })}
            </div>
            {tipPercentageBase <= 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {t("web.booking.stepPayment.enablePercentTips")}
              </p>
            )}
          </div>

          {tipSuggestions.some((n) => n > 0) && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-900">{t("web.booking.stepPayment.orChooseSetAmount")}</p>
              <p className="text-xs text-gray-500">
                {t("web.booking.stepPayment.quickAmountsHint")}
              </p>
              <div className="flex flex-wrap gap-2">
                {tipSuggestions
                  .filter((n) => n > 0)
                  .map((n) => {
                    const selected =
                      tipPercentSelection === null && tipAmount === n && tipSuggestions.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setTipPercentSelection(null);
                          setTipAmount(n);
                        }}
                        className={cn(
                          "rounded-xl px-4 py-2.5 text-sm font-semibold min-h-[44px] transition-colors border-2",
                          selected
                            ? "bg-primary text-white border-primary shadow-sm"
                            : "bg-white text-gray-800 border-gray-200 hover:border-primary/50"
                        )}
                      >
                        {formatCurrency(n, totals.currency)}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="booking-tip-custom" className="text-sm font-medium text-gray-700">
              {t("web.booking.stepPayment.customAmount")}
            </Label>
            <Input
              id="booking-tip-custom"
              type="number"
              min={0}
              step={10}
              placeholder="0"
              className="w-28 h-10 rounded-lg border-2 border-gray-200"
              value={
                tipPercentSelection !== null
                  ? ""
                  : tipAmount > 0 && !tipSuggestions.includes(tipAmount)
                    ? tipAmount
                    : ""
              }
              onChange={(e) => {
                setTipPercentSelection(null);
                setTipAmount(Math.max(0, Number(e.target.value) || 0));
              }}
            />
          </div>
        </div>
      )}

      {/* Payment Method Selection */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">{t("web.booking.stepPayment.paymentMethod")}</h3>

        {/* Method toggle: Card / Cash / Gift Card (each gated by feature flags) */}
        <div
          className={`grid gap-3 ${paystackEnabled && giftCardsEnabled && cashEnabledOnPlatform ? "grid-cols-3" : paystackEnabled || giftCardsEnabled || cashEnabledOnPlatform ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {paystackEnabled && (
            <button
              type="button"
              onClick={() => setPaymentMethod("card")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                paymentMethod === "card"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <CreditCard
                className={`w-5 h-5 ${paymentMethod === "card" ? "text-primary" : "text-gray-500"}`}
              />
              <span
                className={`text-sm font-medium ${paymentMethod === "card" ? "text-primary" : "text-gray-700"}`}
              >
                {t("web.booking.stepPayment.card")}
              </span>
              {paymentMethod === "card" && <Check className="w-4 h-4 text-primary" />}
            </button>
          )}
          {cashEnabledOnPlatform && (
            <button
              type="button"
              onClick={() => setPaymentMethod("cash")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                paymentMethod === "cash"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <Banknote
                className={`w-5 h-5 ${paymentMethod === "cash" ? "text-primary" : "text-gray-500"}`}
              />
              <span
                className={`text-sm font-medium ${paymentMethod === "cash" ? "text-primary" : "text-gray-700"}`}
              >
                {t("web.booking.stepPayment.cash")}
              </span>
              {paymentMethod === "cash" && <Check className="w-4 h-4 text-primary" />}
            </button>
          )}
          {giftCardsEnabled && (
            <button
              type="button"
              onClick={() => setPaymentMethod("giftcard")}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                paymentMethod === "giftcard"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <Gift
                className={`w-5 h-5 ${paymentMethod === "giftcard" ? "text-primary" : "text-gray-500"}`}
              />
              <span
                className={`text-sm font-medium ${paymentMethod === "giftcard" ? "text-primary" : "text-gray-700"}`}
              >
                {t("web.booking.stepPayment.giftCard")}
              </span>
              {paymentMethod === "giftcard" && <Check className="w-4 h-4 text-primary" />}
            </button>
          )}
        </div>

        {/* Use wallet balance (when card selected, user has balance, and wallet feature enabled) */}
        {paymentMethod === "card" && user && walletEnabled && (
          <div className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50/50">
            <Checkbox
              id="use-wallet"
              checked={useWallet}
              onCheckedChange={(checked) => updateBookingState({ useWallet: !!checked })}
              disabled={walletLoading || walletBalance <= 0}
            />
            <label htmlFor="use-wallet" className="flex-1 cursor-pointer text-sm text-gray-700">
              {walletLoading ? (
                t("web.booking.stepPayment.loadingWallet")
              ) : walletBalance > 0 ? (
                <>{t("web.booking.stepPayment.useWalletBalance", { amount: formatCurrency(walletBalance, walletCurrency) })}</>
              ) : (
                t("web.booking.stepPayment.useWalletNoBalance")
              )}
            </label>
            {useWallet && walletBalance > 0 && <Wallet className="w-4 h-4 text-primary shrink-0" />}
          </div>
        )}

        {/* Deposit vs Full payment option — only when provider accepts deposits */}
        {paymentMethod === "card" && providerRequiresDeposit && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentOption("full")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                paymentOption === "full"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {paymentOption === "full" && <CheckCircle className="w-4 h-4 text-primary" />}
              <span
                className={`text-sm font-medium ${paymentOption === "full" ? "text-primary" : "text-gray-700"}`}
              >
                {t("web.booking.stepPayment.payInFull")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentOption("deposit")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                paymentOption === "deposit"
                  ? "border-primary bg-pink-50"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              {paymentOption === "deposit" && <CheckCircle className="w-4 h-4 text-primary" />}
              <span
                className={`text-sm font-medium ${paymentOption === "deposit" ? "text-primary" : "text-gray-700"}`}
              >
                {t("web.booking.stepPayment.depositPercent", { percent: depositPercentage })}
              </span>
            </button>
          </div>
        )}

        {/* Saved Cards (only when card method selected) */}
        <AnimatePresence>
          {paymentMethod === "card" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {cardsLoading ? (
                <div className="space-y-2">
                  <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                  <div className="h-16 bg-gray-100 rounded-xl animate-pulse" />
                </div>
              ) : savedCards.length > 0 && !useNewCard ? (
                <>
                  <p className="text-sm font-medium text-gray-700">{t("web.booking.stepPayment.yourSavedCards")}</p>
                  <div className="space-y-2">
                    {savedCards.map((card) => {
                      const active = selectedCardId === card.id;
                      const brand = card.card_type
                        ? card.card_type.charAt(0).toUpperCase() + card.card_type.slice(1)
                        : t("web.booking.stepPayment.card");
                      const expiry =
                        card.expiry_label ??
                        (card.expiry_month && card.expiry_year
                          ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
                          : null);

                      const selectCard = () => {
                        setSelectedCardId(card.id);
                        setUseNewCard(false);
                      };

                      return (
                        <motion.div
                          key={card.id}
                          role="button"
                          tabIndex={0}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={selectCard}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectCard();
                            }
                          }}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-start cursor-pointer ${
                            active
                              ? "border-primary bg-pink-50"
                              : "border-gray-200 hover:border-gray-300 bg-white"
                          }`}
                        >
                          <div
                            className={`w-10 h-7 rounded-md flex items-center justify-center ${
                              active ? "bg-primary/10" : "bg-gray-100"
                            }`}
                          >
                            <CreditCard
                              className={`w-5 h-5 ${active ? "text-primary" : "text-gray-500"}`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-sm font-semibold ${active ? "text-primary" : "text-gray-900"}`}
                              >
                                {brand}
                                {card.last4 ? ` •••• ${card.last4}` : ""}
                              </span>
                              {card.is_default ? (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-semibold rounded-full">
                                  {t("web.booking.stepPayment.default")}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSetDefaultCard(card.id);
                                  }}
                                  disabled={settingDefaultId === card.id}
                                  className="text-[10px] font-semibold text-primary hover:text-primary-hover underline disabled:opacity-50"
                                >
                                  {settingDefaultId === card.id ? t("web.booking.stepPayment.updating") : t("web.booking.stepPayment.setDefault")}
                                </button>
                              )}
                            </div>
                            {expiry && (
                              <span className="text-xs text-gray-500">{t("web.booking.stepPayment.expires", { expiry })}</span>
                            )}
                          </div>
                          {active && <CheckCircle className="w-5 h-5 text-primary flex-shrink-0" />}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveSavedCard(card.id);
                            }}
                            disabled={removingCardId === card.id}
                            aria-label={t("web.booking.stepPayment.removeCardEnding", { last4: card.last4 ?? "****" })}
                            title={t("web.booking.stepPayment.removeThisCard")}
                            className="ms-1 p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUseNewCard(true);
                      setSelectedCardId(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-800 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span className="text-sm font-medium">{t("web.booking.stepPayment.useNewCard")}</span>
                  </button>
                </>
              ) : null}

              {/* "Back to saved cards" link when using new card */}
              {useNewCard && savedCards.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setUseNewCard(false);
                    const def = savedCards.find((c) => c.is_default) || savedCards[0];
                    if (def) setSelectedCardId(def.id);
                  }}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary-hover font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  {t("web.booking.stepPayment.useSavedCardInstead")}
                </button>
              )}

              {/* Save card toggle (only for new card flow) */}
              {(savedCards.length === 0 || useNewCard) && (
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 text-gray-400" />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-900">{t("web.booking.stepPayment.saveThisCard")}</p>
                        <button
                          type="button"
                          onClick={() => toast.info(saveCardInfo, { duration: 8000 })}
                          className="p-0.5 rounded-full hover:bg-gray-200 text-primary"
                          aria-label={t("web.booking.stepPayment.saveCardInfoAria")}
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">{t("web.booking.stepPayment.fasterCheckout")}</p>
                    </div>
                  </div>
                  <Switch
                    checked={saveCard}
                    onCheckedChange={(checked) => {
                      setSaveCard(checked);
                      if (checked) setSetAsDefault(savedCards.length === 0);
                    }}
                  />
                </div>
              )}

              {/* Set as default toggle (only when saving a new card and already has cards) */}
              {saveCard && (savedCards.length === 0 || useNewCard) && savedCards.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-700">{t("web.booking.stepPayment.setAsDefaultMethod")}</span>
                  <Switch checked={setAsDefault} onCheckedChange={setSetAsDefault} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Cancellation Policy */}
      {cancellationPolicy && cancellationPolicyContent.lines.length > 0 && (
        <div
          className={cn(
            "rounded-xl p-5 border-2 transition-all",
            !cancellationRequiresAckForPolicy || acceptedCancellationPolicy
              ? "border-primary/35 bg-white shadow-sm"
              : "border-amber-400 bg-amber-50/90 shadow-md ring-2 ring-amber-300/70"
          )}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="rounded-full bg-primary/15 p-2 shrink-0">
              <Shield className="w-6 h-6 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 text-base mb-2">
                {t("checkout.cancellationPolicy")}
              </h3>
              {/* Structured policy lines from the shared builder */}
              <ul className="text-sm space-y-1.5 text-gray-700">
                {cancellationPolicyContent.lines.map((line) => (
                  <li key={line.id} className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 font-bold ${line.tone === "good" ? "text-green-600" : "text-amber-600"}`}>
                      {line.tone === "good" ? "✓" : "⚠"}
                    </span>
                    <span>{line.text}</span>
                  </li>
                ))}
              </ul>
              {/* Provider-configured free text shown as a secondary, muted note (structured lines above are authoritative) */}
              {cancellationPolicy.policy_text && (
                <p className="text-xs text-gray-500 italic leading-relaxed mt-2">
                  {cancellationPolicy.policy_text}
                </p>
              )}
              <div className="mt-3 pt-2 border-t border-gray-200 space-y-1">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Lock className="w-3 h-3 shrink-0" />
                  {cancellationPolicyContent.footerText}
                </p>
                <p className="text-xs text-gray-500">{cancellationPolicyContent.storeCreditNote}</p>
              </div>
            </div>
          </div>
          {cancellationRequiresAckForPolicy && (
          <div
            className={cn(
              "flex items-start gap-4 rounded-lg p-4 border-2 bg-white",
              acceptedCancellationPolicy ? "border-primary/25" : "border-gray-300"
            )}
          >
            <Checkbox
              id="accept-cancellation-policy"
              checked={acceptedCancellationPolicy}
              onCheckedChange={(checked) => setAcceptedCancellationPolicy(checked === true)}
              className={cn(
                "mt-0.5 shrink-0 h-7 w-7 rounded-md border-2",
                "border-gray-500 data-[state=checked]:bg-primary data-[state=checked]:border-primary",
                "data-[state=unchecked]:bg-white",
                "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              )}
            />
            <Label
              htmlFor="accept-cancellation-policy"
              className="text-sm sm:text-base font-medium text-gray-900 cursor-pointer leading-snug"
            >
              {cancellationPolicyContent.ackText}
            </Label>
          </div>
          )}
          {cancellationRequiresAckForPolicy && !acceptedCancellationPolicy && (
            <p className="mt-3 text-sm font-medium text-amber-900 flex items-center gap-2">
              <span
                className="inline-flex h-2 w-2 rounded-full bg-amber-500 animate-pulse"
                aria-hidden
              />
              {t("checkout.acceptCancellationPolicyRequired")}
            </p>
          )}
        </div>
      )}

      {user &&
        !bookingState.isGroupBooking &&
        !(bookingState.groupParticipants && bookingState.groupParticipants.length > 0) && (
          <div className="rounded-xl p-5 border border-gray-200 space-y-3 bg-gray-50/80">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-primary" />
              {t("web.booking.stepPayment.repeatThisBooking")}
            </h3>
            <p className="text-sm text-gray-600">
              {t("web.booking.stepPayment.repeatHint")}
            </p>
            <div className="flex items-start gap-3">
              <Checkbox
                id="booking-flow-subscribe-recurring"
                checked={bookingState.subscribeRecurring === true}
                onCheckedChange={(c) => updateBookingState({ subscribeRecurring: c === true })}
                className="mt-1"
              />
              <div className="space-y-2 flex-1 min-w-0">
                <Label
                  htmlFor="booking-flow-subscribe-recurring"
                  className="text-sm font-medium text-gray-900 cursor-pointer"
                >
                  {t("web.booking.stepPayment.turnOnRepeating")}
                </Label>
                {bookingState.subscribeRecurring === true && (
                  <div className="space-y-1">
                    <Label htmlFor="booking-flow-recurring-freq" className="text-xs text-gray-500">
                      {t("web.booking.stepPayment.howOften")}
                    </Label>
                    <select
                      id="booking-flow-recurring-freq"
                      value={bookingState.recurringFrequency || "weekly"}
                      onChange={(e) =>
                        updateBookingState({
                          recurringFrequency: e.target.value as "weekly" | "biweekly" | "monthly",
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm min-h-[44px]"
                    >
                      <option value="weekly">{t("web.booking.stepPayment.everyWeek")}</option>
                      <option value="biweekly">{t("web.booking.stepPayment.everyTwoWeeks")}</option>
                      <option value="monthly">{t("web.booking.stepPayment.everyMonth")}</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Payment Button */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 px-4 py-4 safe-area-bottom">
        {(() => {
          const selectedCard = usingSavedCard
            ? savedCards.find((c) => c.id === selectedCardId)
            : null;
          const depositAmount = percentOf(totals.total, depositPercentage);
          const amountDueNow = paymentOption === "deposit" ? depositAmount : totals.total;
          const giftCardApplied = Math.min(
            bookingState.promotions.giftCardAmount || 0,
            amountDueNow
          );
          const walletApplied =
            paymentMethod === "card" && useWallet
              ? Math.min(walletBalance, Math.max(0, amountDueNow - giftCardApplied))
              : 0;
          const chargeAmount = Math.max(0, amountDueNow - giftCardApplied - walletApplied);
          const giftCardOnlyUnderfunded =
            paymentMethod === "giftcard" &&
            (bookingState.promotions.giftCardAmount || 0) + 0.005 < amountDueNow;

          return (
            <Button
              onClick={handlePayment}
              disabled={
                isProcessing ||
                isChargingCard ||
                isHoldLoading ||
                isHoldExpired ||
                !holdId ||
                !holdExpiresAt ||
                !bookingState.clientInfo ||
                giftCardOnlyUnderfunded ||
                (cancellationRequiresAckForPolicy && !acceptedCancellationPolicy)
              }
              className="w-full h-14 text-base font-semibold bg-primary hover:bg-primary-hover disabled:opacity-50 touch-target flex items-center justify-center gap-2"
            >
              {isProcessing || isChargingCard ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isChargingCard ? t("web.booking.stepPayment.chargingCard") : t("web.booking.stepPayment.processing")}
                </>
              ) : paymentMethod === "cash" ? (
                <>
                  <Banknote className="w-5 h-5" />
                  {t("booking.confirmBooking")}
                </>
              ) : paymentMethod === "giftcard" ? (
                <>
                  <Gift className="w-5 h-5" />
                  {t("web.booking.stepPayment.payWithGiftCard", { amount: formatCurrency(amountDueNow, totals.currency) })}
                </>
              ) : usingSavedCard && selectedCard ? (
                <>
                  <Shield className="w-5 h-5" />
                  {t("web.booking.stepPayment.payWithCardEnding", { amount: formatCurrency(chargeAmount, totals.currency), last4: selectedCard.last4 })}
                </>
              ) : paymentOption === "deposit" ? (
                <>
                  <CreditCard className="w-5 h-5" />
                  {t("web.booking.stepPayment.payDeposit", { amount: formatCurrency(chargeAmount, totals.currency) })}
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  {chargeAmount <= 0
                    ? t("web.booking.stepPayment.completeBooking")
                    : t("web.booking.stepPayment.payAmount", { amount: formatCurrency(chargeAmount, totals.currency) })}
                </>
              )}
            </Button>
          );
        })()}
      </div>

      {/* Login Modal - shown when guest tries to complete booking */}
      <LoginModal
        open={isLoginModalOpen}
        setOpen={(open) => {
          setIsLoginModalOpen(open);
        }}
        // Keep booking checkout auth friction low: phone OTP first.
        redirectContext="customer"
        onAuthSuccess={async () => {
          // After successful auth, automatically retry booking
          setIsLoginModalOpen(false);
          // Small delay to ensure auth state is updated
          await new Promise((resolve) => setTimeout(resolve, 500));
          // Retry the payment/booking
          handlePayment();
        }}
        redirectUrl={typeof window !== "undefined" ? window.location.href : undefined}
      />
    </div>
  );
}
