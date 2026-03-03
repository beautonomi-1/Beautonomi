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
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { Colors } from "@/constants/colors";
import { haptic } from "@/lib/haptics";
import { Skeleton } from "@/components/Skeleton";
import { useSavedCards } from "@/hooks/useSavedCards";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import type { SavedPaymentMethod } from "@/types/api";

/* ─── Types ─── */

interface BookingServiceSnapshot {
  offering_id: string;
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
      flexDirection: "row", alignItems: "center", backgroundColor: bgColor,
      borderRadius: 12, padding: 12, marginBottom: 16, gap: 8,
    }}>
      <Ionicons name="time-outline" size={18} color={iconColor} />
      <Text style={{ fontSize: 13, fontWeight: "600", color: textColor, flex: 1 }}>
        {countdown.expired
          ? "Time slot expired — please go back and select a new time"
          : `Slot held for ${countdown.minutes}:${String(countdown.seconds).padStart(2, "0")}`}
      </Text>
    </View>
  );
}

/* ─── Cancellation Policy Section ─── */
function CancellationPolicy({ policy, currency }: {
  policy: HoldData["cancellation_policy"];
  currency: string;
}) {
  if (!policy) return null;
  const windowHrs = policy.cancellation_window_hours;
  const noShowFee = policy.no_show_fee_enabled && policy.no_show_fee_amount;

  if (!windowHrs && !noShowFee) return null;

  return (
    <View style={{
      backgroundColor: "#F9FAFB", borderRadius: 16, padding: 16, marginBottom: 16,
      borderWidth: 1, borderColor: "#F3F4F6",
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#6B7280" />
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Cancellation Policy</Text>
      </View>
      {windowHrs != null && windowHrs > 0 && (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} style={{ marginTop: 1 }} />
          <Text style={{ fontSize: 13, color: "#374151", flex: 1, lineHeight: 20 }}>
            Free cancellation up to {windowHrs} {windowHrs === 1 ? "hour" : "hours"} before your appointment
          </Text>
        </View>
      )}
      {noShowFee ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} style={{ marginTop: 1 }} />
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
        flexDirection: "row", alignItems: "center", gap: 4,
        backgroundColor: "#F3F4F6", borderRadius: 999,
        paddingHorizontal: 10, paddingVertical: 5,
      }}
      accessibilityRole="button" accessibilityLabel={`Change ${label}`}
    >
      <Ionicons name="pencil" size={12} color="#6B7280" />
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
              flexDirection: "row", alignItems: "center", gap: 12,
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
              alignItems: "center", justifyContent: "center",
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
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed",
        }}
      >
        <Ionicons name="add-circle-outline" size={18} color="#6B7280" />
        <Text style={{ fontSize: 13, fontWeight: "500", color: "#6B7280" }}>Use a new card</Text>
      </Pressable>
    </View>
  );
}

const SAVE_CARD_INFO =
  "We'll save your card securely when you pay. To verify your card, Paystack may place a small temporary charge (e.g. R1) and reverse it—this confirms your card for future use.";

/* ─── Save Card Toggle ─── */
function SaveCardToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <View>
      <Pressable
        onPress={() => { haptic.light(); onToggle(); }}
        style={{
          flexDirection: "row", alignItems: "center", gap: 10,
          paddingVertical: 12, paddingHorizontal: 2,
        }}
        accessibilityRole="switch" accessibilityState={{ checked: enabled }}
        accessibilityLabel="Save card for future payments"
      >
        <View style={{
          width: 44, height: 24, borderRadius: 12, justifyContent: "center",
          backgroundColor: enabled ? Colors.primary : "#D1D5DB",
          paddingHorizontal: 2,
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
  const {
    hold_id,
    service_name: routeServiceName,
    provider_name: routeProviderName,
    provider_thumbnail: routeProviderThumbnail,
  } = useLocalSearchParams<{
    hold_id: string;
    service_name?: string;
    provider_name?: string;
    provider_thumbnail?: string;
  }>();
  const { user } = useAuth();
  const [hold, setHold] = useState<HoldData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [consuming, setConsuming] = useState(false);
  const [requestingNow, setRequestingNow] = useState(false);
  const onDemandAcceptEnabled = useFeatureFlag("on_demand_accept_customer_enabled");
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [paymentOption, setPaymentOption] = useState<"deposit" | "full">("full");
  const [saveCard, setSaveCard] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [useNewCard, setUseNewCard] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);

  const { cards: savedCards, loading: cardsLoading, defaultCard, refresh: refreshCards } = useSavedCards();
  const { pay: paystackPay, payWithSavedCard, loading: payLoading, error: payError } = usePaystackPayment();

  const [bookingCustomDefinitions, setBookingCustomDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [bookingCustomValues, setBookingCustomValues] = useState<Record<string, string | number | boolean | null>>({});
  const [providerForms, setProviderForms] = useState<ProviderForm[]>([]);
  const [providerFormValues, setProviderFormValues] = useState<Record<string, Record<string, string | number | boolean | null>>>({});

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
          cancellation_policy: data.cancellation_policy as HoldData["cancellation_policy"],
        };
        setHold(holdData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Hold expired. Please select a new time.");
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
        const w = (res.data as any)?.wallet ?? (res.data as any);
        if (w?.balance != null) setWalletBalance(Number(w.balance) || 0);
      })
      .catch(() => {});
  }, [user]);

  const subtotal = hold ? hold.booking_services_snapshot.reduce((s, svc) => s + svc.price, 0) : 0;
  const currency = hold?.booking_services_snapshot[0]?.currency || "ZAR";
  const travelFee = hold?.travel_fee ?? 0;
  const total = subtotal + travelFee;
  const hasDeposit = !!(hold?.deposit_required && hold?.deposit_amount != null && hold.deposit_amount > 0);
  const depositAmount = hold?.deposit_amount ?? (hold?.deposit_percentage ? total * hold.deposit_percentage / 100 : 0);

  const navigateToBooking = useCallback((bookingId?: string) => {
    haptic.success();
    router.replace(bookingId
      ? { pathname: "/(app)/booking-detail", params: { id: bookingId } }
      : { pathname: "/(app)/(tabs)/bookings" }
    );
  }, []);

  const handleRequestNow = useCallback(async () => {
    if (!hold_id || !hold || !user) return;
    if (hold.expires_at && getTimeRemaining(hold.expires_at).expired) {
      setError("This time slot has expired. Please go back and select a new time.");
      return;
    }
    setRequestingNow(true);
    setError(null);
    try {
      const requestPayload = {
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
      const res = await api.post<{ id: string }>(`/api/me/on-demand/requests`, {
        provider_id: hold.provider_id,
        request_payload: requestPayload,
      });
      if (res.error) {
        haptic.error();
        setError(res.error.message ?? "Failed to submit request");
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
      setError(e instanceof Error ? e.message : "Request failed");
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
        payment_method: paymentMethod,
        payment_option: paymentOption,
        use_wallet: paymentMethod === "card" ? useWallet : false,
        save_card: paymentMethod === "card" && (useNewCard || savedCards.length === 0) ? saveCard : false,
      };
      if (Object.keys(bookingCustomValues).length > 0) payload.custom_field_values = bookingCustomValues;
      if (Object.keys(providerFormValues).length > 0) payload.provider_form_responses = providerFormValues;

      const res = await api.post<ConsumeResponse>(`/api/public/booking-holds/${hold_id}/consume`, payload);

      if (res.error) {
        haptic.error();
        setError(res.error.message || "Failed to complete booking");
        return;
      }

      const data = res.data;
      const bookingId = data?.booking_id;

      /* ── Saved card flow: charge directly without redirect ── */
      if (paymentMethod === "card" && selectedCardId && !useNewCard && savedCards.length > 0) {
        const chargeAmount = paymentOption === "deposit" && hasDeposit ? depositAmount : total;
        const result = await payWithSavedCard({
          payment_method_id: selectedCardId,
          amount: chargeAmount,
          email: user.email || "",
          currency,
          metadata: { booking_id: bookingId },
        });

        if (result.success) {
          refreshCards();
          navigateToBooking(bookingId);
        } else {
          haptic.error();
          setError(payError || "Card payment failed. Please try another card.");
        }
        return;
      }

      /* ── New card / hosted checkout flow ── */
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
          navigateToBooking(bookingId);
        } else {
          haptic.error();
          setError("Payment was not completed. Please try again.");
        }
      } else {
        navigateToBooking(bookingId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete");
    } finally {
      setConsuming(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pay helpers and navigateToBooking are stable refs
  }, [hold_id, hold, user, paymentMethod, paymentOption, useWallet, selectedCardId, useNewCard, savedCards, saveCard, total, depositAmount, hasDeposit, currency, bookingCustomDefinitions, bookingCustomValues, providerForms, providerFormValues]);

  /* ─── Loading skeleton ─── */
  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: "#fff" }}>
          <View style={{ paddingTop: 52, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "#F3F4F6" }} />
            <Skeleton width="40%" height={18} />
          </View>
          <View style={{ paddingHorizontal: 16, gap: 12 }}>
            <Skeleton width="100%" height={48} borderRadius={12} />
            <View style={{ flexDirection: "row", gap: 12, backgroundColor: "#F9FAFB", borderRadius: 16, padding: 16 }}>
              <Skeleton width={48} height={48} borderRadius={24} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="60%" height={16} />
                <Skeleton width="40%" height={12} />
              </View>
            </View>
            <Skeleton width="100%" height={80} borderRadius={16} />
            <Skeleton width="100%" height={60} borderRadius={16} />
            <Skeleton width="100%" height={60} borderRadius={16} />
            <Skeleton width="100%" height={56} borderRadius={14} />
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
        <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, alignItems: "center", justifyContent: "center" }}>
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
          flexDirection: "row", alignItems: "center", paddingTop: 52, paddingHorizontal: 16, paddingBottom: 8,
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
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Countdown */}
            {hold.expires_at && <CountdownBar expiresAt={hold.expires_at} />}

            {/* ═══ Provider Identity ═══ */}
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 12,
              backgroundColor: "#F9FAFB", borderRadius: 16, padding: 14, marginBottom: 16,
            }}>
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
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
            <View style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="calendar-outline" size={18} color="#6B7280" />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>Appointment Details</Text>
                </View>
                <EditChip label="date and time" onPress={() => router.back()} />
              </View>

              {/* Date & Time */}
              <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginBottom: 4 }}>DATE</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{formatDateOnly(hold.start_at)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: "#9CA3AF", fontWeight: "500", marginBottom: 4 }}>TIME</Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827" }}>{formatTimeOnly(hold.start_at)}</Text>
                </View>
              </View>

              {/* Location */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: "#E5E7EB" }}>
                <Ionicons
                  name={hold.location_type === "at_home" ? "home-outline" : "business-outline"}
                  size={14} color="#6B7280"
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
                <EditChip label="service" onPress={() => router.back()} />
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
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <Ionicons name="time-outline" size={12} color="#9CA3AF" />
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

            {/* Travel Fee */}
            {hold.location_type === "at_home" && travelFee > 0 && (
              <View style={{
                flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12, marginBottom: 16,
              }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  <Ionicons name="car-outline" size={16} color="#92400E" />
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
            <View style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: 16, marginBottom: 16 }}>
              {travelFee > 0 && (
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderColor: "#E5E7EB" }}>
                  <Text style={{ fontSize: 13, color: "#6B7280" }}>Subtotal</Text>
                  <Text style={{ fontSize: 13, color: "#6B7280" }}>{formatCurrency(subtotal, currency)}</Text>
                </View>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>Total</Text>
                <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827" }}>{formatCurrency(total, currency)}</Text>
              </View>
            </View>

            {/* ═══ Additional details (platform custom fields) ═══ */}
            {bookingCustomDefinitions.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 10 }}>Additional details</Text>
                <View style={{ backgroundColor: "#F9FAFB", borderRadius: 16, padding: 14, gap: 12 }}>
                  {bookingCustomDefinitions.map((field) => (
                    <View key={field.id}>
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
                            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                          >
                            <View style={{
                              width: 22, height: 22, borderRadius: 6, borderWidth: 2,
                              borderColor: providerFormValues[form.id]?.[field.id] ? Colors.primary : "#9CA3AF",
                              backgroundColor: providerFormValues[form.id]?.[field.id] ? Colors.primary : "transparent",
                              alignItems: "center", justifyContent: "center",
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
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={() => { haptic.light(); setPaymentOption("full"); }}
                    style={{
                      flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: "center",
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
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                <Pressable
                  onPress={() => { haptic.light(); setPaymentMethod("card"); }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
                    borderColor: paymentMethod === "card" ? Colors.primary : "#E5E7EB",
                    backgroundColor: paymentMethod === "card" ? Colors.primaryLight : "#fff",
                  }}
                  accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === "card" }}
                >
                  <Ionicons name="card-outline" size={18} color={paymentMethod === "card" ? Colors.primary : "#6B7280"} />
                  <Text style={{ fontWeight: "600", color: paymentMethod === "card" ? Colors.primary : "#374151" }}>Card</Text>
                  {paymentMethod === "card" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                </Pressable>
                <Pressable
                  onPress={() => { haptic.light(); setPaymentMethod("cash"); }}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                    paddingVertical: 14, borderRadius: 14, borderWidth: 1.5,
                    borderColor: paymentMethod === "cash" ? Colors.primary : "#E5E7EB",
                    backgroundColor: paymentMethod === "cash" ? Colors.primaryLight : "#fff",
                  }}
                  accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === "cash" }}
                >
                  <Ionicons name="cash-outline" size={18} color={paymentMethod === "cash" ? Colors.primary : "#6B7280"} />
                  <Text style={{ fontWeight: "600", color: paymentMethod === "cash" ? Colors.primary : "#374151" }}>Cash</Text>
                  {paymentMethod === "cash" && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                </Pressable>
              </View>

              {/* Use wallet balance (when card selected and user has balance) */}
              {paymentMethod === "card" && user && walletBalance > 0 && (
                <Pressable
                  onPress={() => { haptic.light(); setUseWallet(!useWallet); }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
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
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {useWallet && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <Ionicons name="wallet-outline" size={18} color={useWallet ? Colors.primary : "#6B7280"} />
                  <Text style={{ flex: 1, fontWeight: "500", color: useWallet ? Colors.primary : "#374151", fontSize: 14 }}>
                    Use wallet balance — {formatCurrency(walletBalance, currency)} available
                  </Text>
                </Pressable>
              )}

              {/* Saved Cards Section (only when card payment selected) */}
              {paymentMethod === "card" && (
                <View>
                  {cardsLoading ? (
                    <View style={{ gap: 8, marginBottom: 12 }}>
                      <Skeleton width="100%" height={56} borderRadius={14} />
                      <Skeleton width="100%" height={56} borderRadius={14} />
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
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12, paddingVertical: 4 }}
                    >
                      <Ionicons name="arrow-back-outline" size={14} color={Colors.primary} />
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
            <CancellationPolicy policy={hold.cancellation_policy} currency={currency} />

            {/* Error banner */}
            {(error || payError) && (
              <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <Text style={{ color: "#B91C1C", fontSize: 13 }}>{error || payError}</Text>
              </View>
            )}
          </ScrollView>

          {/* ═══ Sticky Bottom CTA ═══ */}
          <View style={{
            paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 28,
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
            {onDemandAcceptEnabled && user && (
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
                  gap: 8,
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
                  <Ionicons name="flash-outline" size={20} color="#374151" />
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
                alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
                opacity: (consuming || payLoading) ? 0.7 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={user ? "Complete booking" : "Sign in to complete"}
              accessibilityState={{ disabled: consuming || payLoading || isExpired }}
            >
              {(consuming || payLoading) ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
                    {payLoading ? "Charging card..." : "Processing..."}
                  </Text>
                </View>
              ) : (
                <>
                  <Ionicons name={isExpired ? "time-outline" : usingSavedCard ? "card" : "shield-checkmark"} size={20} color="#fff" />
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
