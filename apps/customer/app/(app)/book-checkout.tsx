import { useEffect, useState, useCallback, useRef } from "react";
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
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, Stack, router } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { Skeleton } from "@/components/Skeleton";
import { useSavedCards } from "@/hooks/useSavedCards";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFeatureFlag, useModuleConfig } from "@/providers/ConfigBundleProvider";
import type { SavedPaymentMethod } from "@/types/api";

/* ─── Types ─── */

interface BookingServiceSnapshot {
  offering_id: string;
  id?: string;
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
    no_show_fee_enabled?: boolean;
    no_show_fee_amount?: number;
    currency?: string;
  };
}

interface ConsumeResponse {
  booking_id?: string;
  booking_number?: string;
  payment_url?: string | null;
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

function formatDateOnly(s: string) {
  return new Date(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeOnly(s: string) {
  return new Date(s).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatCurrency(amount: number, currency = "ZAR") {
  return `${currency} ${amount.toFixed(2)}`;
}

function getTimeRemaining(expiresAt: string): { minutes: number; seconds: number; expired: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { minutes: 0, seconds: 0, expired: true };
  const totalSeconds = Math.floor(diff / 1000);
  return { minutes: Math.floor(totalSeconds / 60), seconds: totalSeconds % 60, expired: false };
}

/* ─── Countdown Bar ─── */
function CountdownBar({ expiresAt }: { expiresAt: string }) {
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
            ? "This time slot has expired. Please select a new date and time to continue."
            : `Slot held for ${countdown.minutes}:${String(countdown.seconds).padStart(2, "0")}`}
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
          accessibilityLabel="Select new time"
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Select new time</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/* ─── Cancellation Policy Section ─── */
function CancellationPolicy({ policy, currency, contentPadding }: {
  policy: HoldData["cancellation_policy"];
  currency: string;
  contentPadding: number;
}) {
  if (!policy) return null;
  const windowHrs = policy.cancellation_window_hours;
  const noShowFee = policy.no_show_fee_enabled && policy.no_show_fee_amount;

  if (!windowHrs && !noShowFee) return null;

  return (
    <View style={{
      backgroundColor: "#F9FAFB", borderRadius: 16, padding: contentPadding, marginBottom: 16,
      borderWidth: 1, borderColor: "#F3F4F6",
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Cancellation Policy</Text>
      </View>
      {windowHrs != null && windowHrs > 0 && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 6 }}>
          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} style={{ marginTop: 1, marginRight: 8 }} />
          <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 20 }}>
            Free cancellation up to {windowHrs} {windowHrs === 1 ? "hour" : "hours"} before your appointment
          </Text>
        </View>
      )}
      {noShowFee ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} style={{ marginTop: 1, marginRight: 8 }} />
          <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 20 }}>
            No-show fee of {formatCurrency(policy.no_show_fee_amount!, policy.currency || currency)} applies
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

const SAVE_CARD_INFO =
  "We'll save your card securely when you pay. To verify your card, a small temporary charge (e.g. R1) may be placed and reversed—this confirms your card for future use.";

/* ─── Save Card Toggle ─── */
function SaveCardToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <View>
      <Pressable
        onPress={() => { haptic.light(); onToggle(); }}
        style={{
          flexDirection: "row", alignItems: "center",
          paddingVertical: 12, paddingHorizontal: 2,
        }}
        accessibilityRole="switch" accessibilityState={{ checked: enabled }}
        accessibilityLabel="Save card for future payments"
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
          onPress={() => { haptic.light(); Alert.alert("Save card", SAVE_CARD_INFO); }}
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

/* ═══════════════════════════════════════════
   Main Screen
   ═══════════════════════════════════════════ */
export default function BookCheckoutScreen() {
  useScreenTracking("Book Checkout");
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
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
  } = useLocalSearchParams<{
    hold_id: string;
    slug?: string;
    service_name?: string;
    provider_name?: string;
    provider_thumbnail?: string;
    reschedule_booking_id?: string;
    campaign_id?: string;
    provider_id?: string;
  }>();
  const { user } = useAuth();
  const [hold, setHold] = useState<HoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consuming, setConsuming] = useState(false);
  const [requestingNow, setRequestingNow] = useState(false);
  const onDemandAcceptEnabled = useFeatureFlag("on_demand_accept_customer_enabled");
  const onDemandModule = useModuleConfig("on_demand");
  const onDemandEnabled = Boolean(onDemandAcceptEnabled && onDemandModule?.enabled);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash" | "wallet" | "giftcard">("card");
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
  const { pay: paystackPay, loading: payLoading, error: payError } = usePaystackPayment();

  const [bookingCustomDefinitions, setBookingCustomDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [bookingCustomValues, setBookingCustomValues] = useState<Record<string, string | number | boolean | null>>({});
  const [providerForms, setProviderForms] = useState<ProviderForm[]>([]);
  const [providerFormValues, setProviderFormValues] = useState<Record<string, Record<string, string | number | boolean | null>>>({});
  const [specialRequests, setSpecialRequests] = useState("");
  const [promotionCode, setPromotionCode] = useState("");
  const [appliedPromoDiscount, setAppliedPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [addonsList, setAddonsList] = useState<AddonOption[]>([]);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [isGroupBooking, setIsGroupBooking] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<{ id: string; name: string; phone?: string; service_ids: string[] }[]>([]);
  const [productsList, setProductsList] = useState<{ id: string; name: string; retail_price: number; currency: string }[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; name: string; price: number; quantity: number; currency: string }[]>([]);
  const [packagesList, setPackagesList] = useState<{ id: string; name: string; description?: string; price: number; currency: string }[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  useEffect(() => {
    if (defaultCard && !selectedCardId && !useNewCard) {
      setSelectedCardId(defaultCard.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when defaultCard changes
  }, [defaultCard]);

  useEffect(() => {
    if (!hold_id) {
      setError("Missing booking. Please start again.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.get<HoldData>(`/api/public/booking-holds/${hold_id}`);
        if (cancelled) return;

        const data = (res.data ?? {}) as Record<string, unknown>;
        if (!data.hold_id && !data.booking_services_snapshot) {
          throw new Error("Invalid or expired hold");
        }

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
          travel_fee: data.travel_fee as number | undefined,
          travel_distance_km: data.travel_distance_km as number | undefined,
          tips_enabled: (data as { tips_enabled?: boolean }).tips_enabled,
          tip_presets: Array.isArray((data as { tip_presets?: number[] }).tip_presets)
            ? (data as { tip_presets: number[] }).tip_presets
            : undefined,
          cancellation_policy: data.cancellation_policy as HoldData["cancellation_policy"],
        };
        setHold(holdData);
        try {
          const saved = await AsyncStorage.getItem("beautonomi_booking_addons");
          if (saved) {
            const parsed = JSON.parse(saved) as unknown;
            if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
              setSelectedAddonIds(parsed);
            }
          }
        } catch {
          // ignore parse or get errors
        }
      } catch (e) {
        if (!cancelled) setError(getApiErrorMessage(e, "Hold expired. Please select a new time."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- route params are stable for this screen
  }, [hold_id]);

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
        if (res.error) return;
        const raw = res.data as any;
        const wallet = raw?.data?.wallet ?? raw?.wallet;
        if (wallet?.balance != null) setWalletBalance(Number(wallet.balance) || 0);
      })
      .catch(() => {});
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
        setProductsList(Array.isArray(arr) ? arr.map((p: any) => ({ id: p.id, name: p.name || "Product", retail_price: Number(p.price ?? p.retail_price) || 0, currency: p.currency || "ZAR" })) : []);
      })
      .catch(() => setProductsList([]));
  }, [provider_slug]);

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
        setPackagesList(Array.isArray(arr) ? arr.map((p: any) => ({ id: p.id, name: p.name || "Package", description: p.description, price: Number(p.price) || 0, currency: p.currency || "ZAR" })) : []);
      })
      .catch(() => setPackagesList([]));
  }, [provider_slug, hold?.location_id]);

  const snapshotOfferingIds = hold?.booking_services_snapshot?.map((s) => s.offering_id ?? (s as { id?: string }).id).filter(Boolean) as string[] ?? [];

  const subtotal = hold ? hold.booking_services_snapshot.reduce((s, svc) => s + svc.price, 0) : 0;
  const currency = hold?.booking_services_snapshot[0]?.currency || "ZAR";
  const travelFee = hold?.travel_fee ?? 0;
  const addonsSubtotal = addonsList
    .filter((a) => selectedAddonIds.includes(a.id))
    .reduce((s, a) => s + (Number(a.price) || 0), 0);
  const productsSubtotal = selectedProducts.reduce((s, p) => s + p.price * p.quantity, 0);
  const prePromoTotal = subtotal + addonsSubtotal + travelFee + productsSubtotal;
  const total = Math.max(0, prePromoTotal - appliedPromoDiscount + tipAmount);
  const hasDeposit = !!(hold?.deposit_required && hold?.deposit_amount != null && hold.deposit_amount > 0);
  const depositAmount = hold?.deposit_amount ?? (hold?.deposit_percentage ? total * hold.deposit_percentage / 100 : 0);

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

  const applyGiftCard = useCallback(async () => {
    const code = giftCardCode.trim().toUpperCase();
    if (!code) return;
    setGiftCardError(null);
    setGiftCardValidating(true);
    try {
      const res = await api.get<{ valid?: boolean; balance?: number; currency?: string; message?: string }>(
        `/api/public/gift-cards/validate?code=${encodeURIComponent(code)}`
      );
      const data = res.data as any;
      if (data?.valid && data?.balance != null) {
        setGiftCardValid({ balance: Number(data.balance), currency: data.currency || "ZAR" });
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

  const navigateToBooking = useCallback((bookingId?: string, previousBookingId?: string) => {
    haptic.success();
    AsyncStorage.removeItem("beautonomi_booking_addons").catch(() => {});

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
                await api.post(`/api/me/bookings/${previousBookingId}/cancel`, {});
                haptic.success();
              } catch {
                // Still navigate to new booking
              }
              router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } });
            },
          },
        ]
      );
    } else {
      router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } });
    }
  }, [routeCampaignId, routeProviderId, hold_id]);

  const handleRequestNow = useCallback(async () => {
    if (!hold_id || !hold || !user) return;
    if (hold.expires_at && getTimeRemaining(hold.expires_at).expired) {
      setError("This time slot has expired. Please go back and select a new time.");
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
      const res = await api.post<{ id: string }>(`/api/me/on-demand/requests`, {
        provider_id: hold.provider_id,
        request_payload: requestPayload,
      });
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
  }, [hold_id, hold, user]);

  const handleComplete = useCallback(async () => {
    if (!hold_id || !hold) return;

    if (!user) {
      router.replace({ pathname: "/(auth)/login", params: { return_to: `/(app)/book-checkout?hold_id=${hold_id}` } });
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
      if (!form.is_required) continue;
      for (const field of form.fields || []) {
        if (!field.is_required) continue;
        const val = providerFormValues[form.id]?.[field.id];
        if (val === undefined || val === null || String(val).trim() === "") {
          setError(`Please complete: ${form.title} — ${field.name}`);
          return;
        }
      }
    }

    setConsuming(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        payment_method: paymentMethod === "wallet" ? "card" : paymentMethod === "giftcard" ? "giftcard" : paymentMethod,
        payment_option: paymentOption,
        use_wallet: paymentMethod === "wallet" || (paymentMethod === "card" && useWallet),
        save_card: paymentMethod === "card" && (useNewCard || savedCards.length === 0) ? saveCard : false,
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
      if (promotionCode.trim()) payload.promotion_code = promotionCode.trim();
      if (selectedAddonIds.length > 0) payload.addons = selectedAddonIds;
      if (routeRescheduleBookingId) payload.reschedule_booking_id = routeRescheduleBookingId;
      if (tipAmount > 0) payload.tip_amount = tipAmount;
      const validParticipants = isGroupBooking ? groupParticipants.filter((p) => p.name.trim()).map((p) => ({
        name: p.name.trim(),
        email: undefined,
        phone: p.phone?.trim() || undefined,
        service_ids: p.service_ids.length > 0 ? p.service_ids : snapshotOfferingIds,
        notes: undefined,
      })) : [];
      if (validParticipants.length > 0) {
        payload.is_group_booking = true;
        payload.group_participants = validParticipants;
      }
      if (selectedProducts.length > 0) {
        payload.products = selectedProducts.map((p) => ({
          productId: p.productId,
          quantity: p.quantity,
          unitPrice: p.price,
          totalPrice: p.price * p.quantity,
        }));
      }
      if (selectedPackageId) payload.package_id = selectedPackageId;
      if (user?.user_metadata?.full_name || user?.email) {
        const parts = (user.user_metadata?.full_name ?? "").trim().split(/\s+/);
        payload.client_info = {
          firstName: parts[0] || "Guest",
          lastName: parts.slice(1).join(" ") || "User",
          email: user.email ?? undefined,
          phone: user.phone ?? undefined,
        };
      }

      const res = await api.post<ConsumeResponse>(`/api/public/booking-holds/${hold_id}/consume`, payload);

      if (res.error) {
        haptic.error();
        setError(getApiErrorMessage(res.error, "Failed to complete booking"));
        return;
      }

      const data = res.data;
      const bookingId = data?.booking_id;

      /* Server already charged saved card when payment_method_id was sent; it returns payment_url: null in that case. */
      const paymentUrl = data?.payment_url;
      if (paymentUrl && paymentMethod === "card") {
        const payResult = await paystackPay({
          booking_id: bookingId || hold_id,
          amount: paymentOption === "deposit" && hasDeposit ? depositAmount : total,
          email: user.email || "",
          currency,
          save_card: saveCard,
          customer_id: user.id,
        });

        if (payResult.success || payResult.dismissed) {
          if (saveCard) refreshCards();
          navigateToBooking(bookingId, routeRescheduleBookingId ?? undefined);
        } else {
          haptic.error();
          setError("Payment was not completed. Please try again.");
        }
      } else {
        if (selectedCardId && !useNewCard && savedCards.length > 0) refreshCards();
        navigateToBooking(bookingId, routeRescheduleBookingId ?? undefined);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to complete"));
    } finally {
      setConsuming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pay helpers and navigateToBooking are stable refs
  }, [hold_id, hold, user, paymentMethod, paymentOption, useWallet, selectedCardId, useNewCard, savedCards, saveCard, total, depositAmount, hasDeposit, currency, bookingCustomDefinitions, bookingCustomValues, providerForms, providerFormValues, specialRequests, promotionCode, tipAmount, routeRescheduleBookingId, giftCardCode, giftCardValid, selectedAddonIds, isGroupBooking, groupParticipants, selectedProducts, snapshotOfferingIds, selectedPackageId]);

  /* ─── Loading skeleton ─── */
  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ paddingTop: 52, paddingHorizontal: contentPadding, paddingBottom: 12, flexDirection: "row", alignItems: "center" }}>
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
            accessibilityRole="button" accessibilityLabel="Start over"
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Start Over</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  if (!hold) return null;

  const isExpired = hold.expires_at ? getTimeRemaining(hold.expires_at).expired : false;
  const providerInitial = (hold.provider_name || "P").charAt(0).toUpperCase();
  const thumbnailUrl = hold.provider_thumbnail || hold.provider_avatar_url;
  const usingSavedCard = paymentMethod === "card" && !!selectedCardId && !useNewCard && savedCards.length > 0;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: "#fff" }}>
        {/* ═══ Custom Header ═══ */}
        <View style={{
          flexDirection: "row", alignItems: "center", paddingTop: 52, paddingHorizontal: contentPadding, paddingBottom: 8,
          backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#F3F4F6",
        }}>
          <TouchableOpacity
            onPress={() => {
              Alert.alert("Leave checkout?", "Your slot will remain held until it expires.", [
                { text: "Stay", style: "cancel" },
                { text: "Leave", style: "destructive", onPress: () => router.back() },
              ]);
            }}
            style={{
              width: 38, height: 38, borderRadius: 19, backgroundColor: "#F3F4F6",
              alignItems: "center", justifyContent: "center",
            }}
            accessibilityRole="button" accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: 18, fontWeight: "700", color: "#111827", marginLeft: 12 }}>Checkout</Text>
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
            accessibilityLabel="Checkout summary and payment"
            accessibilityRole="none"
          >
            {/* Countdown */}
            {hold.expires_at && <CountdownBar expiresAt={hold.expires_at} />}

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
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>{hold.provider_name || "Provider"}</Text>
                {hold.staff_name && (
                  <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>with {hold.staff_name}</Text>
                )}
              </View>
            </View>

            {/* ═══ Appointment Details (with edit options) ═══ */}
            <View style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: contentPadding, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Ionicons name="calendar-outline" size={18} color="#6B7280" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Appointment Details</Text>
                </View>
                <EditChip label="date and time" onPress={() => {
                  if (provider_slug) {
                    router.replace({ pathname: "/(app)/book", params: { slug: provider_slug, step: "date" } });
                  } else {
                    router.back();
                  }
                }} />
              </View>

              {/* Date & Time */}
              <View style={{ flexDirection: "row", marginBottom: 10 }}>
                <View style={{ flex: 1, marginRight: 16 }}>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginBottom: 4 }}>DATE</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{formatDateOnly(hold.start_at)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginBottom: 4 }}>TIME</Text>
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
                  {hold.location_type === "at_home" ? "At your location" : hold.location_name || "At salon"}
                </Text>
              </View>
            </View>

            {/* ═══ Services ═══ */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Services</Text>
                <EditChip label="service" onPress={() => {
                if (provider_slug) {
                  router.replace({ pathname: "/(app)/book", params: { slug: provider_slug, step: "service" } });
                } else {
                  router.back();
                }
              }} />
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
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Add-ons (optional)</Text>
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

            {/* Group booking */}
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
                        { id: `p-${Date.now()}`, name: "", phone: "", service_ids: [...snapshotOfferingIds] },
                      ]);
                    }}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, marginBottom: 8 }}
                  >
                    <Ionicons name="add-circle-outline" size={20} color={Colors.primary} style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.primary }}>Add participant</Text>
                  </TouchableOpacity>
                  {groupParticipants.map((p) => (
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
                        style={{ backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: "#111827" }}
                      />
                    </View>
                  ))}
                </>
              )}
            </View>

            {/* Products (add to booking) */}
            {productsList.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Products (optional)</Text>
                {productsList.map((prod) => {
                  const cur = selectedProducts.find((s) => s.productId === prod.id);
                  const qty = cur?.quantity ?? 0;
                  return (
                    <View key={prod.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#F9FAFB", borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: "#E5E7EB" }}>
                      <View style={{ flex: 1 }}>
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
                            if (qty === 0) setSelectedProducts((prev) => [...prev, { productId: prod.id, name: prod.name, price: prod.retail_price, quantity: 1, currency: prod.currency }]);
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
              </View>
            )}

            {/* Package (optional) */}
            {packagesList.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Package (optional)</Text>
                {packagesList.map((pkg) => {
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
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#92400E" }}>Travel fee</Text>
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
              {(travelFee > 0 || addonsSubtotal > 0 || productsSubtotal > 0 || appliedPromoDiscount > 0 || tipAmount > 0) && (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: "#6B7280" }}>Services</Text>
                    <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(subtotal, currency)}</Text>
                  </View>
                  {addonsSubtotal > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>Add-ons</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(addonsSubtotal, currency)}</Text>
                    </View>
                  )}
                  {productsSubtotal > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>Products</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(productsSubtotal, currency)}</Text>
                    </View>
                  )}
                  {travelFee > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>Travel</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(travelFee, currency)}</Text>
                    </View>
                  )}
                  {appliedPromoDiscount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: "#059669" }}>Promo</Text>
                      <Text style={{ fontSize: 13, color: "#059669" }}>-{formatCurrency(appliedPromoDiscount, currency)}</Text>
                    </View>
                  )}
                  {tipAmount > 0 && (
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderColor: "#E5E7EB" }}>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>Tip</Text>
                      <Text style={{ fontSize: 13, color: "#6B7280" }}>+{formatCurrency(tipAmount, currency)}</Text>
                    </View>
                  )}
                </>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>Total</Text>
                <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827" }}>{formatCurrency(total, currency)}</Text>
              </View>
            </View>

            {/* ═══ Tip (optional) ═══ */}
            {hold?.tips_enabled && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Add a tip (optional)</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {([0, ...(hold.tip_presets ?? [10, 15, 20, 25])].map((preset) => (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => setTipAmount(preset)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 12,
                        backgroundColor: tipAmount === preset ? Colors.primary : "#F3F4F6",
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: "600", color: tipAmount === preset ? "#fff" : "#374151" }}>
                        {preset === 0 ? "No tip" : formatCurrency(preset, currency)}
                      </Text>
                    </TouchableOpacity>
                  )))}
                </View>
              </View>
            )}

            {/* ═══ Special requests & promo code ═══ */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Special requests (optional)</Text>
              <TextInput
                value={specialRequests}
                onChangeText={setSpecialRequests}
                placeholder="Allergies, accessibility, preferred stylist, etc."
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
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginTop: 12, marginBottom: 10 }}>Promo code (optional)</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <TextInput
                  value={promotionCode}
                  onChangeText={(t) => {
                    setPromotionCode(t.trim().toUpperCase());
                    setAppliedPromoDiscount(0);
                    setPromoError(null);
                  }}
                  placeholder="Enter code"
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
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
              {promoError ? (
                <Text style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{promoError}</Text>
              ) : appliedPromoDiscount > 0 ? (
                <Text style={{ fontSize: 12, color: "#059669", marginTop: 6 }}>
                  Promo applied — {formatCurrency(appliedPromoDiscount, currency)} off
                </Text>
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

            {/* ═══ Payment Option (deposit vs full) ═══ */}
            {hasDeposit && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Payment Option</Text>
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
                      Pay in Full
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
                      Deposit Only
                    </Text>
                    <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{formatCurrency(depositAmount, currency)}</Text>
                  </Pressable>
                </View>
                {paymentOption === "deposit" && (
                  <Text style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>
                    Remaining {formatCurrency(total - depositAmount, currency)} due at appointment
                  </Text>
                )}
              </View>
            )}

            {/* ═══ Payment Method ═══ */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Payment Method</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 8 }}>
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
                  <Text style={{ fontWeight: "600", color: paymentMethod === "card" ? Colors.primary : "#374151", fontSize: 14 }}>Card</Text>
                  {paymentMethod === "card" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                </Pressable>
                {user && walletBalance > 0 && (
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
                    <Text style={{ fontWeight: "600", color: paymentMethod === "wallet" ? Colors.primary : "#374151", fontSize: 14 }}>Wallet</Text>
                    {paymentMethod === "wallet" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                  </Pressable>
                )}
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
                  <Text style={{ fontWeight: "600", color: paymentMethod === "cash" ? Colors.primary : "#374151", fontSize: 14 }}>Cash</Text>
                  {paymentMethod === "cash" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                </Pressable>
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
                  <Text style={{ fontWeight: "600", color: paymentMethod === "giftcard" ? Colors.primary : "#374151", fontSize: 14 }}>Gift card</Text>
                  {paymentMethod === "giftcard" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} style={{ marginLeft: 4 }} />}
                </Pressable>
              </View>

              {/* Gift card code (when gift card selected) */}
              {paymentMethod === "giftcard" && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "500", color: "#374151", marginBottom: 8 }}>Gift card code</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <TextInput
                      value={giftCardCode}
                      onChangeText={(t) => {
                        setGiftCardCode(t.trim().toUpperCase());
                        setGiftCardValid(null);
                        setGiftCardError(null);
                      }}
                      placeholder="Enter code"
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
                        <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Apply</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {giftCardError ? (
                    <Text style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{giftCardError}</Text>
                  ) : giftCardValid ? (
                    <Text style={{ fontSize: 12, color: "#059669", marginTop: 6 }}>
                      Gift card applied — {giftCardValid.currency} {giftCardValid.balance.toFixed(2)} available
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Use wallet balance (when card selected and user has balance; wallet is not the primary method) */}
              {paymentMethod === "card" && user && walletBalance > 0 && (
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
                    Use wallet balance — {formatCurrency(walletBalance, currency)} available
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
                          Alert.alert("Error", "Could not set default card. Please try again.");
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
                      <Text style={{ fontSize: 13, color: Colors.primary, fontWeight: "500" }}>Use a saved card</Text>
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
            <CancellationPolicy policy={hold.cancellation_policy} currency={currency} contentPadding={contentPadding} />

            {/* Error banner */}
            {(error || payError) && (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: "#B91C1C", fontSize: 13 }}>{error || payError}</Text>
              </View>
            )}
          </ScrollView>

          {/* ═══ Sticky Bottom CTA ═══ */}
          <View style={{
            paddingHorizontal: contentPadding, paddingVertical: 12, paddingBottom: 28,
            borderTopWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
          }}>
            {/* Price summary */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ fontSize: 13, color: "#6B7280" }}>
                {paymentOption === "deposit" && hasDeposit ? "Deposit now" : "Total"}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>
                {formatCurrency(paymentOption === "deposit" && hasDeposit ? depositAmount : total, currency)}
              </Text>
            </View>
            {onDemandEnabled && user && hold?.provider_on_demand_accept_enabled && (
              <TouchableOpacity
                onPress={() => { haptic.medium(); handleRequestNow(); }}
                disabled={requestingNow || isExpired}
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
                  opacity: (requestingNow || isExpired) ? 0.7 : 1,
                }}
                accessibilityRole="button"
                accessibilityLabel="Request now (provider will accept or decline)"
              >
                {requestingNow ? (
                  <ActivityIndicator size="small" color="#6B7280" />
                ) : (
                  <Ionicons name="flash-outline" size={20} color="#374151" style={{ marginRight: 8 }} />
                )}
                <Text style={{ color: "#374151", fontWeight: "600", fontSize: 15 }}>
                  {requestingNow ? "Submitting..." : "Request now"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { haptic.medium(); handleComplete(); }}
              disabled={consuming || payLoading || isExpired}
              style={{
                backgroundColor: isExpired ? "#D1D5DB" : Colors.primary,
                borderRadius: 14, paddingVertical: 16,
                alignItems: "center", flexDirection: "row", justifyContent: "center",
                opacity: (consuming || payLoading) ? 0.7 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={user ? "Complete booking" : "Sign in to complete"}
              accessibilityHint={user ? "Double tap to confirm and pay for your appointment" : "Double tap to sign in first"}
              accessibilityState={{ disabled: consuming || payLoading || isExpired }}
            >
              {(consuming || payLoading) ? (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16, marginLeft: 8 }}>
                    {payLoading ? "Charging card..." : "Processing..."}
                  </Text>
                </View>
              ) : (
                <>
                  <Ionicons name={isExpired ? "time-outline" : usingSavedCard ? "card" : "shield-checkmark"} size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                    {isExpired
                      ? "Slot Expired"
                      : user
                        ? usingSavedCard
                          ? `Pay with •••• ${savedCards.find(c => c.id === selectedCardId)?.last4 || "card"}`
                          : "Complete Booking"
                        : "Sign in to Complete"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}
