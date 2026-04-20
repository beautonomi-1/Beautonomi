import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
  Switch,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { trackCheckoutStarted, trackBookingConfirmed, trackPaymentSuccess } from "@/lib/analytics";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { useTranslation } from "@beautonomi/i18n";
import { Colors } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { Skeleton } from "@/components/Skeleton";
import { useSavedCards } from "@/hooks/useSavedCards";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearPendingExcludeHoldId } from "@/lib/booking-flow-hold";
import { getGuestFingerprintHash } from "@/lib/guest-fingerprint";
import { useConfigBundle, useFeatureFlag, useModuleConfig } from "@/providers/ConfigBundleProvider";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import type { SavedPaymentMethod } from "@/types/api";
import { APP_URL } from "@/config/public-env";

/* ─── Types ─── */

interface BookingServiceSnapshot {
  offering_id: string;
  id?: string;
  staff_id?: string | null;
  duration_minutes: number;
  price: number;
  currency: string;
  service_name?: string;
  title?: string;
  name?: string;
}

interface HoldData {
  hold_id: string;
  provider_id: string;
  provider_name?: string;
  provider_thumbnail?: string;
  provider_avatar_url?: string;
  staff_id?: string | null;
  booking_services_snapshot: BookingServiceSnapshot[];
  start_at: string;
  end_at: string;
  location_type: string;
  location_id?: string | null;
  address_snapshot?: Record<string, unknown> | null;
  location_name?: string;
  staff_name?: string;
  expires_at?: string;
  deposit_required?: boolean;
  deposit_percentage?: number;
  deposit_amount?: number;
  travel_fee?: number;
  travel_distance_km?: number;
  provider_on_demand_accept_enabled?: boolean;
  tips_enabled?: boolean;
  tip_presets?: number[];
  cancellation_policy?: {
    cancellation_window_hours?: number;
    grace_window_minutes?: number;
    policy_text?: string;
    late_refund_percentage?: number;
    fee_amount?: number;
    fee_type?: "fixed" | "percentage";
    no_show_fee_enabled?: boolean;
    no_show_fee_amount?: number;
    currency?: string;
  };
  /** From hold metadata when booking started from a service package */
  package_id?: string;
  /** Tenant feature_flags — same as GET booking-holds + consume */
  payment_paystack?: boolean;
  payment_wallet?: boolean;
  gift_cards?: boolean;
  cash_enabled_on_platform?: boolean;
  /** Provider tax rate (0 when provider hasn't enabled tax). */
  tax_rate_percent?: number;
  /** Whether tax is inclusive in the service prices. */
  tax_inclusive?: boolean;
  /** Service fee config from provider or platform settings. */
  service_fee_config?: {
    type: string;
    percentage: number;
    fixed: number;
    show: boolean;
  };
}

interface ConsumeResponse {
  booking_id?: string;
  booking_number?: string;
  payment_url?: string | null;
  recurring_subscription?: { created: boolean; pending?: boolean; message?: string };
}

interface CustomFieldDefinition {
  id: string;
  name: string;
  label: string;
  field_type: string;
  is_required: boolean;
  placeholder?: string | null;
}

interface ProviderFormField {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  sort_order: number;
}

interface ProviderForm {
  id: string;
  title: string;
  description: string | null;
  form_type: string;
  is_required: boolean;
  fields: ProviderFormField[];
}

interface AddonOption {
  id: string;
  name?: string;
  title?: string;
  price: number;
  currency?: string;
  duration_minutes?: number;
  is_recommended?: boolean;
}

/* ─── Helpers ─── */

function parseValidDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatDateOnly(s: string) {
  const parsed = parseValidDate(s);
  if (!parsed) return "—";
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeOnly(s: string) {
  const parsed = parseValidDate(s);
  if (!parsed) return "—";
  return parsed.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatCurrency(amount: number, currency = getTenantDefaultCurrency()) {
  const fallback = getTenantDefaultCurrency();
  return formatMoney(amount, currency ?? fallback);
}

function getTimeRemaining(expiresAt: string): { minutes: number; seconds: number; expired: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return { minutes: 0, seconds: 0, expired: true };
  const totalSeconds = Math.floor(diff / 1000);
  return { minutes: Math.floor(totalSeconds / 60), seconds: totalSeconds % 60, expired: false };
}

/* ─── Countdown Bar ─── */
function CountdownBar({ expiresAt, t }: { expiresAt: string; t: (key: string, opts?: Record<string, string | number>) => string }) {
  const [countdown, setCountdown] = useState(() => getTimeRemaining(expiresAt));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const remaining = getTimeRemaining(expiresAt);
      setCountdown(remaining);
      if (remaining.expired && timerRef.current) clearInterval(timerRef.current);
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [expiresAt]);

  const isUrgent = countdown.minutes < 2;
  const bgColor = countdown.expired ? "#FEF2F2" : isUrgent ? "#FFFBEB" : "#EFF6FF";
  const textColor = countdown.expired ? "#B91C1C" : isUrgent ? "#92400E" : "#1E40AF";
  const iconColor = countdown.expired ? "#EF4444" : isUrgent ? "#F59E0B" : "#3B82F6";

  return (
    <View style={{
      backgroundColor: bgColor,
      borderRadius: 12, padding: 12, marginBottom: 16,
      borderWidth: countdown.expired ? 1 : 0,
      borderColor: countdown.expired ? "#FECACA" : "transparent",
    }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="time-outline" size={18} color={iconColor} style={{ marginRight: 8 }} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: textColor, flex: 1 }}>
          {countdown.expired
            ? t("checkout.slotExpiredMessage")
            : t("checkout.slotHeldFor", { minutes: countdown.minutes, seconds: String(countdown.seconds).padStart(2, "0") })}
        </Text>
      </View>
      {countdown.expired && (
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            marginTop: 12,
            backgroundColor: "#B91C1C",
            paddingVertical: 10,
            borderRadius: 10,
            alignItems: "center",
          }}
          accessibilityRole="button"
          accessibilityLabel={t("checkout.selectNewTime")}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{t("checkout.selectNewTime")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** True when the hold exposes any cancellation / fee / policy text — same visibility as <CancellationPolicy />. */
function cancellationPolicyRequiresCustomerAck(
  policy: HoldData["cancellation_policy"] | null | undefined,
): boolean {
  if (!policy) return false;
  const windowHrs = policy.cancellation_window_hours;
  const graceMin = policy.grace_window_minutes;
  const noShowFee = policy.no_show_fee_enabled && policy.no_show_fee_amount != null && policy.no_show_fee_amount > 0;
  const latePct = policy.late_refund_percentage;
  const showLateLine =
    latePct !== undefined && latePct !== null && !Number.isNaN(Number(latePct)) && Number(latePct) < 100;
  const policyTextTrimmed = typeof policy.policy_text === "string" ? policy.policy_text.trim() : "";
  const policySnippet = policyTextTrimmed.length > 0 ? policyTextTrimmed : null;
  if (!windowHrs && !noShowFee && !(graceMin != null && graceMin > 0) && !showLateLine && !policySnippet) {
    return false;
  }
  return true;
}

/* ─── Cancellation Policy Section ─── */
function CancellationPolicy({ policy, currency, contentPadding, t }: {
  policy: HoldData["cancellation_policy"];
  currency: string;
  contentPadding: number;
  t: (key: string, opts?: Record<string, string | number>) => string;
}) {
  if (!policy) return null;
  const windowHrs = policy.cancellation_window_hours;
  const graceMin = policy.grace_window_minutes;
  const noShowFee = policy.no_show_fee_enabled && policy.no_show_fee_amount != null && policy.no_show_fee_amount > 0;
  const latePct = policy.late_refund_percentage;
  const showLateLine =
    latePct !== undefined && latePct !== null && !Number.isNaN(Number(latePct)) && Number(latePct) < 100;
  const policyTextTrimmed = typeof policy.policy_text === "string" ? policy.policy_text.trim() : "";
  const policySnippet =
    policyTextTrimmed.length > 0
      ? policyTextTrimmed.slice(0, 280) + (policyTextTrimmed.length > 280 ? "…" : "")
      : null;

  if (!windowHrs && !noShowFee && !(graceMin != null && graceMin > 0) && !showLateLine && !policySnippet) {
    return null;
  }

  const cur = policy.currency || currency;

  return (
    <View style={{
      backgroundColor: "#F9FAFB", borderRadius: 16, padding: contentPadding, marginBottom: 16,
      borderWidth: 1, borderColor: "#F3F4F6",
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{t("checkout.cancellationPolicy")}</Text>
      </View>
      {graceMin != null && graceMin > 0 && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} style={{ marginTop: 1, marginRight: 8 }} />
          <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 20 }}>
            {t("checkout.graceCancellation", { count: graceMin })}
          </Text>
        </View>
      )}
      {windowHrs != null && windowHrs > 0 && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} style={{ marginTop: 1, marginRight: 8 }} />
          <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 20 }}>
            {t("checkout.freeCancellation", { count: windowHrs, hourWord: windowHrs === 1 ? t("checkout.hour") : t("checkout.hours") })}
          </Text>
        </View>
      )}
      {showLateLine ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" style={{ marginTop: 1, marginRight: 8 }} />
          <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 20 }}>
            {Number(latePct) <= 0
              ? t("checkout.lateCancellationNoRefund")
              : t("checkout.lateCancellationRefund", { percent: Math.round(Number(latePct)) })}
          </Text>
        </View>
      ) : null}
      {policySnippet ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: noShowFee ? 6 : 0 }}>
          <Ionicons name="document-text-outline" size={16} color="#6B7280" style={{ marginTop: 1, marginRight: 8 }} />
          <Text style={{ fontSize: 12, color: "#6B7280", flex: 1, lineHeight: 18 }}>{policySnippet}</Text>
        </View>
      ) : null}
      {noShowFee ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} style={{ marginTop: 1, marginRight: 8 }} />
          <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 20 }}>
            {t("checkout.noShowFeeApplies", { amount: formatCurrency(policy.no_show_fee_amount!, cur) })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ─── Edit Chip ─── */
function EditChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: "row", alignItems: "center",
        backgroundColor: "#F3F4F6", borderRadius: 999,
        paddingHorizontal: 10, paddingVertical: 5,
      }}
      accessibilityRole="button" accessibilityLabel={`Change ${label}`}
    >
      <Ionicons name="pencil" size={12} color="#6B7280" style={{ marginRight: 4 }} />
      <Text style={{ fontSize: 11, color: "#6B7280", fontWeight: "500" }}>Change</Text>
    </TouchableOpacity>
  );
}

/* ─── Card Brand Icon helper ─── */
function cardBrandIcon(brand?: string): keyof typeof Ionicons.glyphMap {
  const b = (brand || "").toLowerCase();
  if (b.includes("visa")) return "card-outline";
  if (b.includes("master")) return "card-outline";
  return "card-outline";
}

function cardLabel(card: SavedPaymentMethod): string {
  const brand = card.card_type ? card.card_type.charAt(0).toUpperCase() + card.card_type.slice(1) : "Card";
  return card.last4 ? `${brand} •••• ${card.last4}` : brand;
}

/* ─── Saved Card Selector ─── */
function SavedCardSelector({ cards, selected, onSelect, onAddNew, onSetDefault }: {
  cards: SavedPaymentMethod[];
  selected: string | null;
  onSelect: (id: string) => void;
  onAddNew: () => void;
  onSetDefault?: (id: string) => void;
}) {
  if (cards.length === 0) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      {cards.map((card) => {
        const active = selected === card.id;
        const expiry = card.expiry_month && card.expiry_year
          ? `${String(card.expiry_month).padStart(2, "0")}/${String(card.expiry_year).slice(-2)}`
          : null;
        return (
          <Pressable
            key={card.id}
            onPress={() => { haptic.light(); onSelect(card.id); }}
            style={{
              flexDirection: "row", alignItems: "center",
              padding: 14, borderRadius: 14, marginBottom: 8,
              borderWidth: 1.5,
              borderColor: active ? Colors.primary : "#E5E7EB",
              backgroundColor: active ? Colors.primaryLight : "#fff",
            }}
            accessibilityRole="radio" accessibilityState={{ selected: active }}
            accessibilityLabel={cardLabel(card)}
          >
            <View style={{
              width: 40, height: 28, borderRadius: 6, backgroundColor: "#F3F4F6",
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}>
              <Ionicons name={cardBrandIcon(card.card_type)} size={20} color={active ? Colors.primary : "#6B7280"} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: active ? Colors.primary : "#111827" }}>
                {cardLabel(card)}
              </Text>
              {expiry && (
                <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>Expires {expiry}</Text>
              )}
            </View>
            {card.is_default ? (
              <View style={{ backgroundColor: "#ECFDF5", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#059669" }}>Default</Text>
              </View>
            ) : onSetDefault ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation(); haptic.light(); onSetDefault(card.id); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ paddingVertical: 4, paddingHorizontal: 6 }}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: Colors.primary }}>Set default</Text>
              </TouchableOpacity>
            ) : null}
            {active && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
          </Pressable>
        );
      })}
      <Pressable
        onPress={onAddNew}
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "center",
          padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed",
        }}
      >
        <Ionicons name="add-circle-outline" size={18} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={{ fontSize: 13, fontWeight: "500", color: "#6B7280" }}>Use a new card</Text>
      </Pressable>
    </View>
  );
}

/* ─── Save Card Toggle ─── */
function SaveCardToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCur =
    bundle?.meta?.tenant_region?.default_currency?.trim() ?? getTenantDefaultCurrency();
  const saveCardInfo = useMemo(() => {
    const example = formatMoney(1, tenantCur);
    return `We'll save your card securely when you pay. To verify your card, a small temporary charge (e.g. ${example}) may be placed and reversed—this confirms your card for future use.`;
  }, [tenantCur]);
  return (
    <View>
      <Pressable
        onPress={() => { haptic.light(); onToggle(); }}
        style={{
          flexDirection: "row", alignItems: "center",
          paddingVertical: 12, paddingHorizontal: 2,
        }}
        accessibilityRole="switch" accessibilityState={{ checked: enabled }}
        accessibilityLabel={t("checkout.saveCardForFuture")}
      >
        <View style={{
          width: 44, height: 24, borderRadius: 12, justifyContent: "center",
          backgroundColor: enabled ? Colors.primary : "#D1D5DB",
          paddingHorizontal: 2, marginRight: 10,
        }}>
          <View style={{
            width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff",
            alignSelf: enabled ? "flex-end" : "flex-start",
            elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2,
          }} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#111827" }}>Save this card</Text>
          <Text style={{ fontSize: 11, color: "#9CA3AF" }}>For faster checkout next time</Text>
        </View>
        <TouchableOpacity
          onPress={() => { haptic.light(); Alert.alert(t("checkout.saveCard"), saveCardInfo); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Info about saving card"
        >
          <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>
        <Ionicons name="lock-closed-outline" size={14} color="#9CA3AF" />
      </Pressable>
    </View>
  );
}

const CHECKOUT_PRODUCT_PAGE = 16;
const CHECKOUT_PACKAGE_PAGE = 12;
const CHECKOUT_MANY_PRODUCTS = 12;
const CHECKOUT_MANY_PACKAGES = 8;
const CHECKOUT_MANY_CATEGORY_PILLS = 10;

/* ═══════════════════════════════════════════
   Main Screen
   ═══════════════════════════════════════════ */
export default function BookCheckoutScreen() {
  useScreenTracking("Book Checkout");
  const { t } = useTranslation();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  // §UX-audit 2026-04: sticky footer + floating header were using
  // magic `paddingBottom: 28` / `paddingTop: 52` constants which
  // clipped behind the home indicator / dynamic island on modern
  // devices. Drive padding from the live insets instead.
  const insets = useSafeAreaInsets();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const {
    hold_id,
    slug: provider_slug,
    service_name: routeServiceName,
    provider_name: routeProviderName,
    provider_thumbnail: routeProviderThumbnail,
    reschedule_booking_id: routeRescheduleBookingId,
    campaign_id: routeCampaignId,
    provider_id: routeProviderId,
    package_id: routePackageId,
    primary_package_id: routePrimaryPackageId,
  } = useLocalSearchParams<{
    hold_id: string;
    slug?: string;
    service_name?: string;
    provider_name?: string;
    provider_thumbnail?: string;
    reschedule_booking_id?: string;
    campaign_id?: string;
    provider_id?: string;
    /** Prefilled from book flow when user started from a service package deep link */
    package_id?: string | string[];
    /** Same UUID as `package_id` — parity with consume body / web session key naming */
    primary_package_id?: string | string[];
  }>();
  const pickRouteParam = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  /** Preserved across login / 401 so reschedule checkout does not lose `reschedule_booking_id`. */
  const bookContinueReturnTo = useMemo(() => {
    const hid = pickRouteParam(hold_id as string | string[] | undefined);
    if (!hid) return "/(app)/(tabs)/home" as const;
    const rid = pickRouteParam(routeRescheduleBookingId as string | string[] | undefined);
    const q = new URLSearchParams({ hold_id: hid });
    if (rid) q.set("reschedule_booking_id", rid);
    return `/(app)/book/continue?${q.toString()}`;
  }, [hold_id, routeRescheduleBookingId]);
  const initialPackageIdFromRoute =
    pickRouteParam(routePackageId)?.trim() || pickRouteParam(routePrimaryPackageId)?.trim() || undefined;
  const { user } = useAuth();
  const [hold, setHold] = useState<HoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Shown after a successful booking before navigating to booking-detail */
  const [bookingConfirmedData, setBookingConfirmedData] = useState<{ bookingId?: string; providerName?: string; date?: string; time?: string; services?: string; bookingStatus?: string } | null>(null);
  const [consuming, setConsuming] = useState(false);
  const [requestingNow, setRequestingNow] = useState(false);
  const onDemandAcceptEnabled = useFeatureFlag("on_demand_accept_customer_enabled");
  const onDemandModule = useModuleConfig("on_demand");
  const onDemandEnabled = Boolean(onDemandAcceptEnabled && onDemandModule?.enabled);
  const paystackFlagBundle = useFeatureFlag("payment_paystack");
  const walletFlagBundle = useFeatureFlag("payment_wallet");
  const giftCardsFlagBundle = useFeatureFlag("gift_cards");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash" | "wallet" | "giftcard">("card");
  const [cashEnabledOnPlatform, setCashEnabledOnPlatform] = useState(false);
  const [paymentOption, setPaymentOption] = useState<"deposit" | "full">("full");
  const [saveCard, setSaveCard] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardValidating, setGiftCardValidating] = useState(false);
  const [giftCardValid, setGiftCardValid] = useState<{ balance: number; currency: string } | null>(null);
  const [giftCardError, setGiftCardError] = useState<string | null>(null);

  const { cards: savedCards, loading: cardsLoading, defaultCard, refresh: refreshCards } = useSavedCards();

  const [bookingCustomDefinitions, setBookingCustomDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [bookingCustomValues, setBookingCustomValues] = useState<Record<string, string | number | boolean | null>>({});
  const [providerForms, setProviderForms] = useState<ProviderForm[]>([]);
  const [providerFormValues, setProviderFormValues] = useState<Record<string, Record<string, string | number | boolean | null>>>({});
  /** Parity with web booking engine StepReview — required when hold includes a visible cancellation / fee policy. */
  const [cancellationPolicyAccepted, setCancellationPolicyAccepted] = useState(false);
  const [specialRequests, setSpecialRequests] = useState("");
  /** Prefilled from book flow (venue step) via AsyncStorage; sent as house_call_instructions on consume */
  const [houseCallInstructionsPrefill, setHouseCallInstructionsPrefill] = useState("");
  const [promotionCode, setPromotionCode] = useState("");
  /** When true, debounced effect runs promotions/validate once (express link / deep link prefill). */
  const [promoNeedsAutoValidate, setPromoNeedsAutoValidate] = useState(false);
  const [appliedPromoDiscount, setAppliedPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  /** Parity with web: POST /api/me/loyalty-points/calculate-redemption + consume `loyalty_points_used`. */
  const [loyaltyPointsInput, setLoyaltyPointsInput] = useState("");
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [redemptionRate, setRedemptionRate] = useState(10);
  const [minRedemptionPoints, setMinRedemptionPoints] = useState(0);
  const [maxRedemptionPercentage, setMaxRedemptionPercentage] = useState(100);
  const [loyaltyPointsApplied, setLoyaltyPointsApplied] = useState(0);
  const [loyaltyDiscountAmount, setLoyaltyDiscountAmount] = useState(0);
  const [loyaltyValidating, setLoyaltyValidating] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  // Wave 4.2 (audit 2026-04 final 100/100): customer mobile membership
  // discount parity with web. When the customer has an active
  // user_memberships row against this provider, the server's
  // validate-booking path applies discount_percent. We surface that
  // same discount here so the customer sees the reduced total BEFORE
  // submitting, matching the web checkout breakdown exactly.
  const [membershipPlanName, setMembershipPlanName] = useState<string | null>(null);
  const [membershipDiscountPercent, setMembershipDiscountPercent] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
  const [tipCustomInput, setTipCustomInput] = useState("");
  const [isSlotExpired, setIsSlotExpired] = useState(false);
  const [addonsList, setAddonsList] = useState<AddonOption[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [isGroupBooking, setIsGroupBooking] = useState(false);
  const [groupBookingEnabled, setGroupBookingEnabled] = useState(false);
  const [subscribeRecurring, setSubscribeRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [groupParticipants, setGroupParticipants] = useState<{ id: string; name: string; phone?: string; notes?: string; service_ids: string[] }[]>([]);
  const [productsList, setProductsList] = useState<{
    id: string;
    name: string;
    description?: string | null;
    category?: string | null;
    retail_price: number;
    currency: string;
    hasVariants?: boolean;
    defaultVariantId?: string | null;
    defaultVariantPrice?: number;
    variants?: { id: string; retail_price: number }[];
  }[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; productVariantId?: string | null; name: string; price: number; quantity: number; currency: string }[]>([]);
  const [packagesList, setPackagesList] = useState<{ id: string; name: string; description?: string; price: number; currency: string }[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(() =>
    initialPackageIdFromRoute?.trim() ? initialPackageIdFromRoute.trim() : null,
  );
  const [checkoutProductCategory, setCheckoutProductCategory] = useState<string>("All");
  const [checkoutProductSearch, setCheckoutProductSearch] = useState("");
  const [checkoutProductCategoryFilter, setCheckoutProductCategoryFilter] = useState("");
  const [checkoutVisibleProducts, setCheckoutVisibleProducts] = useState(CHECKOUT_PRODUCT_PAGE);
  const [checkoutPackageSearch, setCheckoutPackageSearch] = useState("");
  const [checkoutVisiblePackages, setCheckoutVisiblePackages] = useState(CHECKOUT_PACKAGE_PAGE);

  useEffect(() => {
    if (defaultCard && !selectedCardId && !useNewCard) {
      setSelectedCardId(defaultCard.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when defaultCard changes
  }, [defaultCard]);

  useEffect(() => {
    setCancellationPolicyAccepted(false);
  }, [hold_id]);

  useEffect(() => {
    if (!hold_id) {
      setError(t("checkout.missingBooking"));
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.get<HoldData>(`/api/public/booking-holds/${hold_id}`, { timeout: 120_000 });
        if (cancelled) return;

        if (res.error) {
          throw new Error((res.error as any)?.message || t("checkout.invalidOrExpiredHold"));
        }

        const data = (res.data ?? {}) as Record<string, unknown>;
        if (!data.hold_id && !data.booking_services_snapshot) {
          throw new Error(t("checkout.invalidOrExpiredHold"));
        }

        const meta = (data.metadata as Record<string, unknown> | undefined) ?? {};
        const packageIdFromHold =
          (typeof data.package_id === "string" && data.package_id.trim()
            ? data.package_id.trim()
            : undefined) ??
          (typeof meta.package_id === "string" && meta.package_id.trim()
            ? (meta.package_id as string).trim()
            : undefined) ??
          (typeof meta.primary_package_id === "string" && meta.primary_package_id.trim()
            ? (meta.primary_package_id as string).trim()
            : undefined);

        const holdData: HoldData = {
          hold_id: (data.hold_id ?? data.id ?? hold_id) as string,
          provider_on_demand_accept_enabled: (data as { provider_on_demand_accept_enabled?: boolean }).provider_on_demand_accept_enabled,
          provider_id: data.provider_id as string,
          provider_name: (data.provider_name as string | undefined) ?? routeProviderName,
          provider_thumbnail: (data.provider_thumbnail ?? data.provider_avatar_url) as string | undefined ?? routeProviderThumbnail,
          staff_id: data.staff_id as string | null | undefined,
          location_id: data.location_id as string | null | undefined,
          address_snapshot: data.address_snapshot as Record<string, unknown> | null | undefined,
          booking_services_snapshot: (data.booking_services_snapshot ?? []) as BookingServiceSnapshot[],
          start_at: data.start_at as string,
          end_at: data.end_at as string,
          location_type: (data.location_type ?? "at_salon") as string,
          location_name: data.location_name as string | undefined,
          staff_name: data.staff_name as string | undefined,
          expires_at: data.expires_at as string | undefined,
          deposit_required: data.deposit_required as boolean | undefined,
          deposit_percentage: data.deposit_percentage as number | undefined,
          deposit_amount: data.deposit_amount as number | undefined,
          payment_paystack: (data as { payment_paystack?: boolean }).payment_paystack,
          payment_wallet: (data as { payment_wallet?: boolean }).payment_wallet,
          gift_cards: (data as { gift_cards?: boolean }).gift_cards,
          cash_enabled_on_platform: (data as { cash_enabled_on_platform?: boolean }).cash_enabled_on_platform,
          travel_fee: data.travel_fee as number | undefined,
          travel_distance_km: data.travel_distance_km as number | undefined,
          tips_enabled: (data as { tips_enabled?: boolean }).tips_enabled,
          tip_presets: Array.isArray((data as { tip_presets?: number[] }).tip_presets)
            ? (data as { tip_presets: number[] }).tip_presets
            : undefined,
          cancellation_policy: data.cancellation_policy as HoldData["cancellation_policy"],
          tax_rate_percent: (data as any).tax_rate_percent != null ? Number((data as any).tax_rate_percent) : 0,
          tax_inclusive: Boolean((data as any).tax_inclusive),
          service_fee_config: (data as any).service_fee_config ?? undefined,
          ...(packageIdFromHold ? { package_id: packageIdFromHold } : {}),
        };
        setHold(holdData);
        // Read platform payment policy (cash optional on-platform) as fallback when hold payload is older.
        try {
          const feeRes = await api.get<{ cash_enabled_on_platform?: boolean }>("/api/public/platform-fees");
          setCashEnabledOnPlatform((feeRes.data as any)?.cash_enabled_on_platform === true);
        } catch {
          setCashEnabledOnPlatform(false);
        }
        if (packageIdFromHold) {
          setSelectedPackageId((prev) => prev ?? packageIdFromHold);
        }
        try {
          const saved = await AsyncStorage.getItem("beautonomi_booking_addons");
          if (saved) {
            const parsed = JSON.parse(saved) as unknown;
            if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
              setSelectedAddonIds(parsed);
            }
          }
          const savedPromo = await AsyncStorage.getItem("beautonomi_booking_promotion_code");
          if (savedPromo?.trim()) setPromotionCode(savedPromo.trim());
          const promoPrefillFlag = await AsyncStorage.getItem("beautonomi_booking_promotion_prefill");
          if (promoPrefillFlag === "1" && savedPromo?.trim()) setPromoNeedsAutoValidate(true);
          const savedGift = await AsyncStorage.getItem("beautonomi_booking_gift_card_code");
          if (savedGift?.trim()) setGiftCardCode(savedGift.trim());
          const hci = await AsyncStorage.getItem("beautonomi_booking_house_call_instructions");
          if (hci?.trim()) setHouseCallInstructionsPrefill(hci.trim());
        } catch {
          // ignore parse or get errors
        }
      } catch (e) {
        if (!cancelled) setError(getApiErrorMessage(e, t("checkout.holdExpiredFallback")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [hold_id, t, routeProviderName, routeProviderThumbnail]);

  const checkoutTrackedRef = useRef(false);
  const productPrefillFromLinkAppliedRef = useRef(false);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
  }, []);

  /* Track hold expiry reactively — CountdownBar updates its own UI, but the main screen needs
     to disable the CTA and reflect the expired state without waiting for the next hold fetch. */
  useEffect(() => {
    if (!hold?.expires_at) {
      setIsSlotExpired(false);
      return;
    }
    if (getTimeRemaining(hold.expires_at).expired) {
      setIsSlotExpired(true);
      return;
    }
    // Reset to false when a fresh (non-expired) hold is loaded
    setIsSlotExpired(false);
    const timer = setInterval(() => {
      if (getTimeRemaining(hold.expires_at!).expired) {
        setIsSlotExpired(true);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [hold?.expires_at]);

  useEffect(() => {
    if (!hold?.provider_id) return;
    api.get<{ data?: { forms?: ProviderForm[] }; forms?: ProviderForm[] }>(
      `/api/public/provider-forms?provider_id=${hold.provider_id}`
    ).then((res) => {
      const data = (res as { data?: { forms?: ProviderForm[] }; forms?: ProviderForm[] }).data ?? res;
      const forms = (data as { forms?: ProviderForm[] }).forms ?? [];
      setProviderForms(Array.isArray(forms) ? forms : []);
    }).catch(() => setProviderForms([]));
  }, [hold?.provider_id]);

  useEffect(() => {
    if (!provider_slug) return;
    api.get<{ enabled?: boolean; data?: { enabled?: boolean } }>(
      `/api/public/providers/${encodeURIComponent(provider_slug)}/group-booking-settings`
    ).then((res) => {
      const data = (res as any).data ?? res;
      setGroupBookingEnabled(!!data?.enabled);
    }).catch(() => setGroupBookingEnabled(false));
  }, [provider_slug]);

  useEffect(() => {
    if (!hold) return;
    api.get<{ data?: { definitions?: CustomFieldDefinition[] }; definitions?: CustomFieldDefinition[] }>(
      "/api/custom-fields/definitions?entity_type=booking"
    ).then((res) => {
      const data = (res as { data?: { definitions?: CustomFieldDefinition[] }; definitions?: CustomFieldDefinition[] }).data ?? res;
      const defs = (data as { definitions?: CustomFieldDefinition[] }).definitions ?? [];
      setBookingCustomDefinitions(Array.isArray(defs) ? defs : []);
    }).catch(() => setBookingCustomDefinitions([]));
  }, [hold]);

  useEffect(() => {
    if (!user) return;
    api.get<{ wallet?: { balance: number }; data?: { wallet?: { balance: number } } }>("/api/me/wallet")
      .then((res) => {
        if (res.error) {
          console.warn("[Checkout] Failed to fetch wallet balance:", res.error);
          return;
        }
        const raw = res.data as any;
        const wallet = raw?.data?.wallet ?? raw?.wallet;
        if (wallet?.balance != null) setWalletBalance(Number(wallet.balance) || 0);
      })
      .catch((e) => {
        console.warn("[Checkout] Wallet fetch error:", e);
      });
  }, [user]);

  // Fetch addons for every service in the hold and merge (dedupe by id) for multi-service bookings
  useEffect(() => {
    if (!hold?.provider_id || !hold.booking_services_snapshot?.length) return;
    const offeringIds = hold.booking_services_snapshot
      .map((s) => s.offering_id ?? (s as { id?: string }).id)
      .filter(Boolean) as string[];
    if (offeringIds.length === 0) return;
    const baseUrl = "/api/public/addons";
    Promise.all(
      offeringIds.map((offeringId) => {
        let url = `${baseUrl}?provider_id=${encodeURIComponent(hold!.provider_id)}&service_id=${encodeURIComponent(offeringId)}`;
        if (hold!.location_id) url += `&location_id=${encodeURIComponent(hold!.location_id)}`;
        return api
          .get<AddonOption[] | { data?: AddonOption[] }>(url)
          .then((res) => {
            const raw = (res.data as { data?: AddonOption[] }) ?? res.data;
            return Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
          })
          .catch(() => [] as AddonOption[]);
      })
    ).then((results) => {
      const byId = new Map<string, AddonOption>();
      for (const list of results) {
        const arr = Array.isArray(list) ? list : [];
        for (const a of arr) {
          if (a?.id && !byId.has(a.id)) byId.set(a.id, a);
        }
      }
      setAddonsList(Array.from(byId.values()));
    });
  }, [hold, hold?.provider_id, hold?.location_id, hold?.booking_services_snapshot]);

  // Keep selected addon IDs in sync with loaded addons (e.g. after deep link, only keep ids that exist for this hold)
  useEffect(() => {
    if (addonsList.length === 0) return;
    setSelectedAddonIds((prev) => {
      const valid = prev.filter((id) => addonsList.some((a) => a.id === id));
      return valid.length === prev.length ? prev : valid;
    });
  }, [addonsList]);

  // Fetch provider products when we have slug (for add-to-booking products)
  useEffect(() => {
    if (!provider_slug) return;
    api
      .get<{ id: string; name: string; retail_price: number; currency: string }[] | { data?: unknown }>(
        `/api/public/providers/${encodeURIComponent(provider_slug)}/products`
      )
      .then((res) => {
        if (res.error) return;
        const raw = res.data as any;
        const arr = Array.isArray(raw) ? raw : raw?.data ?? [];
        setProductsList(
          Array.isArray(arr)
            ? arr.map((p: any) => {
                // For variant products, pre-resolve the first in-stock variant
                let defaultVariantId: string | null = null;
                let defaultVariantPrice: number | undefined;
                if (p.hasVariants && Array.isArray(p.variants) && p.variants.length > 0) {
                  const sorted = [...p.variants].sort(
                    (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
                  );
                  const firstInStock =
                    sorted.find((v: any) => (v.quantity ?? 0) > 0) ?? sorted[0];
                  defaultVariantId = firstInStock?.id ?? null;
                  defaultVariantPrice = firstInStock ? Number(firstInStock.retail_price) : undefined;
                }
                const catRaw = p.category;
                const categoryStr =
                  typeof catRaw === "string"
                    ? catRaw.trim() || null
                    : catRaw != null
                      ? String(catRaw).trim() || null
                      : null;
                return {
                  id: p.id,
                  name: p.name || "Product",
                  description: typeof p.description === "string" ? p.description : p.description != null ? String(p.description) : null,
                  category: categoryStr,
                  retail_price: defaultVariantPrice ?? (Number(p.price ?? p.retail_price) || 0),
                  currency: p.currency || getTenantDefaultCurrency(),
                  hasVariants: Boolean(p.hasVariants),
                  defaultVariantId,
                  defaultVariantPrice,
                  variants: Array.isArray(p.variants)
                    ? p.variants.map((v: any) => ({ id: v.id, retail_price: Number(v.retail_price) || 0 }))
                    : undefined,
                };
              })
            : []
        );
      })
      .catch(() => setProductsList([]));
  }, [provider_slug]);

  useEffect(() => {
    if (productPrefillFromLinkAppliedRef.current || !provider_slug || productsList.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem("beautonomi_booking_product_cart");
        if (!raw?.trim() || cancelled) return;
        const lines = JSON.parse(raw) as { product_id: string; product_variant_id?: string; quantity: number }[];
        if (!Array.isArray(lines)) return;
        const merged = lines
          .map((line) => {
            const p = productsList.find((x) => x.id === line.product_id);
            if (!p) return null;
            const q = Math.max(1, Math.floor(Number(line.quantity) || 1));
            const variantId = line.product_variant_id ?? p.defaultVariantId ?? null;
            let variantPrice: number | undefined;
            if (variantId && p.hasVariants && Array.isArray(p.variants)) {
              const v = p.variants.find((v) => v.id === variantId);
              if (v) variantPrice = v.retail_price;
            }
            return {
              productId: p.id,
              productVariantId: variantId,
              name: p.name,
              price: variantPrice ?? (Number(p.retail_price) || 0),
              quantity: q,
              currency: p.currency || getTenantDefaultCurrency(),
            };
          })
          .filter(Boolean) as { productId: string; productVariantId?: string | null; name: string; price: number; quantity: number; currency: string }[];
        if (merged.length > 0 && !cancelled) {
          productPrefillFromLinkAppliedRef.current = true;
          setSelectedProducts(merged);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider_slug, productsList]);

  // Fetch provider packages (optional add-to-booking)
  useEffect(() => {
    if (!provider_slug) return;
    let url = `/api/public/providers/${encodeURIComponent(provider_slug)}/packages`;
    if (hold?.location_id) url += `?location_id=${encodeURIComponent(hold.location_id)}`;
    api
      .get<{ id: string; name: string; description?: string; price: number; currency: string }[] | { data?: unknown }>(url)
      .then((res) => {
        if (res.error) return;
        const raw = res.data as any;
        const arr = Array.isArray(raw) ? raw : raw?.data ?? [];
        setPackagesList(Array.isArray(arr) ? arr.map((p: any) => ({ id: p.id, name: p.name || "Package", description: p.description, price: Number(p.price) || 0, currency: p.currency || getTenantDefaultCurrency() })) : []);
      })
      .catch(() => setPackagesList([]));
  }, [provider_slug, hold?.location_id]);

  /** After packages load, keep route `package_id` only if that package is available (e.g. location-scoped list). */
  useEffect(() => {
    const id = initialPackageIdFromRoute?.trim();
    if (!id) return;
    if (packagesList.length === 0) return;
    if (packagesList.some((p) => p.id === id)) {
      setSelectedPackageId(id);
    } else {
      setSelectedPackageId(null);
    }
  }, [packagesList, initialPackageIdFromRoute]);

  const productCategoryPills = useMemo(() => {
    const named = new Set<string>();
    let hasUncat = false;
    for (const p of productsList) {
      const c = p.category?.trim();
      if (c) named.add(c);
      else hasUncat = true;
    }
    const sorted = [...named].sort((a, b) => a.localeCompare(b));
    return ["All", ...sorted, ...(hasUncat ? ["Other"] : [])] as string[];
  }, [productsList]);

  useEffect(() => {
    if (productCategoryPills.length <= 1) return;
    if (!productCategoryPills.includes(checkoutProductCategory)) {
      setCheckoutProductCategory("All");
    }
  }, [productCategoryPills, checkoutProductCategory]);

  useEffect(() => {
    setCheckoutVisibleProducts(CHECKOUT_PRODUCT_PAGE);
  }, [checkoutProductCategory, checkoutProductSearch]);

  useEffect(() => {
    setCheckoutVisiblePackages(CHECKOUT_PACKAGE_PAGE);
  }, [checkoutPackageSearch]);

  const filteredCheckoutProducts = useMemo(() => {
    let list =
      checkoutProductCategory === "All"
        ? productsList
        : checkoutProductCategory === "Other"
          ? productsList.filter((p) => !p.category?.trim())
          : productsList.filter((p) => (p.category || "").trim() === checkoutProductCategory);
    const q = checkoutProductSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [productsList, checkoutProductCategory, checkoutProductSearch]);

  const displayedCheckoutCategoryPills = useMemo(() => {
    const q = checkoutProductCategoryFilter.trim().toLowerCase();
    let list = productCategoryPills;
    if (q && productCategoryPills.length >= CHECKOUT_MANY_CATEGORY_PILLS) {
      list = productCategoryPills.filter((label) => label.toLowerCase().includes(q));
    }
    if (checkoutProductCategory !== "All" && !list.includes(checkoutProductCategory)) {
      list = [checkoutProductCategory, ...list];
    }
    return list;
  }, [productCategoryPills, checkoutProductCategoryFilter, checkoutProductCategory]);

  const visibleCheckoutProductRows = useMemo(
    () => filteredCheckoutProducts.slice(0, checkoutVisibleProducts),
    [filteredCheckoutProducts, checkoutVisibleProducts],
  );

  const filteredCheckoutPackages = useMemo(() => {
    const q = checkoutPackageSearch.trim().toLowerCase();
    if (!q) return packagesList;
    return packagesList.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(q) ||
        (pkg.description && String(pkg.description).toLowerCase().includes(q)),
    );
  }, [packagesList, checkoutPackageSearch]);

  const visibleCheckoutPackages = useMemo(
    () => filteredCheckoutPackages.slice(0, checkoutVisiblePackages),
    [filteredCheckoutPackages, checkoutVisiblePackages],
  );

  const showCheckoutProductSearch =
    productsList.length >= CHECKOUT_MANY_PRODUCTS || filteredCheckoutProducts.length >= CHECKOUT_MANY_PRODUCTS;
  const showCheckoutCategoryFilter = productCategoryPills.length >= CHECKOUT_MANY_CATEGORY_PILLS;
  const showCheckoutPackageSearch =
    packagesList.length >= CHECKOUT_MANY_PACKAGES || filteredCheckoutPackages.length >= CHECKOUT_MANY_PACKAGES;

  const snapshotOfferingIds = hold?.booking_services_snapshot?.map((s) => s.offering_id ?? (s as { id?: string }).id).filter(Boolean) as string[] ?? [];

  const offeringPriceMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!hold?.booking_services_snapshot) return m;
    for (const s of hold.booking_services_snapshot) {
      const id = s.offering_id ?? (s as { id?: string }).id;
      if (id) m.set(id, s.price);
    }
    return m;
  }, [hold?.booking_services_snapshot]);

  const primarySubtotal = hold ? hold.booking_services_snapshot.reduce((s, svc) => s + svc.price, 0) : 0;
  const groupParticipantsSubtotal = isGroupBooking && groupParticipants.length > 0
    ? groupParticipants.reduce((sum, p) => {
        const ids = p.service_ids.length > 0 ? p.service_ids : snapshotOfferingIds;
        return sum + ids.reduce((s, id) => s + (offeringPriceMap.get(id) ?? 0), 0);
      }, 0)
    : 0;
  const subtotal = hold ? primarySubtotal + groupParticipantsSubtotal : 0;
  const currency = hold?.booking_services_snapshot[0]?.currency || getTenantDefaultCurrency();
  const travelFee = hold?.travel_fee ?? 0;
  const addonsSubtotal = addonsList
    .filter((a) => selectedAddonIds.includes(a.id))
    .reduce((s, a) => s + (Number(a.price) || 0), 0);
  const productsSubtotal = selectedProducts.reduce((s, p) => s + p.price * p.quantity, 0);
  const prePromoTotal = subtotal + addonsSubtotal + travelFee + productsSubtotal;
  const effectivePromoDiscount = Math.min(appliedPromoDiscount, prePromoTotal);
  const subtotalAfterPromo = Math.max(0, prePromoTotal - effectivePromoDiscount);
  // Wave 4.2: membership discount applies after coupon/gift, before
  // loyalty & tax. Mirrors web booking-flow.tsx calc.
  const membershipDiscountAmount =
    membershipDiscountPercent > 0
      ? Math.min(
          Math.round(((subtotalAfterPromo * membershipDiscountPercent) / 100) * 100) / 100,
          subtotalAfterPromo,
        )
      : 0;
  const subtotalAfterMembership = Math.max(
    0,
    subtotalAfterPromo - membershipDiscountAmount,
  );
  const subtotalAfterLoyalty = Math.max(
    0,
    subtotalAfterMembership - loyaltyDiscountAmount,
  );

  // Tax: only when provider has set a non-zero tax rate (applied after promo + loyalty discount)
  const taxRatePercent = hold?.tax_rate_percent ?? 0;
  const isTaxInclusive = hold?.tax_inclusive ?? false;
  const taxAmount = taxRatePercent > 0
    ? isTaxInclusive
      ? subtotalAfterLoyalty - subtotalAfterLoyalty / (1 + taxRatePercent / 100)
      : Math.round((subtotalAfterLoyalty * taxRatePercent) / 100 * 100) / 100
    : 0;

  // Service fee: only when configured and visible to customer
  const sfConfig = hold?.service_fee_config;
  const serviceFeeAmount = sfConfig && sfConfig.show
    ? sfConfig.type === "percentage"
      ? Math.round((subtotalAfterLoyalty * sfConfig.percentage) / 100 * 100) / 100
      : sfConfig.fixed
    : 0;

  const total = isTaxInclusive
    ? Math.max(0, subtotalAfterLoyalty + tipAmount + serviceFeeAmount)
    : Math.max(0, subtotalAfterLoyalty + taxAmount + tipAmount + serviceFeeAmount);

  const bookingSubtotalForLoyalty = subtotalAfterMembership;
  const maxRedeemablePointsOnBooking = useMemo(() => {
    if (bookingSubtotalForLoyalty <= 0) return 0;
    const maxDiscount = (bookingSubtotalForLoyalty * maxRedemptionPercentage) / 100;
    return Math.floor(maxDiscount * redemptionRate);
  }, [bookingSubtotalForLoyalty, maxRedemptionPercentage, redemptionRate]);

  useEffect(() => {
    if (hold && hold_id && total != null && !checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true;
      trackCheckoutStarted(hold_id, total);
    }
  }, [hold, hold_id, total]);

  const paystackEnabled = hold ? hold.payment_paystack !== false : paystackFlagBundle;
  const walletEnabled = hold ? hold.payment_wallet !== false : walletFlagBundle;
  const giftCardsEnabled = hold ? hold.gift_cards !== false : giftCardsFlagBundle;
  const cashEnabled = hold?.cash_enabled_on_platform === true || cashEnabledOnPlatform;

  const depositPctEffective =
    hold?.deposit_percentage != null && !Number.isNaN(Number(hold.deposit_percentage))
      ? Number(hold.deposit_percentage)
      : hold?.deposit_required
        ? 30
        : 0;
  const depositAmountComputed =
    hold?.deposit_amount != null && hold.deposit_amount > 0
      ? hold.deposit_amount
      : depositPctEffective > 0
        ? Math.ceil((total * depositPctEffective) / 100)
        : 0;
  const hasDeposit = !!(hold?.deposit_required && depositPctEffective > 0 && depositAmountComputed > 0);
  const depositAmount = depositAmountComputed;

  useEffect(() => {
    if (!hold) return;
    const paystack = hold.payment_paystack !== false;
    const walletOk = hold.payment_wallet !== false;
    const giftOk = hold.gift_cards !== false;
    if (paymentMethod === "giftcard" && !giftOk) {
      setPaymentMethod(paystack ? "card" : cashEnabled ? "cash" : "card");
      return;
    }
    if (paymentMethod === "wallet" && !walletOk) {
      setPaymentMethod(paystack ? "card" : cashEnabled ? "cash" : "card");
      return;
    }
    if (paymentMethod === "card" && !paystack && cashEnabled) {
      setPaymentMethod("cash");
    }
    if (paymentMethod === "cash" && !cashEnabled) {
      setPaymentMethod(paystack ? "card" : walletOk ? "wallet" : giftOk ? "giftcard" : "card");
    }
  }, [hold, paymentMethod, cashEnabled]);

  useEffect(() => {
    if (!hasDeposit) setPaymentOption("full");
  }, [hasDeposit]);

  const applyPromoCode = useCallback(async () => {
    const code = promotionCode.trim().toUpperCase();
    if (!code || !hold?.provider_id) return;
    setPromoError(null);
    setPromoValidating(true);
    try {
      const res = await api.post<{ data?: { valid?: boolean; discount?: { amount: number }; message?: string }; valid?: boolean; discount?: { amount: number }; message?: string }>(
        "/api/public/promotions/validate",
        {
          code,
          provider_id: hold.provider_id,
          booking_amount: prePromoTotal,
          location_type: hold.location_type,
          location_id: hold.location_id ?? undefined,
        }
      );
      if (res.error) {
        setAppliedPromoDiscount(0);
        setPromoError(getApiErrorMessage(res.error, "Invalid or expired promo code"));
        return;
      }
      const data = res.data as any;
      const payload = data?.data ?? data;
      if (payload?.valid && payload?.discount?.amount != null) {
        setAppliedPromoDiscount(Math.max(0, Math.min(Number(payload.discount.amount), prePromoTotal)));
        setPromoError(null);
        haptic.success();
      } else {
        setAppliedPromoDiscount(0);
        setPromoError(payload?.message ?? "Invalid or expired promo code");
      }
    } catch (e) {
      setAppliedPromoDiscount(0);
      setPromoError(getApiErrorMessage(e, "Could not validate promo code"));
    } finally {
      setPromoValidating(false);
    }
  }, [promotionCode, hold?.provider_id, hold?.location_type, hold?.location_id, prePromoTotal]);

  const applyPromoCodeRef = useRef(applyPromoCode);
  applyPromoCodeRef.current = applyPromoCode;

  useEffect(() => {
    if (!promoNeedsAutoValidate || !promotionCode.trim() || !hold?.provider_id) return;
    const timer = setTimeout(() => {
      setPromoNeedsAutoValidate(false);
      void AsyncStorage.removeItem("beautonomi_booking_promotion_prefill");
      void applyPromoCodeRef.current();
    }, 900);
    return () => clearTimeout(timer);
  }, [promoNeedsAutoValidate, prePromoTotal, promotionCode, hold?.provider_id]);

  useEffect(() => {
    setLoyaltyPointsApplied(0);
    setLoyaltyDiscountAmount(0);
    setLoyaltyPointsInput("");
    setLoyaltyError(null);
  }, [subtotalAfterPromo]);

  // Wave 4.2: load membership discount for this provider once the hold
  // is resolved. Same endpoint the web customer uses (/api/me/membership).
  useEffect(() => {
    if (!user || !hold?.provider_id) {
      setMembershipDiscountPercent(0);
      setMembershipPlanName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{
          data?: {
            provider_memberships?: Array<{
              provider_id: string;
              plan_name?: string;
              discount_percent?: number;
            }>;
          };
        }>("/api/me/membership");
        if (cancelled || res.error) return;
        const raw = res.data as { data?: Record<string, unknown> } | Record<string, unknown>;
        const d =
          ((raw as { data?: Record<string, unknown> }).data ?? raw) as {
            provider_memberships?: Array<{
              provider_id: string;
              plan_name?: string;
              discount_percent?: number;
            }>;
          };
        const match = (d?.provider_memberships ?? []).find(
          (m) => m.provider_id === hold.provider_id,
        );
        if (match && (match.discount_percent ?? 0) > 0) {
          setMembershipDiscountPercent(Number(match.discount_percent) || 0);
          setMembershipPlanName(match.plan_name ?? "Member discount");
        } else {
          setMembershipDiscountPercent(0);
          setMembershipPlanName(null);
        }
      } catch {
        // Membership is optional; never block checkout.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, hold?.provider_id]);

  useEffect(() => {
    if (!user) {
      setLoyaltyBalance(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{
          data?: {
            balance?: number;
            redemption_rate?: number;
            min_redemption_points?: number;
            max_redemption_percentage?: number;
          };
        }>("/api/me/loyalty/balance");
        if (cancelled || res.error) return;
        const raw = res.data as { data?: Record<string, unknown> } | Record<string, unknown>;
        const d = (raw as { data?: Record<string, unknown> }).data ?? raw;
        if (d && typeof d === "object") {
          if ("balance" in d && d.balance != null) setLoyaltyBalance(Number(d.balance) || 0);
          if ("redemption_rate" in d && d.redemption_rate != null) setRedemptionRate(Number(d.redemption_rate) || 10);
          if ("min_redemption_points" in d && d.min_redemption_points != null) {
            setMinRedemptionPoints(Number(d.min_redemption_points) || 0);
          }
          if ("max_redemption_percentage" in d && d.max_redemption_percentage != null) {
            setMaxRedemptionPercentage(Number(d.max_redemption_percentage) ?? 100);
          }
        }
      } catch {
        // Loyalty is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const applyLoyaltyPoints = useCallback(async () => {
    if (!user) return;
    const raw = parseInt(loyaltyPointsInput.trim(), 10);
    if (!Number.isFinite(raw) || raw <= 0) {
      setLoyaltyError("Enter how many points to use");
      return;
    }
    setLoyaltyValidating(true);
    setLoyaltyError(null);
    try {
      const res = await api.post<{
        data?: {
          valid?: boolean;
          errors?: string[];
          calculation?: { points_to_redeem: number; discount_amount: number };
          config?: { min_redemption_points?: number };
        };
      }>("/api/me/loyalty-points/calculate-redemption", {
        points_to_redeem: raw,
        booking_subtotal: bookingSubtotalForLoyalty,
      });
      if (res.error) {
        setLoyaltyPointsApplied(0);
        setLoyaltyDiscountAmount(0);
        setLoyaltyError(res.error.message || "Could not apply loyalty points");
        return;
      }
      const top = res.data as { data?: Record<string, unknown> } | Record<string, unknown> | null;
      const rawPayload = (top && typeof top === "object" && "data" in top && (top as { data?: unknown }).data)
        ? (top as { data: Record<string, unknown> }).data
        : (top as Record<string, unknown> | null);
      const payload = rawPayload ?? {};
      const calc = payload.calculation as { points_to_redeem: number; discount_amount: number } | undefined;
      if (!calc) {
        setLoyaltyError("Could not calculate loyalty");
        return;
      }
      const { points_to_redeem, discount_amount } = calc;
      const minPts =
        (payload.config as { min_redemption_points?: number } | undefined)?.min_redemption_points ?? minRedemptionPoints;
      if (points_to_redeem < minPts) {
        setLoyaltyError(`At least ${minPts} redeemable points on this booking (after % cap).`);
        setLoyaltyPointsApplied(0);
        setLoyaltyDiscountAmount(0);
        return;
      }
      setLoyaltyPointsApplied(points_to_redeem);
      setLoyaltyDiscountAmount(Math.round(Number(discount_amount) * 100) / 100);
      setLoyaltyPointsInput(String(points_to_redeem));
      haptic.success();
      const errs = payload.errors as string[] | undefined;
      const valid = payload.valid as boolean | undefined;
      if (errs?.length && !valid) {
        Alert.alert("Loyalty", errs.join(" "));
      }
    } catch (e) {
      setLoyaltyPointsApplied(0);
      setLoyaltyDiscountAmount(0);
      setLoyaltyError(getApiErrorMessage(e as Error, "Failed to apply loyalty points"));
    } finally {
      setLoyaltyValidating(false);
    }
  }, [user, loyaltyPointsInput, bookingSubtotalForLoyalty, minRedemptionPoints]);

  const applyGiftCard = useCallback(async () => {
    const code = giftCardCode.trim().toUpperCase();
    if (!code) return;
    setGiftCardError(null);
    setGiftCardValidating(true);
    try {
      const res = await api.get<{ valid?: boolean; balance?: number; currency?: string; message?: string }>(
        `/api/public/gift-cards/validate?code=${encodeURIComponent(code)}`
      );
      if (res.error) {
        setGiftCardValid(null);
        setGiftCardError(res.error.message || "Could not validate gift card");
        setGiftCardValidating(false);
        return;
      }
      const data = res.data as any;
      if (data?.valid && data?.balance != null) {
        setGiftCardValid({ balance: Number(data.balance), currency: data.currency || getTenantDefaultCurrency() });
        haptic.success();
      } else {
        setGiftCardValid(null);
        setGiftCardError(data?.message ?? "Invalid or expired gift card");
      }
    } catch {
      setGiftCardValid(null);
      setGiftCardError("Could not validate gift card");
    } finally {
      setGiftCardValidating(false);
    }
  }, [giftCardCode]);

  const navigateToBooking = useCallback((bookingId?: string, previousBookingId?: string, bookingStatus?: string) => {
    haptic.success();
    clearPendingExcludeHoldId().catch(() => {});
    AsyncStorage.removeItem("beautonomi_booking_addons").catch(() => {});
    AsyncStorage.removeItem("beautonomi_booking_promotion_code").catch(() => {});
    AsyncStorage.removeItem("beautonomi_booking_promotion_prefill").catch(() => {});
    AsyncStorage.removeItem("beautonomi_booking_gift_card_code").catch(() => {});
    AsyncStorage.removeItem("beautonomi_booking_product_cart").catch(() => {});
    AsyncStorage.removeItem("beautonomi_booking_house_call_instructions").catch(() => {});

    // Ad attribution: record "book" event when user completed booking from a sponsored result (one event per booking)
    if (routeCampaignId && routeProviderId) {
      api
        .post("/api/public/ads/event", {
          event_type: "book",
          campaign_id: routeCampaignId,
          provider_id: routeProviderId,
          idempotency_key: `book:${routeCampaignId}:${routeProviderId}:${bookingId ?? hold_id}`,
          attribution: { booking_id: bookingId },
        })
        .catch(() => {});
    }

    // Build summary for the success overlay
    const holdServices = hold?.booking_services_snapshot ?? [];
    const serviceNames = holdServices
      .map((s: BookingServiceSnapshot) => s.service_name ?? s.title ?? s.name ?? "")
      .filter(Boolean)
      .join(", ");
    const startAt = hold?.start_at;
    const bookingDate = startAt
      ? new Date(startAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
      : undefined;
    const bookingTime = startAt
      ? new Date(startAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : undefined;

    // Show the success overlay — it auto-dismisses and navigates after 2.5 s
    setBookingConfirmedData({
      bookingId,
      providerName: hold?.provider_name ?? undefined,
      date: bookingDate,
      time: bookingTime,
      services: serviceNames || undefined,
      bookingStatus,
    });

    const navigate = () => {
      if (!bookingId) {
        router.replace({ pathname: "/(app)/(tabs)/bookings" });
        return;
      }
      if (previousBookingId) {
        Alert.alert(
          "Rescheduled",
          "Would you like to cancel your previous appointment?",
          [
            { text: "Keep both", style: "cancel", onPress: () => router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } }) },
            {
              text: "Cancel previous",
              style: "destructive",
              onPress: async () => {
                try {
                  const res = await api.post(`/api/me/bookings/${previousBookingId}/cancel`, {
                    reason: "Reschedule - previous appointment replaced",
                  });
                  if (res.error) {
                    Alert.alert("Note", "Could not cancel the previous booking. You can cancel it manually from your bookings.");
                  } else {
                    haptic.success();
                  }
                } catch {
                  Alert.alert("Note", "Could not cancel the previous booking. You can cancel it manually from your bookings.");
                }
                router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } });
              },
            },
          ]
        );
      } else {
        router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } });
      }
    };

    navTimeoutRef.current = setTimeout(navigate, 2600);
  }, [routeCampaignId, routeProviderId, hold_id, hold]);

  const handleRequestNow = useCallback(async () => {
    if (!hold_id || !hold || !user) return;
    if (hold.expires_at && getTimeRemaining(hold.expires_at).expired) {
      setError("This time slot has expired. Please go back and select a new time.");
      return;
    }
    if (cancellationPolicyRequiresCustomerAck(hold.cancellation_policy) && !cancellationPolicyAccepted) {
      haptic.error();
      setError(t("checkout.acceptCancellationPolicyRequired"));
      return;
    }
    setRequestingNow(true);
    setError(null);
    try {
      const requestPayload: Record<string, unknown> = {
        provider_id: hold.provider_id,
        services: hold.booking_services_snapshot.map((s) => {
          const snap = s as { offering_id?: string; id?: string };
          return { offering_id: snap.offering_id ?? snap.id ?? "", staff_id: hold.staff_id ?? undefined };
        }),
        selected_datetime: hold.start_at,
        location_type: hold.location_type as "at_home" | "at_salon",
        location_id: hold.location_id ?? null,
        address: hold.address_snapshot ?? null,
        addons: [],
        tip_amount: 0,
        travel_fee: hold.travel_fee ?? 0,
      };
      if (user?.user_metadata?.full_name || user?.email) {
        const parts = (user.user_metadata?.full_name ?? "").trim().split(/\s+/);
        requestPayload.client_info = {
          firstName: parts[0] || "Guest",
          lastName: parts.slice(1).join(" ") || "User",
          email: user.email ?? undefined,
          phone: user.phone ?? undefined,
        };
      }
      const res = await api.post<{ id: string }>(
        `/api/me/on-demand/requests`,
        {
          provider_id: hold.provider_id,
          request_payload: requestPayload,
        },
        { timeout: 120_000 }
      );
      if (res.error) {
        haptic.error();
        setError(getApiErrorMessage(res.error, "Failed to submit request"));
        return;
      }
      const requestId = (res.data as { id?: string } | null)?.id;
      if (!requestId) {
        setError("Invalid response from server");
        return;
      }
      haptic.success();
      router.replace({ pathname: "/(app)/on-demand/waiting", params: { requestId } });
    } catch (e) {
      haptic.error();
      setError(getApiErrorMessage(e, "Request failed"));
    } finally {
      setRequestingNow(false);
    }
  }, [hold_id, hold, user, cancellationPolicyAccepted, t]);

  const handleComplete = useCallback(async () => {
    if (!hold_id || !hold) return;

    if (!user) {
      router.replace({
        pathname: "/(auth)/login",
        params: { return_to: bookContinueReturnTo },
      });
      return;
    }

    if (hold.expires_at && getTimeRemaining(hold.expires_at).expired) {
      setError("This time slot has expired. Please go back and select a new time.");
      return;
    }

    if (paymentMethod === "giftcard" && (!giftCardCode.trim() || !giftCardValid)) {
      setError("Please enter and apply a valid gift card code.");
      return;
    }

    if (paymentMethod === "card" && !paystackEnabled) {
      setError("Online card payment is unavailable for this market.");
      return;
    }
    if (paymentMethod === "wallet" && !walletEnabled) {
      setError("Wallet payment is unavailable for this market.");
      return;
    }

    const requiredCustom = bookingCustomDefinitions.filter((d) => d.is_required).map((d) => d.name);
    const missingCustom = requiredCustom.filter(
      (name) =>
        bookingCustomValues[name] === undefined ||
        bookingCustomValues[name] === null ||
        String(bookingCustomValues[name] ?? "").trim() === ""
    );
    if (missingCustom.length > 0) {
      setError("Please fill in all required additional details.");
      return;
    }
    for (const form of providerForms) {
      for (const field of form.fields || []) {
        if (!field.is_required) continue;
        const val = providerFormValues[form.id]?.[field.id];
        if (val === undefined || val === null || String(val).trim() === "") {
          setError(`Please complete: ${form.title} — ${field.name}`);
          return;
        }
      }
    }

    if (cancellationPolicyRequiresCustomerAck(hold.cancellation_policy) && !cancellationPolicyAccepted) {
      haptic.error();
      setError(t("checkout.acceptCancellationPolicyRequired"));
      return;
    }

    setConsuming(true);
    setError(null);

    try {
      const fingerprint = await getGuestFingerprintHash();

      const payload: Record<string, unknown> = {
        payment_method: paymentMethod === "wallet" ? "card" : paymentMethod === "giftcard" ? "giftcard" : paymentMethod,
        payment_option: paymentOption,
        use_wallet:
          paymentMethod === "wallet" ||
          (paymentMethod === "card" && useWallet) ||
          loyaltyPointsApplied > 0,
        save_card: paymentMethod === "card" && (useNewCard || savedCards.length === 0) ? saveCard : false,
        guest_fingerprint_hash: fingerprint,
      };
      if (paymentMethod === "card" && selectedCardId && !useNewCard && savedCards.length > 0) {
        payload.payment_method_id = selectedCardId;
      }
      if (paymentMethod === "giftcard" && giftCardCode.trim() && giftCardValid) {
        payload.gift_card_code = giftCardCode.trim().toUpperCase();
      }
      if (Object.keys(bookingCustomValues).length > 0) payload.custom_field_values = bookingCustomValues;
      if (Object.keys(providerFormValues).length > 0) payload.provider_form_responses = providerFormValues;
      if (specialRequests.trim()) payload.special_requests = specialRequests.trim();
      if (houseCallInstructionsPrefill.trim()) payload.house_call_instructions = houseCallInstructionsPrefill.trim();
      if (promotionCode.trim()) payload.promotion_code = promotionCode.trim();
      if (selectedAddonIds.length > 0) payload.addons = selectedAddonIds;
      if (routeRescheduleBookingId) payload.reschedule_booking_id = routeRescheduleBookingId;
      if (tipAmount > 0) payload.tip_amount = tipAmount;
      if (loyaltyPointsApplied > 0) payload.loyalty_points_used = loyaltyPointsApplied;
      const validParticipants = isGroupBooking ? groupParticipants.filter((p) => p.name.trim()).map((p) => ({
        name: p.name.trim(),
        email: undefined,
        phone: p.phone?.trim() || undefined,
        service_ids: p.service_ids.length > 0 ? p.service_ids : snapshotOfferingIds,
        notes: p.notes?.trim() || undefined,
      })) : [];
      if (validParticipants.length > 0) {
        payload.is_group_booking = true;
        payload.group_participants = validParticipants;
      }
      if (selectedProducts.length > 0) {
        payload.products = selectedProducts.map((p) => ({
          productId: p.productId,
          productVariantId: p.productVariantId ?? null,
          quantity: p.quantity,
          unitPrice: p.price,
          totalPrice: p.price * p.quantity,
        }));
      }
      if (selectedPackageId) {
        payload.package_id = selectedPackageId;
        payload.primary_package_id = selectedPackageId;
      }
      if (user?.user_metadata?.full_name || user?.email) {
        const parts = (user.user_metadata?.full_name ?? "").trim().split(/\s+/);
        payload.client_info = {
          firstName: parts[0] || "Guest",
          lastName: parts.slice(1).join(" ") || "User",
          email: user.email ?? undefined,
          phone: user.phone ?? undefined,
        };
      }
      if (subscribeRecurring && user && !routeRescheduleBookingId && !isGroupBooking) {
        payload.subscribe_recurring = { enabled: true, frequency: recurringFrequency };
      }

      const res = await api.post<ConsumeResponse>(
        `/api/public/booking-holds/${hold_id}/consume`,
        payload,
        { timeout: 120_000 }
      );

      if (res.error) {
        haptic.error();
        const errStatus = (res.error as { status?: number }).status;
        const errCode = (res.error as { code?: string }).code;
        if (errStatus === 401) {
          router.replace({
            pathname: "/(auth)/login",
            params: { return_to: bookContinueReturnTo },
          });
          return;
        }
        if (errStatus === 403) {
          const msg403 =
            errCode === "SUBSCRIPTION_LIMIT_EXCEEDED"
              ? "You've reached your booking limit. Please upgrade your plan."
              : errCode === "MARKET_SWITCH_REQUIRED"
                ? "This provider is in a different market. Please update your location."
                : errCode === "HOLD_OWNERSHIP"
                  ? "This booking slot is tied to another device or session. Go back, pick the time again, and complete checkout within a few minutes."
                  : "You don't have permission to complete this booking. Please sign in again.";
          setError(msg403);
          return;
        }
        if (errStatus === 410 || errCode === "HOLD_INVALID" || errCode === "HOLD_EXPIRED" || errCode === "HOLD_INACTIVE") {
          setError(t("checkout.holdExpiredFallback", "Your hold has expired. Please go back and select a new time."));
          return;
        }
        if (errStatus === 409 || errCode === "CONFLICT") {
          setError(t("checkout.slotTakenFallback", "That time slot was just taken. Please go back and choose another time."));
          return;
        }
        setError(getApiErrorMessage(res.error, "Failed to complete booking"));
        return;
      }

      const data = res.data;
      const bookingId = data?.booking_id;

      /* Server creates the Paystack transaction in POST /api/public/bookings; must open this URL (same as web book/continue). */
      const paymentUrl = data?.payment_url;

      const recurringSub = data?.recurring_subscription;
      const notifyRecurringSubscription = () => {
        if (!subscribeRecurring) return;
        if (recurringSub?.created) {
          Alert.alert("Repeating schedule saved", "Manage it anytime under Account settings → Recurring bookings.");
        } else if (recurringSub?.pending) {
          Alert.alert(
            "Repeating schedule",
            "After your payment succeeds, your repeating schedule will appear under Account settings → Recurring bookings.",
          );
        } else if (recurringSub && recurringSub.created === false && recurringSub.message) {
          Alert.alert("Repeating schedule", recurringSub.message);
        }
      };

      if (paymentUrl && paymentMethod === "card") {
        await WebBrowser.openBrowserAsync(paymentUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        });
        if (saveCard) refreshCards();

        let confirmedBookingId = bookingId;
        let confirmedBookingStatus: string | undefined;
        let paymentConfirmed = false;
        if (bookingId) {
          // §Final-audit 2026-04: poll BOTH `status` and `payment_status`
          // to avoid false-positive confirms (booking can flip to
          // `confirmed` via a non-payment path) and false-negatives
          // (gateway marked paid but status still `pending_payment` until
          // the webhook completes). Completion requires payment_status in
          // {paid, partially_paid} OR a non-pending booking status.
          const MAX_ATTEMPTS = 10;
          const POLL_INTERVAL_MS = 2000;
          for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
              const check = await api.get<{
                status?: string;
                payment_status?: string;
                id?: string;
              }>(`/api/me/bookings/${encodeURIComponent(bookingId)}`);
              const checkData = (check.data ?? null) as
                | { status?: string; payment_status?: string }
                | null;
              const statusVal = checkData?.status;
              const paymentStatusVal = checkData?.payment_status;
              const paidByGateway =
                paymentStatusVal === "paid" ||
                paymentStatusVal === "partially_paid";
              const statusConfirmed =
                !!statusVal &&
                statusVal !== "pending_payment" &&
                statusVal !== "pending";
              if (paidByGateway || statusConfirmed) {
                confirmedBookingId = bookingId;
                confirmedBookingStatus = statusVal;
                paymentConfirmed = true;
                break;
              }
            } catch {
              // ignore poll errors
            }
            if (attempt < MAX_ATTEMPTS - 1) {
              await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
            }
          }
        }

        if (!paymentConfirmed) {
          Alert.alert(
            "Payment pending",
            "We haven't confirmed your payment yet. If you completed the payment, it may take a moment to process. Check your bookings shortly.",
            [
              { text: "View bookings", onPress: () => router.replace("/(app)/(tabs)/bookings" as never) },
              { text: "OK", style: "cancel" },
            ],
          );
          return;
        }

        const amountPaid = paymentOption === "deposit" && hasDeposit ? depositAmount : total;
        trackBookingConfirmed(confirmedBookingId ?? hold_id, paymentMethod, total);
        trackPaymentSuccess(confirmedBookingId ?? hold_id, amountPaid);
        notifyRecurringSubscription();
        navigateToBooking(confirmedBookingId, routeRescheduleBookingId ?? undefined, confirmedBookingStatus);
      } else {
        if (selectedCardId && !useNewCard && savedCards.length > 0) refreshCards();
        trackBookingConfirmed(bookingId ?? hold_id, paymentMethod, total);
        trackPaymentSuccess(bookingId ?? hold_id, total);
        notifyRecurringSubscription();
        navigateToBooking(bookingId, routeRescheduleBookingId ?? undefined);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to complete"));
    } finally {
      setConsuming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pay helpers and navigateToBooking are stable refs
  }, [hold_id, hold, user, bookContinueReturnTo, paymentMethod, paymentOption, useWallet, selectedCardId, useNewCard, savedCards, saveCard, total, depositAmount, hasDeposit, currency, bookingCustomDefinitions, bookingCustomValues, providerForms, providerFormValues, specialRequests, houseCallInstructionsPrefill, promotionCode, tipAmount, routeRescheduleBookingId, giftCardCode, giftCardValid, selectedAddonIds, isGroupBooking, groupParticipants, selectedProducts, snapshotOfferingIds, selectedPackageId, paystackEnabled, walletEnabled, subscribeRecurring, recurringFrequency, loyaltyPointsApplied, cancellationPolicyAccepted, t]);

  /* ─── Loading skeleton ─── */
  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: contentPadding, paddingBottom: 12, flexDirection: "row", alignItems: "center" }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#F3F4F6", marginRight: 12 }} />
            <Skeleton width="40%" height={18} />
          </View>
          <View style={{ paddingHorizontal: contentPadding }}>
            <Skeleton width="100%" height={48} borderRadius={12} />
            <View style={{ flexDirection: "row", backgroundColor: "#F9FAFB", borderRadius: 16, padding: contentPadding, marginTop: 12 }}>
              <Skeleton width={48} height={48} borderRadius={24} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
              </View>
            </View>
            <Skeleton width="100%" height={80} borderRadius={16} style={{ marginTop: 12 }} />
            <Skeleton width="100%" height={60} borderRadius={16} style={{ marginTop: 12 }} />
            <Skeleton width="100%" height={60} borderRadius={16} style={{ marginTop: 12 }} />
            <Skeleton width="100%" height={56} borderRadius={14} style={{ marginTop: 12 }} />
          </View>
        </View>
      </>
    );
  }

  /* ─── Error (no hold) ─── */
  if (error && !hold) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff", padding: contentPadding, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Ionicons name="time-outline" size={32} color="#EF4444" />
          </View>
          <Text style={{ color: "#6B7280", textAlign: "center", fontSize: 15, lineHeight: 22, marginBottom: 20 }}>{error}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 }}
            accessibilityRole="button" accessibilityLabel={t("checkout.startOver")}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("checkout.startOver")}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!hold) return null;

  const cancellationPolicyAckRequired = cancellationPolicyRequiresCustomerAck(hold.cancellation_policy);
  const policyAckBlocksCheckout = cancellationPolicyAckRequired && !cancellationPolicyAccepted;

  /** Re-open book with the same services/staff/venue so editing date/time or services works (params-only navigation used to drop cart state). */
  const navigateToEditBooking = (step: "date" | "service") => {
    if (!provider_slug) {
      router.back();
      return;
    }
    const offeringIds = hold.booking_services_snapshot
      .map((s) => s.offering_id || (s as { id?: string }).id)
      .filter((id): id is string => Boolean(id))
      .join(",");
    router.replace({
      pathname: "/(app)/book",
      params: {
        slug: provider_slug,
        step,
        ...(offeringIds ? { service_ids: offeringIds } : {}),
        ...(hold.staff_id ? { staff_id: hold.staff_id } : {}),
        ...(hold.location_id ? { location_id: hold.location_id } : {}),
        ...(hold.location_type ? { location_type: hold.location_type } : {}),
        ...(selectedPackageId ? { package: selectedPackageId } : {}),
        ...(routeRescheduleBookingId ? { reschedule_booking_id: routeRescheduleBookingId } : {}),
        hold_id: hold_id,
      },
    });
  };

  const isExpired = isSlotExpired;
  const providerInitial = (hold.provider_name || "P").charAt(0).toUpperCase();
  const thumbnailUrl = hold.provider_thumbnail || hold.provider_avatar_url;
  const usingSavedCard = paymentMethod === "card" && !!selectedCardId && !useNewCard && savedCards.length > 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        {/* ═══ Custom Header ═══ */}
        <View style={{
          flexDirection: "row", alignItems: "center", paddingTop: insets.top + 8, paddingHorizontal: contentPadding, paddingBottom: 8,
          backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#F3F4F6",
        }}>
          <TouchableOpacity
            onPress={() => {
              Alert.alert(t("checkout.leaveCheckoutTitle"), t("checkout.leaveCheckoutMessage"), [
                { text: t("checkout.stay"), style: "cancel" },
                { text: t("checkout.leave"), style: "destructive", onPress: () => router.back() },
              ]);
            }}
            style={{
              width: 38, height: 38, borderRadius: 19, backgroundColor: "#F3F4F6",
              alignItems: "center", justifyContent: "center",
            }}
            accessibilityRole="button" accessibilityLabel={t("common.back")}
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: "#111827", marginLeft: 12 }}>{t("checkout.title")}</Text>
          <Ionicons name="lock-closed-outline" size={16} color="#9CA3AF" />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "padding"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 56 : 20}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: contentPadding, paddingBottom: 220, ...constraint }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            accessibilityLabel={t("checkout.summaryAccessibility")}
            accessibilityRole="none"
          >
            {/* Countdown */}
            {hold.expires_at && <CountdownBar expiresAt={hold.expires_at} t={t} />}

            {/* ═══ Provider Identity ═══ */}
            <View style={{
              flexDirection: "row", alignItems: "center",
              backgroundColor: "#F9FAFB", borderRadius: 16, padding: 14, marginBottom: 16,
            }}>
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                  <Text style={{ color: Colors.primary, fontWeight: "700", fontSize: 20 }}>{providerInitial}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>{hold.provider_name || t("checkout.provider")}</Text>
                {hold.staff_name && (
                  <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{t("checkout.withStaff", { name: hold.staff_name })}</Text>
                )}
              </View>
            </View>

            {/* ═══ Package Identity Banner (when booking via a package) ═══ */}
            {(() => {
              const activePkg = selectedPackageId
                ? packagesList.find((p) => p.id === selectedPackageId) ?? null
                : null;
              if (!activePkg) return null;
              return (
                <View style={{
                  flexDirection: "row", alignItems: "center",
                  backgroundColor: "#F0FDF4", borderRadius: 14,
                  borderWidth: 1.5, borderColor: "#BBF7D0",
                  padding: 14, marginBottom: 16,
                }}>
                  <View style={{
                    width: 38, height: 38, borderRadius: 19,
                    backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center", marginRight: 12,
                  }}>
                    <Ionicons name="gift" size={20} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#15803D", textTransform: "uppercase", letterSpacing: 0.7 }}>
                      Package
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827", marginTop: 2 }}>{activePkg.name}</Text>
                    {activePkg.description ? (
                      <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }} numberOfLines={2}>{activePkg.description}</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "800", color: Colors.primary }}>{formatCurrency(activePkg.price, activePkg.currency)}</Text>
                </View>
              );
            })()}

            {/* ═══ Appointment Details (with edit options) ═══ */}
            <View style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: contentPadding, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="calendar-outline" size={18} color="#6B7280" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{t("checkout.appointmentDetails")}</Text>
                </View>
                <EditChip label={t("checkout.dateAndTime")} onPress={() => navigateToEditBooking("date")} />
              </View>

              {/* Date & Time */}
              <View style={{ flexDirection: "row", marginBottom: 10 }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginBottom: 4 }}>{t("checkout.date")}</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{formatDateOnly(hold.start_at)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginBottom: 4 }}>{t("checkout.time")}</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{formatTimeOnly(hold.start_at)}</Text>
                </View>
              </View>

              {/* Location */}
              <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 10, borderTopWidth: 1, borderColor: "#E5E7EB" }}>
                <Ionicons
                  name={hold.location_type === "at_home" ? "home-outline" : "business-outline"}
                  size={14} color="#6B7280"
                  style={{ marginRight: 6 }}
                />
                <Text style={{ fontSize: 13, color: "#6B7280" }}>
                  {hold.location_type === "at_home" ? t("checkout.atYourLocation") : hold.location_name || t("checkout.atSalon")}
                </Text>
              </View>
            </View>

            {/* ═══ Services ═══ */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{t("checkout.services")}</Text>
                <EditChip label={t("checkout.service")} onPress={() => navigateToEditBooking("service")} />
              </View>
              {hold.booking_services_snapshot.map((svc, i) => {
                const serviceName = svc.service_name ?? svc.title ?? svc.name ?? routeServiceName ?? `Service ${i + 1}`;
                return (
                  <View key={i} style={{
                    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                    paddingVertical: 12, borderBottomWidth: 1, borderColor: "#F3F4F6",
                  }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "500", color: "#111827" }}>{serviceName}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                        <Ionicons name="time-outline" size={12} color="#9CA3AF" style={{ marginRight: 4 }} />
                        <Text style={{ fontSize: 12, color: "#6B7280" }}>{svc.duration_minutes} min</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827" }}>
                      {formatCurrency(svc.price, svc.currency)}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Add-ons */}
            {addonsList.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>{t("checkout.addonsOptional")}</Text>
                {addonsList.map((addon) => {
                  const label = addon.name ?? addon.title ?? "Add-on";
                  const price = Number(addon.price) || 0;
                  const addonCurrency = addon.currency ?? currency;
                  const selected = selectedAddonIds.includes(addon.id);
                  return (
                    <Pressable
                      key={addon.id}
                      onPress={() => {
                        haptic.selection();
                        setSelectedAddonIds((prev) =>
                          prev.includes(addon.id) ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                        );
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: selected ? "#7C3AED" : "#E5E7EB",
                        borderRadius: 12,
                        backgroundColor: selected ? "#F5F3FF" : "#F9FAFB",
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                        <View style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 2,
                          borderColor: selected ? "#7C3AED" : "#9CA3AF",
                          backgroundColor: selected ? "#7C3AED" : "transparent",
                          marginRight: 10,
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          {selected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                        </View>
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: "500", color: "#111827" }}>{label}</Text>
                          {addon.duration_minutes != null && addon.duration_minutes > 0 && (
                            <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>+{addon.duration_minutes} min</Text>
                          )}
                        </View>
                        {addon.is_recommended && (
                          <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 8 }}>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: "#92400E" }}>Recommended</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{formatCurrency(price, addonCurrency)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Group booking — only shown when provider enables online group booking */}
            {groupBookingEnabled && (
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Group booking</Text>
                <Pressable
                  onPress={() => { haptic.selection(); setIsGroupBooking((b) => !b); if (!isGroupBooking) setGroupParticipants([]); }}
                  style={{ flexDirection: "row", alignItems: "center" }}
                >
                  <View style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: isGroupBooking ? Colors.primary : "#D1D5DB", justifyContent: "center", paddingHorizontal: 2 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#FFF", alignSelf: isGroupBooking ? "flex-end" : "flex-start" }} />
                  </View>
                  <Text style={{ fontSize: 13, color: "#6B7280", marginLeft: 8 }}>{isGroupBooking ? "On" : "Off"}</Text>
                </Pressable>
              </View>
              {isGroupBooking && (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      haptic.selection();
                      setGroupParticipants((prev) => [
                        ...prev,
                        { id: `p-${Date.now()}`, name: "", phone: "", notes: "", service_ids: [...snapshotOfferingIds] },
                      ]);
                    }}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, marginBottom: 8 }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.primary }}>Add participant</Text>
                  </TouchableOpacity>
                  {groupParticipants.map((p) => {
                    const offeringId = (s: BookingServiceSnapshot) => s.offering_id ?? (s as { id?: string }).id;
                    const snapshotOfferings = (hold?.booking_services_snapshot ?? []).map((s) => ({
                      id: offeringId(s) as string,
                      label: (s.service_name ?? s.title ?? s.name ?? "Service").trim() || "Service",
                      price: s.price,
                      currency: s.currency || getTenantDefaultCurrency(),
                    })).filter((o) => o.id);
                    return (
                      <View key={p.id} style={{ backgroundColor: "#F9FAFB", borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#E5E7EB" }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <Text style={{ fontSize: 12, fontWeight: "600", color: "#6B7280" }}>Participant</Text>
                          <TouchableOpacity onPress={() => setGroupParticipants((prev) => prev.filter((x) => x.id !== p.id))}>
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          value={p.name}
                          onChangeText={(t) => setGroupParticipants((prev) => prev.map((x) => (x.id === p.id ? { ...x, name: t } : x)))}
                          placeholder="Name (required)"
                          style={{ backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#111827", marginBottom: 8 }}
                        />
                        <TextInput
                          value={p.phone ?? ""}
                          onChangeText={(t) => setGroupParticipants((prev) => prev.map((x) => (x.id === p.id ? { ...x, phone: t } : x)))}
                          placeholder="Phone (optional)"
                          keyboardType="phone-pad"
                          style={{ backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#111827", marginBottom: 8 }}
                        />
                        {snapshotOfferings.length > 0 && (
                          <View style={{ marginBottom: 8 }}>
                            <Text style={{ fontSize: 12, fontWeight: "600", color: "#6B7280", marginBottom: 6 }}>Services for this person</Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                              {snapshotOfferings.map((off) => {
                                const isSelected = p.service_ids.includes(off.id);
                                return (
                                  <Pressable
                                    key={off.id}
                                    onPress={() => {
                                      haptic.selection();
                                      setGroupParticipants((prev) => prev.map((x) => {
                                        if (x.id !== p.id) return x;
                                        const next = isSelected ? x.service_ids.filter((id) => id !== off.id) : [...x.service_ids, off.id];
                                        return { ...x, service_ids: next };
                                      }));
                                    }}
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      paddingVertical: 8,
                                      paddingHorizontal: 12,
                                      borderRadius: 10,
                                      borderWidth: 1.5,
                                      borderColor: isSelected ? Colors.primary : "#E5E7EB",
                                      backgroundColor: isSelected ? Colors.primaryLight : "#FFF",
                                      marginRight: 8,
                                      marginBottom: 8,
                                    }}
                                  >
                                    <Text style={{ fontSize: 13, fontWeight: "500", color: isSelected ? Colors.primary : "#374151", marginRight: 6 }} numberOfLines={1}>
                                      {off.label}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: "#6B7280" }}>{formatCurrency(off.price, off.currency)}</Text>
                                    {isSelected && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        )}
                        <TextInput
                          value={p.notes ?? ""}
                          onChangeText={(t) => setGroupParticipants((prev) => prev.map((x) => (x.id === p.id ? { ...x, notes: t } : x)))}
                          placeholder="Notes (optional)"
                          style={{ backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#111827" }}
                        />
                      </View>
                    );
                  })}
                </>
              )}
            </View>
            )}

            {/* Products (add to booking) */}
            {productsList.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>{t("checkout.productsOptional")}</Text>
                {productCategoryPills.length > 1 && (
                  <View style={{ marginBottom: 12 }}>
                    {showCheckoutCategoryFilter && (
                      <TextInput
                        value={checkoutProductCategoryFilter}
                        onChangeText={setCheckoutProductCategoryFilter}
                        placeholder={t("booking.filterCategoriesPlaceholder")}
                        placeholderTextColor="#9CA3AF"
                        style={{
                          backgroundColor: "#FFF",
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          fontSize: 14,
                          color: "#111827",
                          marginBottom: 10,
                        }}
                      />
                    )}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: "row", flexWrap: "nowrap", paddingVertical: 4 }}>
                      {displayedCheckoutCategoryPills.map((label) => {
                        const active = checkoutProductCategory === label;
                        return (
                          <TouchableOpacity
                            key={label}
                            onPress={() => {
                              haptic.selection();
                              setCheckoutProductCategory(label);
                              setCheckoutProductSearch("");
                            }}
                            style={{
                              paddingHorizontal: 16,
                              paddingVertical: 8,
                              borderRadius: 999,
                              marginRight: 8,
                              backgroundColor: active ? Colors.primary : "#FFF",
                              borderWidth: 1,
                              borderColor: active ? Colors.primary : "#E5E7EB",
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: "600", color: active ? "#FFF" : "#374151" }}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
                {showCheckoutProductSearch && (
                  <TextInput
                    value={checkoutProductSearch}
                    onChangeText={setCheckoutProductSearch}
                    placeholder={t("booking.searchProductsPlaceholder")}
                    placeholderTextColor="#9CA3AF"
                    style={{
                      backgroundColor: "#FFF",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: "#111827",
                      marginBottom: 12,
                    }}
                  />
                )}
                {filteredCheckoutProducts.length === 0 ? (
                  <Text style={{ fontSize: 13, color: "#6B7280", paddingVertical: 8 }}>{t("checkout.noMatchingProducts")}</Text>
                ) : (
                  <>
                    {visibleCheckoutProductRows.length < filteredCheckoutProducts.length && (
                      <Text style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>
                        {t("booking.servicesPaginationSummary", { shown: visibleCheckoutProductRows.length, total: filteredCheckoutProducts.length })}
                      </Text>
                    )}
                    {visibleCheckoutProductRows.map((prod) => {
                      const cur = selectedProducts.find((s) => s.productId === prod.id);
                      const qty = cur?.quantity ?? 0;
                      return (
                        <View key={prod.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#F9FAFB", borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: "#E5E7EB" }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            {prod.category?.trim() ? (
                              <Text style={{ fontSize: 10, fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }} numberOfLines={1}>
                                {prod.category.trim()}
                              </Text>
                            ) : null}
                            <Text style={{ fontSize: 14, fontWeight: "500", color: "#111827" }}>{prod.name}</Text>
                            <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{formatCurrency(prod.retail_price, prod.currency)}</Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <TouchableOpacity
                              onPress={() => {
                                haptic.selection();
                                if (qty <= 0) return;
                                if (qty === 1) setSelectedProducts((prev) => prev.filter((s) => s.productId !== prod.id));
                                else setSelectedProducts((prev) => prev.map((s) => (s.productId === prod.id ? { ...s, quantity: s.quantity - 1 } : s)));
                              }}
                              style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center" }}
                            >
                              <Ionicons name="remove" size={18} color="#374151" />
                            </TouchableOpacity>
                            <Text style={{ minWidth: 28, textAlign: "center", fontSize: 14, fontWeight: "600", color: "#111827" }}>{qty}</Text>
                            <TouchableOpacity
                              onPress={() => {
                                haptic.selection();
                                if (qty === 0) setSelectedProducts((prev) => [...prev, { productId: prod.id, productVariantId: prod.defaultVariantId ?? null, name: prod.name, price: prod.retail_price, quantity: 1, currency: prod.currency }]);
                                else setSelectedProducts((prev) => prev.map((s) => (s.productId === prod.id ? { ...s, quantity: s.quantity + 1 } : s)));
                              }}
                              style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center" }}
                            >
                              <Ionicons name="add" size={18} color={Colors.primary} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    {checkoutVisibleProducts < filteredCheckoutProducts.length && (
                      <TouchableOpacity
                        onPress={() => {
                          haptic.selection();
                          setCheckoutVisibleProducts((c) => Math.min(c + CHECKOUT_PRODUCT_PAGE, filteredCheckoutProducts.length));
                        }}
                        style={{
                          marginTop: 4,
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          backgroundColor: "#FFF",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{t("booking.loadMoreProducts")}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Package selector — preselected when arriving from a package, optional otherwise */}
            {packagesList.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>
                  {selectedPackageId ? "Package applied" : "Apply a package (optional)"}
                </Text>
                {showCheckoutPackageSearch && (
                  <TextInput
                    value={checkoutPackageSearch}
                    onChangeText={setCheckoutPackageSearch}
                    placeholder={t("booking.searchPackagesPlaceholder")}
                    placeholderTextColor="#9CA3AF"
                    style={{
                      backgroundColor: "#FFF",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: "#111827",
                      marginBottom: 12,
                    }}
                  />
                )}
                {filteredCheckoutPackages.length === 0 ? (
                  <Text style={{ fontSize: 13, color: "#6B7280", paddingVertical: 8 }}>{t("checkout.noMatchingPackages")}</Text>
                ) : (
                  <>
                    {visibleCheckoutPackages.length < filteredCheckoutPackages.length && (
                      <Text style={{ fontSize: 11, color: "#6B7280", marginBottom: 8 }}>
                        {t("booking.servicesPaginationSummary", { shown: visibleCheckoutPackages.length, total: filteredCheckoutPackages.length })}
                      </Text>
                    )}
                    {visibleCheckoutPackages.map((pkg) => {
                      const selected = selectedPackageId === pkg.id;
                      return (
                        <Pressable
                          key={pkg.id}
                          onPress={() => { haptic.selection(); setSelectedPackageId(selected ? null : pkg.id); }}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 12,
                            paddingHorizontal: 12,
                            borderWidth: 1,
                            borderColor: selected ? "#7C3AED" : "#E5E7EB",
                            borderRadius: 12,
                            backgroundColor: selected ? "#F5F3FF" : "#F9FAFB",
                            marginBottom: 8,
                          }}
                        >
                          <View style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: selected ? "#7C3AED" : "#9CA3AF",
                            backgroundColor: selected ? "#7C3AED" : "transparent",
                            marginRight: 10,
                            alignItems: "center",
                            justifyContent: "center",
                          }}>
                            {selected && <Ionicons name="checkmark" size={14} color="#FFF" />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "500", color: "#111827" }}>{pkg.name}</Text>
                            {pkg.description ? <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }} numberOfLines={2}>{pkg.description}</Text> : null}
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{formatCurrency(pkg.price, pkg.currency)}</Text>
                        </Pressable>
                      );
                    })}
                    {checkoutVisiblePackages < filteredCheckoutPackages.length && (
                      <TouchableOpacity
                        onPress={() => {
                          haptic.selection();
                          setCheckoutVisiblePackages((c) => Math.min(c + CHECKOUT_PACKAGE_PAGE, filteredCheckoutPackages.length));
                        }}
                        style={{
                          marginTop: 4,
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          backgroundColor: "#FFF",
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.primary }}>{t("booking.loadMorePackages")}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Travel Fee */}
            {hold.location_type === "at_home" && travelFee > 0 && (
              <View style={{
                flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12, marginBottom: 16,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Ionicons name="car-outline" size={16} color="#92400E" style={{ marginRight: 8 }} />
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#92400E" }}>{t("checkout.travelFee")}</Text>
                    {hold.travel_distance_km != null && (
                      <Text style={{ fontSize: 11, color: "#B45309" }}>~{hold.travel_distance_km.toFixed(1)} km</Text>
                    )}
                  </View>
                </View>
                <Text style={{ fontWeight: "600", color: "#92400E" }}>{formatCurrency(travelFee, currency)}</Text>
              </View>
            )}

            {/* ═══ Total ═══ */}
            <View style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: contentPadding, marginBottom: 16 }}>
              {(travelFee > 0 || addonsSubtotal > 0 || productsSubtotal > 0 || appliedPromoDiscount > 0 || loyaltyDiscountAmount > 0 || membershipDiscountAmount > 0 || tipAmount > 0 || taxAmount > 0 || serviceFeeAmount > 0) && (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: "#6B7280" }}>{t("checkout.services")}</Text>
                    <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(subtotal, currency)}</Text>
                  </View>
                  {addonsSubtotal > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>{t("checkout.addons")}</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(addonsSubtotal, currency)}</Text>
                    </View>
                  )}
                  {productsSubtotal > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>{t("checkout.products")}</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(productsSubtotal, currency)}</Text>
                    </View>
                  )}
                  {travelFee > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
<Text style={{ fontSize: 13, color: "#6B7280" }}>{t("checkout.travel")}</Text>
                    <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(travelFee, currency)}</Text>
                    </View>
                  )}
                  {effectivePromoDiscount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#059669" }}>{t("checkout.promo")}</Text>
                      <Text style={{ fontSize: 13, color: "#059669" }}>-{formatCurrency(effectivePromoDiscount, currency)}</Text>
                    </View>
                  )}
                  {membershipDiscountAmount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#059669" }}>
                        {membershipPlanName ? `${membershipPlanName} (${membershipDiscountPercent}%)` : `Member discount (${membershipDiscountPercent}%)`}
                      </Text>
                      <Text style={{ fontSize: 13, color: "#059669" }}>-{formatCurrency(membershipDiscountAmount, currency)}</Text>
                    </View>
                  )}
                  {loyaltyDiscountAmount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#059669" }}>Loyalty</Text>
                      <Text style={{ fontSize: 13, color: "#059669" }}>-{formatCurrency(loyaltyDiscountAmount, currency)}</Text>
                    </View>
                  )}
                  {taxAmount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>
                        Tax{taxRatePercent > 0 ? ` (${taxRatePercent}%)` : ""}{isTaxInclusive ? " (incl.)" : ""}
                      </Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>
                        {isTaxInclusive ? "" : "+"}{formatCurrency(taxAmount, currency)}
                      </Text>
                    </View>
                  )}
                  {serviceFeeAmount > 0 && sfConfig?.show && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>Platform Fee</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>+{formatCurrency(serviceFeeAmount, currency)}</Text>
                    </View>
                  )}
                  {tipAmount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderColor: "#E5E7EB" }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>{t("checkout.tip")}</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>+{formatCurrency(tipAmount, currency)}</Text>
                    </View>
                  )}
                </>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>{t("checkout.total")}</Text>
                <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827" }}>{formatCurrency(total, currency)}</Text>
              </View>

              {/* Wallet credit breakdown — shown when wallet covers part/all of total */}
              {(paymentMethod === "card" && useWallet && walletBalance > 0) && (() => {
                const chargeableAmount = (paymentOption === "deposit" && hasDeposit) ? depositAmount : total;
                const walletApplied = Math.min(walletBalance, chargeableAmount);
                const paystackRemainder = Math.max(0, chargeableAmount - walletApplied);
                return (
                  <>
                    <View style={{ height: 1, backgroundColor: "#E5E7EB", marginVertical: 10, borderStyle: "dashed" }} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#059669" }}>Wallet credit applied</Text>
                      <Text style={{ fontSize: 13, color: "#059669", fontWeight: "600" }}>-{formatCurrency(walletApplied, currency)}</Text>
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#111827" }}>
                        {paystackRemainder <= 0 ? "Covered by wallet" : "You pay via card"}
                      </Text>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827" }}>
                        {formatCurrency(paystackRemainder, currency)}
                      </Text>
                    </View>
                    {paystackRemainder <= 0 && (
                      <Text style={{ fontSize: 11, color: "#059669", marginTop: 4, textAlign: "center" }}>
                        Your wallet fully covers this booking — no card charge needed
                      </Text>
                    )}
                  </>
                );
              })()}
            </View>

            {/* ═══ Tip (optional) ═══ */}
            {hold?.tips_enabled && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>{t("checkout.addTipOptional")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {([0, ...(hold.tip_presets ?? [10, 15, 20, 25])].map((preset) => {
                    const isCustomActive = tipCustomInput.trim().length > 0 && !hold.tip_presets?.concat([0]).includes(tipAmount) && tipAmount > 0;
                    const isPresetActive = !isCustomActive && tipAmount === preset;
                    return (
                      <TouchableOpacity
                        key={preset}
                        onPress={() => {
                          haptic.light();
                          setTipAmount(preset);
                          setTipCustomInput("");
                        }}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: isPresetActive ? Colors.primary : "#E5E7EB",
                          backgroundColor: isPresetActive ? Colors.primaryLight : "#F9FAFB",
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: "600", color: isPresetActive ? Colors.primary : "#374151" }}>
                          {preset === 0 ? t("checkout.noTip") : formatCurrency(preset, currency)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontSize: 13, color: "#6B7280", minWidth: 54 }}>Custom</Text>
                  <TextInput
                    value={tipCustomInput}
                    onChangeText={(v) => {
                      setTipCustomInput(v);
                      const parsed = parseFloat(v);
                      setTipAmount(Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    returnKeyType="done"
                    style={{
                      flex: 1,
                      backgroundColor: "#F9FAFB",
                      borderWidth: 1.5,
                      borderColor: tipCustomInput.trim() ? Colors.primary : "#E5E7EB",
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      fontSize: 15,
                      color: "#111827",
                    }}
                    placeholderTextColor="#9CA3AF"
                    accessibilityLabel="Custom tip amount"
                  />
                </View>
              </View>
            )}

            {/* ═══ Special requests & promo code ═══ */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>{t("checkout.specialRequestsOptional")}</Text>
              <TextInput
                value={specialRequests}
                onChangeText={setSpecialRequests}
                placeholder={t("checkout.specialRequestsPlaceholder")}
                multiline
                numberOfLines={2}
                style={{
                  backgroundColor: "#F9FAFB",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#111827",
                  minHeight: 72,
                  textAlignVertical: "top",
                }}
                placeholderTextColor="#9CA3AF"
              />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginTop: 12, marginBottom: 10 }}>{t("checkout.promoCodeOptional")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={promotionCode}
                  onChangeText={(t) => {
                    setPromotionCode(t.trim().toUpperCase());
                    setAppliedPromoDiscount(0);
                    setPromoError(null);
                  }}
                  placeholder={t("checkout.enterCode")}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={{
                    flex: 1,
                    backgroundColor: "#F9FAFB",
                    borderWidth: 1,
                    borderColor: promoError ? "#DC2626" : "#E5E7EB",
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: "#111827",
                  }}
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity
                  onPress={applyPromoCode}
                  disabled={!promotionCode.trim() || promoValidating}
                  style={{
                    backgroundColor: promotionCode.trim() && !promoValidating ? Colors.primary : "#E5E7EB",
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderRadius: 12,
                    justifyContent: "center",
                  }}
                >
                  {promoValidating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{t("checkout.apply")}</Text>
                  )}
                </TouchableOpacity>
              </View>
              {promoError ? (
                <Text style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{promoError}</Text>
              ) : effectivePromoDiscount > 0 ? (
                <Text style={{ fontSize: 12, color: "#059669", marginTop: 6 }}>
                  Promo applied — {formatCurrency(effectivePromoDiscount, currency)} off
                </Text>
              ) : null}
              {user ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 8 }}>Loyalty points</Text>
                  <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>
                    Balance {loyaltyBalance.toLocaleString()} pts
                    {maxRedeemablePointsOnBooking > 0
                      ? ` · Up to ${maxRedeemablePointsOnBooking.toLocaleString()} pts on this booking (after % cap)`
                      : ""}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={loyaltyPointsInput}
                      onChangeText={(v) => {
                        setLoyaltyPointsInput(v.replace(/[^\d]/g, ""));
                        setLoyaltyError(null);
                      }}
                      placeholder="Points to use"
                      keyboardType="number-pad"
                      editable={loyaltyBalance > 0 && bookingSubtotalForLoyalty > 0}
                      style={{
                        flex: 1,
                        backgroundColor: "#F9FAFB",
                        borderWidth: 1,
                        borderColor: loyaltyError ? "#DC2626" : "#E5E7EB",
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 15,
                        color: "#111827",
                      }}
                      placeholderTextColor="#9CA3AF"
                    />
                    <TouchableOpacity
                      onPress={() => {
                        if (loyaltyDiscountAmount > 0) {
                          setLoyaltyPointsApplied(0);
                          setLoyaltyDiscountAmount(0);
                          setLoyaltyPointsInput("");
                          setLoyaltyError(null);
                          haptic.light();
                        } else {
                          void applyLoyaltyPoints();
                        }
                      }}
                      disabled={
                        loyaltyValidating ||
                        (loyaltyDiscountAmount <= 0 && (loyaltyBalance <= 0 || !loyaltyPointsInput.trim()))
                      }
                      style={{
                        backgroundColor:
                          loyaltyPointsInput.trim() || loyaltyDiscountAmount > 0 ? Colors.primary : "#E5E7EB",
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 12,
                        justifyContent: "center",
                        minWidth: 72,
                        alignItems: "center",
                      }}
                    >
                      {loyaltyValidating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                          {loyaltyDiscountAmount > 0 ? "Clear" : "Use"}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {loyaltyError ? (
                    <Text style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{loyaltyError}</Text>
                  ) : loyaltyDiscountAmount > 0 ? (
                    <Text style={{ fontSize: 12, color: "#059669", marginTop: 6 }}>
                      −{formatCurrency(loyaltyDiscountAmount, currency)} applied ({loyaltyPointsApplied.toLocaleString()} pts)
                    </Text>
                  ) : loyaltyBalance <= 0 ? (
                    <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                      You&apos;ll earn points after this booking — use them for money off next time.
                    </Text>
                  ) : minRedemptionPoints > 0 ? (
                    <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                      Min. {minRedemptionPoints} pts per redemption when eligible
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* ═══ Additional details (platform custom fields) ═══ */}
            {bookingCustomDefinitions.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Additional details</Text>
                <View style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: 14 }}>
                  {bookingCustomDefinitions.map((field, fi) => (
                    <View key={field.id} style={{ marginTop: fi === 0 ? 0 : 12 }}>
                      <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                        {field.label}{field.is_required ? " *" : ""}
                      </Text>
                      <TextInput
                        value={String(bookingCustomValues[field.name] ?? "")}
                        onChangeText={(v) => setBookingCustomValues((prev) => ({ ...prev, [field.name]: v }))}
                        placeholder={field.placeholder ?? undefined}
                        style={{
                          backgroundColor: "#fff",
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          fontSize: 15,
                          color: "#111827",
                        }}
                      />
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ═══ Provider forms ═══ */}
            {providerForms.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Provider forms</Text>
                {providerForms.map((form) => (
                  <View key={form.id} style={{ marginBottom: 12, backgroundColor: "#F9FAFB", borderRadius: 16, padding: 14 }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                      {form.title}{form.is_required ? " *" : ""}
                    </Text>
                    {(form.fields || []).map((field) => (
                      <View key={field.id} style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                          {field.name}{field.is_required ? " *" : ""}
                        </Text>
                        {field.field_type === "checkbox" ? (
                          <Pressable
                            onPress={() => {
                              const cur = Boolean(providerFormValues[form.id]?.[field.id]);
                              setProviderFormValues((prev) => ({
                                ...prev,
                                [form.id]: { ...(prev[form.id] ?? {}), [field.id]: !cur },
                              }));
                            }}
                            style={{ flexDirection: "row", alignItems: "center" }}
                          >
                            <View style={{
                              width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                              borderColor: providerFormValues[form.id]?.[field.id] ? Colors.primary : "#9CA3AF",
                              backgroundColor: providerFormValues[form.id]?.[field.id] ? Colors.primary : "transparent",
                              alignItems: "center", justifyContent: "center", marginRight: 8,
                            }}>
                              {providerFormValues[form.id]?.[field.id] && <Ionicons name="checkmark" size={14} color="#fff" />}
                            </View>
                            <Text style={{ fontSize: 14, color: "#374151" }}>Yes</Text>
                          </Pressable>
                        ) : (
                          <TextInput
                            value={String(providerFormValues[form.id]?.[field.id] ?? "")}
                            onChangeText={(v) => setProviderFormValues((prev) => ({
                              ...prev,
                              [form.id]: { ...(prev[form.id] ?? {}), [field.id]: v },
                            }))}
                            placeholder={field.field_type === "signature" ? "Type your name to sign" : undefined}
                            style={{
                              backgroundColor: "#fff",
                              borderWidth: 1,
                              borderColor: "#E5E7EB",
                              borderRadius: 12,
                              paddingHorizontal: 14,
                              paddingVertical: 12,
                              fontSize: 15,
                              color: "#111827",
                            }}
                          />
                        )}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}

            {/* ═══ Repeat booking (signed-in, not reschedule / group) ═══ */}
            {user && !routeRescheduleBookingId && !isGroupBooking && (
              <View
                style={{
                  marginBottom: 16,
                  padding: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#BFDBFE",
                  backgroundColor: "#EFF6FF",
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 6 }}>Repeat this booking</Text>
                <Text style={{ fontSize: 12, color: "#4B5563", lineHeight: 17, marginBottom: 10 }}>
                  When enabled, your repeat schedule is saved as soon as the booking is created. You pay per visit. External card payment still saves the schedule—manage it under Account settings.
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", flex: 1, marginRight: 12 }}>Turn on repeating visits</Text>
                  <Switch
                    value={subscribeRecurring}
                    onValueChange={setSubscribeRecurring}
                    trackColor={{ false: "#E5E7EB", true: "#93C5FD" }}
                    thumbColor={subscribeRecurring ? Colors.primary : "#f4f4f5"}
                  />
                </View>
                {subscribeRecurring && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                    {(["weekly", "biweekly", "monthly"] as const).map((f) => (
                      <Pressable
                        key={f}
                        onPress={() => {
                          haptic.light();
                          setRecurringFrequency(f);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: recurringFrequency === f ? Colors.primary : "#D1D5DB",
                          backgroundColor: recurringFrequency === f ? Colors.primaryLight : "#fff",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: recurringFrequency === f ? Colors.primary : "#374151",
                          }}
                        >
                          {f === "weekly" ? "Weekly" : f === "biweekly" ? "Every 2 wks" : "Monthly"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* ═══ Payment Option (deposit vs full) ═══ */}
            {hasDeposit && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>{t("checkout.paymentOption")}</Text>
                <View style={{ flexDirection: "row" }}>
                  <Pressable
                    onPress={() => { haptic.light(); setPaymentOption("full"); }}
                    style={{
                      flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: "center", marginRight: 10,
                      borderColor: paymentOption === "full" ? Colors.primary : "#E5E7EB",
                      backgroundColor: paymentOption === "full" ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="radio" accessibilityState={{ selected: paymentOption === "full" }}
                  >
                    {paymentOption === "full" && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={{ marginBottom: 4 }} />
                    )}
                    <Text style={{ fontWeight: "600", color: paymentOption === "full" ? Colors.primary : "#374151", fontSize: 14 }}>
                      {t("checkout.payFullAmount")}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{formatCurrency(total, currency)}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => { haptic.light(); setPaymentOption("deposit"); }}
                    style={{
                      flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: "center",
                      borderColor: paymentOption === "deposit" ? Colors.primary : "#E5E7EB",
                      backgroundColor: paymentOption === "deposit" ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="radio" accessibilityState={{ selected: paymentOption === "deposit" }}
                  >
                    {paymentOption === "deposit" && (
                      <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={{ marginBottom: 4 }} />
                    )}
                    <Text style={{ fontWeight: "600", color: paymentOption === "deposit" ? Colors.primary : "#374151", fontSize: 14 }}>
                      {t("checkout.depositOnly")}
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{formatCurrency(depositAmount, currency)}</Text>
                  </Pressable>
                </View>
                {paymentOption === "deposit" && (
                  <Text style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>
                    {t("checkout.remainingDueAtAppointment", { amount: formatCurrency(total - depositAmount, currency) })}
                  </Text>
                )}
              </View>
            )}

            {/* ═══ Payment Method ═══ */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>{t("checkout.paymentMethod")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 8 }}>
                {paystackEnabled && (
                  <Pressable
                    onPress={() => { haptic.light(); setPaymentMethod("card"); setUseWallet(false); }}
                    style={{
                      flex: 1, minWidth: 90, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
                      borderColor: paymentMethod === "card" ? Colors.primary : "#E5E7EB",
                      backgroundColor: paymentMethod === "card" ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === "card" }}
                  >
                    <Ionicons name="card-outline" size={18} color={paymentMethod === "card" ? Colors.primary : "#6B7280"} style={{ marginRight: 6 }} />
                    <Text style={{ fontWeight: "600", color: paymentMethod === "card" ? Colors.primary : "#374151", fontSize: 14 }}>{t("checkout.card")}</Text>
                    {paymentMethod === "card" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                  </Pressable>
                )}
                {user && walletBalance > 0 && walletEnabled && (
                  <Pressable
                    onPress={() => { haptic.light(); setPaymentMethod("wallet"); }}
                    style={{
                      flex: 1, minWidth: 90, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
                      borderColor: paymentMethod === "wallet" ? Colors.primary : "#E5E7EB",
                      backgroundColor: paymentMethod === "wallet" ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === "wallet" }}
                  >
                    <Ionicons name="wallet-outline" size={18} color={paymentMethod === "wallet" ? Colors.primary : "#6B7280"} style={{ marginRight: 6 }} />
                    <Text style={{ fontWeight: "600", color: paymentMethod === "wallet" ? Colors.primary : "#374151", fontSize: 14 }}>{t("checkout.wallet")}</Text>
                    {paymentMethod === "wallet" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                  </Pressable>
                )}
                {cashEnabled && (
                  <Pressable
                    onPress={() => { haptic.light(); setPaymentMethod("cash"); }}
                    style={{
                      flex: 1, minWidth: 90, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
                      borderColor: paymentMethod === "cash" ? Colors.primary : "#E5E7EB",
                      backgroundColor: paymentMethod === "cash" ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === "cash" }}
                  >
                    <Ionicons name="cash-outline" size={18} color={paymentMethod === "cash" ? Colors.primary : "#6B7280"} />
                    <Text style={{ fontWeight: "600", color: paymentMethod === "cash" ? Colors.primary : "#374151", fontSize: 14 }}>{t("checkout.cash")}</Text>
                    {paymentMethod === "cash" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                  </Pressable>
                )}
                {giftCardsEnabled && (
                  <Pressable
                    onPress={() => { haptic.light(); setPaymentMethod("giftcard"); setGiftCardError(null); }}
                    style={{
                      flex: 1, minWidth: 90, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
                      borderColor: paymentMethod === "giftcard" ? Colors.primary : "#E5E7EB",
                      backgroundColor: paymentMethod === "giftcard" ? Colors.primaryLight : "#fff",
                    }}
                    accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === "giftcard" }}
                  >
                    <Ionicons name="gift-outline" size={18} color={paymentMethod === "giftcard" ? Colors.primary : "#6B7280"} style={{ marginRight: 6 }} />
                    <Text style={{ fontWeight: "600", color: paymentMethod === "giftcard" ? Colors.primary : "#374151", fontSize: 14 }}>{t("checkout.giftCard")}</Text>
                    {paymentMethod === "giftcard" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                  </Pressable>
                )}
              </View>

              {/* Gift card code (when gift card selected) */}
              {paymentMethod === "giftcard" && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: "#374151", marginBottom: 8 }}>{t("checkout.giftCardCode")}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={giftCardCode}
                      onChangeText={(t) => {
                        setGiftCardCode(t.trim().toUpperCase());
                        setGiftCardValid(null);
                        setGiftCardError(null);
                      }}
                      placeholder={t("checkout.enterCode")}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={{
                        flex: 1,
                        backgroundColor: "#F9FAFB",
                        borderWidth: 1,
                        borderColor: giftCardError ? "#DC2626" : "#E5E7EB",
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 15,
                        color: "#111827",
                      }}
                      placeholderTextColor="#9CA3AF"
                    />
                    <TouchableOpacity
                      onPress={applyGiftCard}
                      disabled={!giftCardCode.trim() || giftCardValidating}
                      style={{
                        backgroundColor: giftCardCode.trim() && !giftCardValidating ? Colors.primary : "#E5E7EB",
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 12,
                        justifyContent: "center",
                      }}
                    >
                      {giftCardValidating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>{t("checkout.apply")}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {giftCardError ? (
                    <Text style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{giftCardError}</Text>
                  ) : giftCardValid ? (
                    <Text style={{ fontSize: 12, color: "#059669", marginTop: 6 }}>
                      {t("checkout.giftCardApplied", { currency: giftCardValid.currency, amount: giftCardValid.balance.toFixed(2) })}
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Use wallet balance (when card selected and user has balance; wallet is not the primary method) */}
              {paymentMethod === "card" && user && walletBalance > 0 && walletEnabled && (
                <Pressable
                  onPress={() => { haptic.light(); setUseWallet(!useWallet); }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    marginBottom: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: useWallet ? Colors.primary : "#E5E7EB",
                    backgroundColor: useWallet ? Colors.primaryLight : "#F9FAFB",
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: useWallet }}
                >
                  <View style={{
                    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                    borderColor: useWallet ? Colors.primary : "#9CA3AF",
                    backgroundColor: useWallet ? Colors.primary : "transparent",
                    alignItems: "center", justifyContent: "center", marginRight: 10,
                  }}>
                    {useWallet && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Ionicons name="wallet-outline" size={18} color={useWallet ? Colors.primary : "#6B7280"} style={{ marginRight: 10 }} />
                  <Text style={{ flex: 1, fontWeight: "500", color: useWallet ? Colors.primary : "#374151", fontSize: 14 }}>
                    {t("checkout.useWalletBalance", { amount: formatCurrency(walletBalance, currency) })}
                  </Text>
                </Pressable>
              )}

              {/* Saved Cards Section (only when card payment selected, not wallet) */}
              {paymentMethod === "card" && (
                <View>
                  {cardsLoading ? (
                    <View style={{ marginBottom: 12 }}>
                      <Skeleton width="100%" height={56} borderRadius={14} />
                      <Skeleton width="100%" height={56} borderRadius={14} style={{ marginTop: 8 }} />
                    </View>
                  ) : savedCards.length > 0 && !useNewCard ? (
                    <SavedCardSelector
                      cards={savedCards}
                      selected={selectedCardId}
                      onSelect={(id) => { setSelectedCardId(id); setUseNewCard(false); }}
                      onAddNew={() => { setUseNewCard(true); setSelectedCardId(null); }}
                      onSetDefault={async (id) => {
                        try {
                          const res = await api.patch<{ data: unknown }>(`/api/me/payment-methods/${id}`, { is_default: true });
                          if (res?.data != null) refreshCards();
                        } catch {
                          Alert.alert(t("common.error"), t("checkout.couldNotSetDefaultCard"));
                        }
                      }}
                    />
                  ) : null}

                  {/* Show "Use saved card" link when using new card and cards exist */}
                  {useNewCard && savedCards.length > 0 && (
                    <Pressable
                      onPress={() => { setUseNewCard(false); if (defaultCard) setSelectedCardId(defaultCard.id); }}
                      style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, paddingVertical: 4 }}
                    >
                      <Ionicons name="arrow-back-outline" size={14} color={Colors.primary} style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>{t("checkout.useSavedCard")}</Text>
                    </Pressable>
                  )}

                  {/* Save card toggle (only for new card flow) */}
                  {(savedCards.length === 0 || useNewCard) && (
                    <SaveCardToggle enabled={saveCard} onToggle={() => setSaveCard(!saveCard)} />
                  )}
                </View>
              )}
            </View>

            {/* ═══ Cancellation Policy ═══ */}
            <CancellationPolicy policy={hold.cancellation_policy} currency={currency} contentPadding={contentPadding} t={t} />
            {cancellationPolicyAckRequired ? (
              <Pressable
                onPress={() => { haptic.light(); setCancellationPolicyAccepted((v) => !v); }}
                style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12 }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: cancellationPolicyAccepted }}
                accessibilityLabel={t("checkout.acceptCancellationPolicy")}
              >
                <View style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: cancellationPolicyAccepted ? Colors.primary : "#D1D5DB",
                  backgroundColor: cancellationPolicyAccepted ? Colors.primary : "#fff",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 10,
                  marginTop: 2,
                }}>
                  {cancellationPolicyAccepted ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: "#374151", lineHeight: 20 }}>
                  {t("checkout.acceptCancellationPolicy")}
                </Text>
              </Pressable>
            ) : null}
            {APP_URL?.trim() ? (
              <Text style={{ fontSize: 12, color: "#6B7280", marginBottom: 16, lineHeight: 18 }}>
                <Text>{t("checkout.platformTermsLead")}</Text>
                <Text
                  style={{ color: Colors.primary, fontWeight: "600" }}
                  onPress={() => {
                    Linking.openURL(`${APP_URL.replace(/\/$/, "")}/terms-and-condition`).catch(() => {});
                  }}
                >
                  {t("checkout.platformTermsLink")}
                </Text>
                <Text>{t("checkout.platformTermsTrail")}</Text>
              </Text>
            ) : null}

            {/* Error banner */}
            {error && (() => {
              const isSlotError = /expired|no longer available|not available|unavailable/i.test(error);
              return (
                <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <Text style={{ color: "#B91C1C", fontSize: 13 }}>{error}</Text>
                  {isSlotError && (
                    <TouchableOpacity
                      onPress={() => router.back()}
                      style={{ marginTop: 8, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: "#B91C1C" }}
                      accessibilityRole="button"
                      accessibilityLabel={t("checkout.selectNewTime")}
                    >
                      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{t("checkout.selectNewTime")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}
          </ScrollView>

          {/* ═══ Sticky Bottom CTA ═══ */}
          <View style={{
            paddingHorizontal: contentPadding,
            paddingTop: 12,
            paddingBottom: 12 + Math.max(insets.bottom, 8),
            borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
          }}>
            {/* Price summary */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ fontSize: 13, color: "#6B7280" }}>
                {paymentOption === "deposit" && hasDeposit ? t("checkout.depositNow") : t("checkout.total")}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>
                {formatCurrency(paymentOption === "deposit" && hasDeposit ? depositAmount : total, currency)}
              </Text>
            </View>
            {onDemandEnabled && user && hold?.provider_on_demand_accept_enabled && (
              <TouchableOpacity
                onPress={() => { haptic.medium(); handleRequestNow(); }}
                disabled={requestingNow || isExpired || policyAckBlocksCheckout}
                style={{
                  backgroundColor: isExpired ? "#D1D5DB" : "#F3F4F6",
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "center",
                  marginBottom: 10,
                  borderWidth: 1.5,
                  borderColor: "#E5E7EB",
                  opacity: (requestingNow || isExpired || policyAckBlocksCheckout) ? 0.7 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel={t("checkout.requestNowAccessibility")}
              >
                {requestingNow ? (
                  <ActivityIndicator size="small" color="#6B7280" />
                ) : (
                  <Ionicons name="flash-outline" size={20} color="#374151" style={{ marginRight: 8 }} />
                )}
                <Text style={{ color: "#374151", fontWeight: "600", fontSize: 15 }}>
                  {requestingNow ? t("checkout.submitting") : t("checkout.requestNow")}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { haptic.medium(); handleComplete(); }}
              disabled={consuming || isExpired || policyAckBlocksCheckout}
              style={{
                backgroundColor: isExpired ? "#D1D5DB" : Colors.primary,
                borderRadius: 14, paddingVertical: 16,
                alignItems: "center", flexDirection: "row", justifyContent: "center",
                opacity: consuming || policyAckBlocksCheckout ? 0.7 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={user ? t("checkout.completeBooking") : t("checkout.signInToComplete")}
              accessibilityHint={user ? "Double tap to confirm and pay for your appointment" : "Double tap to sign in first"}
              accessibilityState={{ disabled: consuming || isExpired || policyAckBlocksCheckout }}
            >
              {consuming ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16, marginLeft: 8 }}>
                    {t("checkout.processing")}
                  </Text>
                </View>
              ) : (
                <>
                  <Ionicons name={isExpired ? "time-outline" : usingSavedCard ? "card" : "shield-checkmark"} size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                    {isExpired
                      ? t("checkout.slotExpired")
                      : user
                        ? usingSavedCard
                          ? t("checkout.payWithCard", { last4: savedCards.find(c => c.id === selectedCardId)?.last4 || "card" })
                          : t("checkout.completeBooking")
                        : t("checkout.signInToComplete")}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* ── BOOKING CONFIRMED SUCCESS OVERLAY ── */}
      {bookingConfirmedData && (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            zIndex: 999,
          }}
          pointerEvents="box-only"
        >
          <View style={{
            width: "100%", maxWidth: 380,
            backgroundColor: "#fff",
            borderRadius: 28,
            padding: 32,
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.25,
            shadowRadius: 40,
            elevation: 20,
          }}>
            {/* Animated icon — green for confirmed, amber for pending provider approval / payment */}
            {(() => {
              const isPending = bookingConfirmedData.bookingStatus === "pending";
              const isPendingPayment = bookingConfirmedData.bookingStatus === "pending_payment";
              const isWaiting = isPending || isPendingPayment;
              const iconName = isWaiting ? "time-outline" : "checkmark-circle";
              const iconColor = isWaiting ? "#F59E0B" : Colors.primary;
              const bgColor = isWaiting ? "#FEF3C7" : `${Colors.primary}12`;
              const borderColor = isWaiting ? "#FCD34D" : `${Colors.primary}30`;
              return (
                <View style={{
                  width: 88, height: 88, borderRadius: 44,
                  backgroundColor: bgColor,
                  borderWidth: 2, borderColor,
                  alignItems: "center", justifyContent: "center",
                  marginBottom: 20,
                }}>
                  <Ionicons name={iconName as any} size={52} color={iconColor} />
                </View>
              );
            })()}

            <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827", textAlign: "center", marginBottom: 6 }}>
              {bookingConfirmedData.bookingStatus === "pending_payment"
                ? "Payment processing..."
                : bookingConfirmedData.bookingStatus === "pending"
                ? "Booking received!"
                : "Booking confirmed!"}
            </Text>

            {bookingConfirmedData.bookingStatus === "pending_payment" && (
              <Text style={{ fontSize: 13, color: "#92400E", textAlign: "center", backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 }}>
                Your payment is being confirmed. You&apos;ll receive a notification shortly.
              </Text>
            )}

            {bookingConfirmedData.bookingStatus === "pending" && (
              <Text style={{ fontSize: 13, color: "#92400E", textAlign: "center", backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 }}>
                Awaiting provider confirmation — usually within 8 hours
              </Text>
            )}

            {bookingConfirmedData.providerName && (
              <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 16 }}>
                {bookingConfirmedData.providerName}
              </Text>
            )}

            {/* Summary */}
            {(bookingConfirmedData.date || bookingConfirmedData.services) && (
              <View style={{
                width: "100%",
                backgroundColor: "#F9FAFB",
                borderRadius: 16,
                padding: 16,
                gap: 10,
                marginBottom: 20,
              }}>
                {bookingConfirmedData.date && bookingConfirmedData.time && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${Colors.primary}12`, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>{bookingConfirmedData.date}</Text>
                      <Text style={{ fontSize: 12, color: "#6B7280" }}>{bookingConfirmedData.time}</Text>
                    </View>
                  </View>
                )}
                {bookingConfirmedData.services && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${Colors.primary}12`, alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="cut-outline" size={16} color={Colors.primary} />
                    </View>
                    <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 18 }} numberOfLines={2}>{bookingConfirmedData.services}</Text>
                  </View>
                )}
              </View>
            )}

            <Text style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center" }}>
              Taking you to your booking…
            </Text>
          </View>
        </View>
      )}
    </>
  );
}
