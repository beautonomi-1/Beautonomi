import { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as ExpoLinking from "expo-linking";
import { Colors } from "@/constants/colors";
import { useResponsive } from "@/hooks/useResponsive";
import { api } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/api-error";
import { useAuth } from "@/providers/AuthProvider";
import { haptic } from "@/lib/haptics";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import { useSavedCards } from "@/hooks/useSavedCards";
import { PaymentProcessingOverlay } from "@/components/payment/PaymentProcessingOverlay";
import { PaymentSuccessOverlay, type PaymentSuccessSummaryRow } from "@/components/payment/PaymentSuccessOverlay";

const PRIMARY = Colors.primary;

type OfferPayload = {
  id: string;
  status: string;
  price?: number;
  currency?: string;
  duration_minutes?: number;
  expiration_at?: string | null;
  travel_fee?: number | null;
  booking_id?: string | null;
  provider_deposit?: {
    requires_deposit?: boolean | null;
    deposit_percentage?: number | null;
  } | null;
  request?: {
    service_name?: string | null;
    provider_id?: string | null;
  } | null;
};

export default function CustomOfferCheckoutScreen() {
  const router = useRouter();
  const { offer_id } = useLocalSearchParams<{ offer_id: string }>();
  const { contentPadding } = useResponsive();
  const { user } = useAuth();
  const offerId = typeof offer_id === "string" ? offer_id : "";

  const [offer, setOffer] = useState<OfferPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("full");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Processing payment…");
  const [successOverlay, setSuccessOverlay] = useState<{
    rows: PaymentSuccessSummaryRow[];
  } | null>(null);

  const { cards: savedCards, defaultCard, refresh: refreshSavedCards } = useSavedCards(!!user);
  const [useNewCard, setUseNewCard] = useState(true);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const currency = offer?.currency || getTenantDefaultCurrency();
  const fmt = useCallback((n: number) => formatMoney(n, currency), [currency]);

  const providerRequiresDeposit = Boolean(offer?.provider_deposit?.requires_deposit);
  const depositPct = Number(offer?.provider_deposit?.deposit_percentage ?? 30);

  useEffect(() => {
    if (savedCards.length === 0) {
      setUseNewCard(true);
      return;
    }
    if (defaultCard?.id && !selectedCardId) {
      setSelectedCardId(defaultCard.id);
      setUseNewCard(false);
    }
  }, [savedCards.length, defaultCard?.id, selectedCardId]);

  const loadOffer = useCallback(async () => {
    if (!offerId) {
      setLoadError("Missing offer");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const res = await api.get<OfferPayload>(`/api/me/custom-offers/${offerId}`);
    if (res.error) {
      setLoadError(getApiErrorMessage(res.error, "Could not load offer"));
      setOffer(null);
      setLoading(false);
      return;
    }
    const row = res.data;
    if (!row) {
      setLoadError("Offer not found");
      setOffer(null);
      setLoading(false);
      return;
    }
    setOffer(row);
    const reqDeposit = Boolean(row.provider_deposit?.requires_deposit);
    if (reqDeposit && row.status !== "paid") {
      setPaymentOption("deposit");
    }
    setLoading(false);
  }, [offerId]);

  useEffect(() => {
    void loadOffer();
  }, [loadOffer]);

  const basePrice = Number(offer?.price ?? 0);
  const travel = Number(offer?.travel_fee ?? 0);
  const subtotalPreview = basePrice + travel;

  const pollForBooking = useCallback(async (): Promise<string | null> => {
    for (let i = 0; i < 30; i += 1) {
      try {
        const state = await api.get<{ booking_id?: string | null }>(`/api/me/custom-offers/${offerId}`);
        const bookingId = (state.data as { booking_id?: string | null } | undefined)?.booking_id ?? null;
        if (bookingId) return bookingId;
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  }, [offerId]);

  const runAcceptThenNavigate = useCallback(
    async (body: {
      payment_option: "full" | "deposit";
      payment_method_id?: string;
      callback_url?: string;
    }) => {
      if (!offerId) return;
      setProcessingPayment(true);
      setProcessingMessage(
        body.payment_method_id ? "Charging your card…" : "Opening secure payment…",
      );
      try {
        const res = await api.post<{
          charged?: boolean;
          paymentUrl?: string;
          payment_url?: string;
          total_amount?: number;
          deposit_amount?: number;
          payment_option?: string;
        }>(`/api/me/custom-offers/${offerId}/accept`, body);

        if (res.error) {
          setProcessingPayment(false);
          Alert.alert("Payment failed", getApiErrorMessage(res.error, "Could not start payment"));
          return;
        }

        const data = res.data;
        if (data?.charged) {
          const bookingId = await pollForBooking();
          await refreshSavedCards().catch(() => {});
          haptic.success();
          setProcessingPayment(false);
          if (bookingId) {
            setSuccessOverlay({
              rows: [
                {
                  icon: "pricetag-outline",
                  label: "Offer",
                  value: offer?.request?.service_name || "Custom offer",
                },
                {
                  icon: "checkmark-done-outline",
                  label: "Status",
                  value: "Paid — booking confirmed",
                },
              ],
            });
            setTimeout(() => {
              router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId } });
            }, 2200);
          } else {
            Alert.alert(
              "Payment received",
              "Your payment was received. Your booking may take a moment to appear.",
              [{ text: "OK", onPress: () => router.back() }],
            );
          }
          return;
        }

        const url = data?.paymentUrl || data?.payment_url;
        if (!url) {
          setProcessingPayment(false);
          Alert.alert("Payment failed", "No payment link returned from server.");
          return;
        }

        const paystackReturnPath =
          Platform.OS === "web" ? undefined : ExpoLinking.createURL("custom-offer-paystack");

        if (Platform.OS === "web") {
          setProcessingPayment(false);
          window.location.href = url;
          return;
        }

        setProcessingMessage("Confirming payment…");
        const browserResult = await WebBrowser.openAuthSessionAsync(url, paystackReturnPath ?? "");
        let reference: string | null = null;
        if (browserResult.type === "success" && browserResult.url) {
          try {
            const parsed = ExpoLinking.parse(browserResult.url);
            const q = parsed.queryParams ?? {};
            const ref = q.reference ?? q.trxref;
            reference = Array.isArray(ref) ? ref[0] ?? null : typeof ref === "string" ? ref : null;
          } catch {
            reference = null;
          }
        }
        if (reference) {
          await api.get(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`).catch(() => {});
        }

        let bookingId: string | null = await pollForBooking();
        if (!bookingId) {
          await new Promise((r) => setTimeout(r, 1500));
          bookingId = await pollForBooking();
        }

        setProcessingPayment(false);
        if (bookingId) {
          haptic.success();
          setSuccessOverlay({
            rows: [
              {
                icon: "pricetag-outline",
                label: "Offer",
                value: offer?.request?.service_name || "Custom offer",
              },
              {
                icon: "checkmark-done-outline",
                label: "Status",
                value: "Paid — booking confirmed",
              },
            ],
          });
          setTimeout(() => {
            router.replace({ pathname: "/(app)/booking-detail", params: { id: bookingId! } });
          }, 2200);
        } else {
          Alert.alert(
            "Processing",
            "If you completed payment, your booking will appear shortly. You can check Bookings in your profile.",
            [{ text: "OK", onPress: () => router.back() }],
          );
        }
      } catch (e) {
        setProcessingPayment(false);
        Alert.alert("Error", e instanceof Error ? e.message : "Payment failed");
      }
    },
    [offerId, offer?.request?.service_name, pollForBooking, refreshSavedCards, router],
  );

  const handlePay = useCallback(async () => {
    if (!offer || !user?.email) {
      Alert.alert("Sign in required", "Please sign in to pay.");
      return;
    }
    if (offer.status === "paid" || offer.booking_id) {
      router.replace({ pathname: "/(app)/booking-detail", params: { id: offer.booking_id! } });
      return;
    }

    const opt =
      providerRequiresDeposit && paymentOption === "deposit" ? "deposit" : "full";

    if (
      !useNewCard &&
      selectedCardId &&
      savedCards.some((c) => c.id === selectedCardId)
    ) {
      await runAcceptThenNavigate({
        payment_option: opt,
        payment_method_id: selectedCardId,
      });
      return;
    }

    const callbackUrl =
      Platform.OS === "web" ? undefined : ExpoLinking.createURL("custom-offer-paystack");
    await runAcceptThenNavigate({
      payment_option: opt,
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    });
  }, [
    offer,
    user?.email,
    providerRequiresDeposit,
    paymentOption,
    useNewCard,
    selectedCardId,
    savedCards,
    runAcceptThenNavigate,
    router,
  ]);

  const header = useMemo(
    () => (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: contentPadding,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderBottomWidth: 1,
          borderBottomColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }} accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontWeight: "700", color: "#111827" }}>Pay custom offer</Text>
      </View>
    ),
    [contentPadding, router],
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
        {header}
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !offer) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
        {header}
        <View style={{ flex: 1, padding: contentPadding, justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: "#6B7280", textAlign: "center" }}>{loadError || "Offer unavailable"}</Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginTop: 20,
              alignSelf: "center",
              paddingVertical: 12,
              paddingHorizontal: 24,
              backgroundColor: PRIMARY,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (offer.status === "paid" && offer.booking_id) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
        {header}
        <View style={{ flex: 1, padding: contentPadding, justifyContent: "center" }}>
          <Text style={{ fontSize: 16, color: "#374151", textAlign: "center" }}>
            This offer is already paid.{"\n"}Open your booking to view details.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace({ pathname: "/(app)/booking-detail", params: { id: offer.booking_id! } })}
            style={{
              marginTop: 20,
              alignSelf: "center",
              paddingVertical: 12,
              paddingHorizontal: 24,
              backgroundColor: PRIMARY,
              borderRadius: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>View booking</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F9FAFB" }} edges={["top"]}>
      {header}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 120 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 8 }}>
            {offer.request?.service_name || "Custom offer"}
          </Text>
          <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
            Final total includes taxes & fees — shown when you pay.
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <Text style={{ color: "#6B7280" }}>Service</Text>
            <Text style={{ fontWeight: "600", color: "#111827" }}>{fmt(basePrice)}</Text>
          </View>
          {travel > 0 ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ color: "#6B7280" }}>Travel</Text>
              <Text style={{ fontWeight: "600", color: "#111827" }}>{fmt(travel)}</Text>
            </View>
          ) : null}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: "#E5E7EB",
            }}
          >
            <Text style={{ fontWeight: "700", color: "#111827" }}>Subtotal (estimate)</Text>
            <Text style={{ fontWeight: "700", color: PRIMARY }}>{fmt(subtotalPreview)}</Text>
          </View>
        </View>

        {providerRequiresDeposit ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>Payment amount</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setPaymentOption("full")}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: paymentOption === "full" ? PRIMARY : "#E5E7EB",
                  backgroundColor: paymentOption === "full" ? "rgba(255,0,119,0.06)" : "#fff",
                }}
              >
                <Text style={{ fontWeight: "700", color: "#111827", textAlign: "center" }}>Pay in full</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPaymentOption("deposit")}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: paymentOption === "deposit" ? PRIMARY : "#E5E7EB",
                  backgroundColor: paymentOption === "deposit" ? "rgba(255,0,119,0.06)" : "#fff",
                }}
              >
                <Text style={{ fontWeight: "700", color: "#111827", textAlign: "center" }}>
                  Deposit ({depositPct}%)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {savedCards.length > 0 ? (
          <View style={{ backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 12 }}>Payment method</Text>
            {savedCards.map((c) => {
              const active = !useNewCard && selectedCardId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => {
                    setSelectedCardId(c.id);
                    setUseNewCard(false);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 12,
                    borderRadius: 10,
                    borderWidth: 1.5,
                    borderColor: active ? PRIMARY : "#E5E7EB",
                    marginBottom: 8,
                  }}
                >
                  <Ionicons name="card-outline" size={20} color="#6B7280" style={{ marginRight: 10 }} />
                  <Text style={{ flex: 1, fontWeight: "600", color: "#374151" }}>
                    {c.card_type ?? "Card"} ··· {c.last4}
                  </Text>
                  {c.is_default ? (
                    <Text style={{ fontSize: 11, color: PRIMARY, fontWeight: "700" }}>DEFAULT</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => {
                setUseNewCard(true);
                setSelectedCardId(null);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: useNewCard ? PRIMARY : "#E5E7EB",
              }}
            >
              <Ionicons name="globe-outline" size={20} color="#6B7280" style={{ marginRight: 10 }} />
              <Text style={{ flex: 1, fontWeight: "600", color: "#374151" }}>Pay with a new card (secure browser)</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: contentPadding,
          paddingVertical: 14,
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: "#F3F4F6",
        }}
      >
        <TouchableOpacity
          onPress={() => void handlePay()}
          disabled={processingPayment}
          style={{
            backgroundColor: PRIMARY,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: processingPayment ? 0.75 : 1,
          }}
        >
          {processingPayment ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 17, fontWeight: "700" }}>
              {providerRequiresDeposit && paymentOption === "deposit" ? "Pay deposit" : "Pay now"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <PaymentProcessingOverlay visible={processingPayment} message={processingMessage} />

      <PaymentSuccessOverlay
        visible={Boolean(successOverlay)}
        title="Payment successful"
        subtitle="Your booking is being confirmed…"
        summaryRows={successOverlay?.rows}
        onDismiss={() => setSuccessOverlay(null)}
      />
    </SafeAreaView>
  );
}
