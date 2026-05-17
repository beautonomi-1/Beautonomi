import { useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import { useInAppPaystackCheckout } from "@/hooks/useInAppPaystackCheckout";
import {
  extractPaystackReferenceFromUrl,
  isCancelledPaystackUrl,
  matchesExpoReturnUrl,
} from "@/lib/paystack-webview-utils";
import * as ExpoLinking from "expo-linking";
import { api } from "@/lib/api-client";
import { verifyPaystackWithRetry } from "@/lib/payments/verifyPaystackWithRetry";
import { getApiErrorMessage } from "@/lib/api-error";
import { useScreenTracking } from "@/hooks/useScreenTracking";
import { useResponsive } from "@/hooks/useResponsive";
import { Colors } from "@/constants/colors";
import { getTenantDefaultCurrency } from "@/lib/config-bundle";
import { formatMoney } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";
import { useAuth } from "@/providers/AuthProvider";
import { useSavedCards } from "@/hooks/useSavedCards";
import { usePaystackPayment } from "@/hooks/usePaystackPayment";
import { PaymentProcessingOverlay } from "@/components/payment/PaymentProcessingOverlay";
import { PaymentSuccessOverlay, type PaymentSuccessSummaryRow } from "@/components/payment/PaymentSuccessOverlay";
import { GiftCardPaymentConfirmSheet } from "@/components/payment/GiftCardPaymentConfirmSheet";

const AMOUNTS = [100, 250, 500, 1000, 2500, 5000];

export default function GiftCardPurchaseScreen() {
  useScreenTracking("Gift Card Purchase");
  const { t } = useTranslation();
  const errTitle = t("customer.mobile.screens.authLogin.errorTitle");
  const gc = useCallback(
    (key: string, options?: Record<string, string | number>) => {
      const fullKey = `customer.mobile.screens.giftCardPurchase.${key}`;
      return (options != null ? t(fullKey, options as never) : t(fullKey)) as string;
    },
    [t],
  );
  const router = useRouter();
  const { user } = useAuth();
  const { provider_name } = useLocalSearchParams<{ provider_name?: string }>();
  const tenantCurrency = getTenantDefaultCurrency();
  const { contentPadding, contentMaxWidth, isTablet } = useResponsive();
  const constraint = (isTablet || Platform.OS === "web") ? { maxWidth: Math.min(500, contentMaxWidth), alignSelf: "center" as const, width: "100%" as const } : {};
  const [amount, setAmount] = useState<number>(250);
  const [customAmount, setCustomAmount] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { cards: savedCards, defaultCard } = useSavedCards(!!user);
  const { payWithSavedCard } = usePaystackPayment();
  const paystackHostedCheckout = useInAppPaystackCheckout();
  const [showConfirm, setShowConfirm] = useState(false);
  const [useNewCard, setUseNewCard] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("Processing payment…");
  const [successState, setSuccessState] = useState<"issued" | "pending" | null>(null);
  const [issuedGiftCardCodes, setIssuedGiftCardCodes] = useState<string[]>([]);

  const finalAmount = customAmount ? parseFloat(customAmount) || 0 : amount;
  const total = finalAmount * quantity;

  useEffect(() => {
    if (savedCards.length > 0 && defaultCard?.id) {
      setUseNewCard(false);
    } else if (savedCards.length === 0) {
      setUseNewCard(true);
    }
  }, [savedCards.length, defaultCard?.id]);

  const pollNewGiftCards = useCallback(
    async (
      existingGiftCardIds: Set<string>,
    ): Promise<{ found: boolean; codes: string[] }> => {
      for (let attempt = 0; attempt < 10; attempt++) {
        const cards = await api.get<{ gift_cards?: { id?: string; code?: string }[] }>("/api/me/gift-cards").catch(
          () => null,
        );
        const list = cards?.data?.gift_cards;
        if (Array.isArray(list)) {
          const newRows = list.filter(
            (card) =>
              typeof card.id === "string" &&
              typeof card.code === "string" &&
              card.code.trim().length > 0 &&
              !existingGiftCardIds.has(card.id),
          );
          if (newRows.length > 0) {
            const codes = newRows.map((c) => c.code!.trim()).sort((a, b) => a.localeCompare(b));
            return { found: true, codes };
          }
        }
        if (attempt < 9) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      return { found: false, codes: [] };
    },
    [],
  );

  const executePurchase = useCallback(
    async (withSavedCard: boolean) => {
      if (finalAmount <= 0) return;
      if (!user?.email?.trim()) {
        Alert.alert(errTitle, gc("signInToPurchase") || "Please sign in to buy a gift card.");
        return;
      }

      const savedCardId = withSavedCard ? defaultCard?.id ?? savedCards[0]?.id : null;
      if (withSavedCard && !savedCardId) {
        Alert.alert(errTitle, gc("noSavedCard") || "No saved card found. Pay with a new card instead.");
        return;
      }

      setIssuedGiftCardCodes([]);
      setLoading(true);
      setProcessingPayment(true);
      setProcessingMessage(gc("preparingPayment") || "Preparing payment…");
      try {
        const beforeCards = await api.get<{ gift_cards?: { id?: string }[] }>("/api/me/gift-cards").catch(() => null);
        const existingGiftCardIds = new Set(
          (beforeCards?.data?.gift_cards ?? [])
            .map((card) => card.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        );
        const body: Record<string, unknown> = { amount: finalAmount, quantity, currency: tenantCurrency };
        if (recipientEmail.trim()) {
          body.recipient_email = recipientEmail.trim();
        }
        if (Platform.OS !== "web") {
          body.callback_url = ExpoLinking.createURL("account-settings/payments");
        }
        const res = await api.post<{ order_id?: string; payment_url?: string; reference?: string; data?: { order_id?: string; payment_url?: string; reference?: string } }>(
          "/api/public/gift-cards/purchase",
          body,
        );
        if (res.error) {
          Alert.alert(errTitle, getApiErrorMessage(res.error, gc("startPurchaseError")));
          return;
        }
        const raw = res.data as Record<string, unknown> | undefined;
        const nested = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : null;
        const orderId =
          (typeof raw?.order_id === "string" && raw.order_id) ||
          (nested && typeof nested.order_id === "string" && nested.order_id) ||
          "";
        const paymentUrl =
          (typeof raw?.payment_url === "string" && raw.payment_url) ||
          (nested && typeof nested.payment_url === "string" && nested.payment_url) ||
          "";
        let reference =
          (typeof raw?.reference === "string" && raw.reference) ||
          (nested && typeof nested.reference === "string" && nested.reference) ||
          null;

        if (!orderId) {
          Alert.alert(errTitle, gc("paymentLinkUnavailable"));
          return;
        }

        if (withSavedCard && savedCardId) {
          setProcessingMessage(gc("processingPayment") || "Processing payment…");
          const charge = await payWithSavedCard({
            payment_method_id: savedCardId,
            amount: total,
            email: user.email!,
            currency: tenantCurrency,
            metadata: {
              gift_card_order_id: orderId,
              type: "gift_card_order",
            },
          });
          if (!charge.success) {
            Alert.alert(
              errTitle,
              gc("savedCardChargeFailed") || "We could not charge your saved card. Try paying with a new card.",
            );
            return;
          }
          const ref = typeof charge.reference === "string" ? charge.reference.trim() : "";
          if (ref) {
            setProcessingMessage(gc("confirmingPayment") || "Confirming your payment…");
            await verifyPaystackWithRetry(ref);
          }
          const pollResult = await pollNewGiftCards(existingGiftCardIds);
          setIssuedGiftCardCodes(pollResult.codes);
          setSuccessState(pollResult.found ? "issued" : "pending");
          return;
        }

        if (!paymentUrl) {
          Alert.alert(errTitle, gc("paymentLinkUnavailable"));
          return;
        }

        setProcessingMessage(gc("openingPaymentPage") || "Opening payment page…");
        if (Platform.OS !== "web") {
          const returnUrl = ExpoLinking.createURL("account-settings/payments");
          // Important: close blocking overlay before opening Paystack WebView.
          // Concurrent RN modals can prevent checkout from appearing.
          setProcessingPayment(false);
          const pr = await paystackHostedCheckout.waitForCheckout(paymentUrl, {
            title: gc("securePaymentTitle") || "Secure payment",
            returnUrl,
            matchSuccess: (u) => matchesExpoReturnUrl(u, returnUrl) && !isCancelledPaystackUrl(u),
            matchCancel: (u) => isCancelledPaystackUrl(u),
          });
          if (pr.outcome === "cancel") {
            return;
          }
          if (pr.outcome === "success" && pr.url && !isCancelledPaystackUrl(pr.url)) {
            const extracted = extractPaystackReferenceFromUrl(pr.url);
            if (extracted) reference = extracted;
          }
        } else {
          await Linking.openURL(paymentUrl);
        }

        setProcessingPayment(true);
        setProcessingMessage(gc("confirmingPayment") || "Confirming your payment…");
        if (reference) {
          await verifyPaystackWithRetry(reference);
        }
        const pollResult = await pollNewGiftCards(existingGiftCardIds);
        setIssuedGiftCardCodes(pollResult.codes);
        setSuccessState(pollResult.found ? "issued" : "pending");
      } catch (e) {
        Alert.alert(errTitle, getApiErrorMessage(e, gc("purchaseFailed")));
      } finally {
        setLoading(false);
        setProcessingPayment(false);
      }
    },
    [
      finalAmount,
      quantity,
      tenantCurrency,
      user,
      errTitle,
      gc,
      pollNewGiftCards,
      payWithSavedCard,
      defaultCard?.id,
      savedCards,
      total,
      paystackHostedCheckout,
    ],
  );

  const onPayPress = () => {
    if (finalAmount <= 0 || loading || processingPayment) return;
    if (!user) {
      Alert.alert(errTitle, gc("signInToPurchase") || "Please sign in to buy a gift card.");
      return;
    }
    if (savedCards.length > 0) {
      setShowConfirm(true);
    } else {
      void executePurchase(false);
    }
  };

  const onConfirmSheet = () => {
    setShowConfirm(false);
    void executePurchase(!useNewCard);
  };

  const giftSuccessSummaryRows = useMemo((): PaymentSuccessSummaryRow[] => {
    const qtyTotalRows: PaymentSuccessSummaryRow[] = [
      { icon: "gift-outline", label: gc("quantityLabel"), value: String(quantity) },
      { icon: "cash-outline", label: gc("totalLabel"), value: formatMoney(total, tenantCurrency) },
    ];
    if (issuedGiftCardCodes.length === 0) return qtyTotalRows;
    const codeRows: PaymentSuccessSummaryRow[] = issuedGiftCardCodes.map((code, i) => ({
      icon: "pricetag-outline",
      label:
        issuedGiftCardCodes.length > 1
          ? gc("codeRowLabelNumbered", { number: String(i + 1) })
          : gc("codeRowLabel"),
      value: code,
      valueSelectable: true,
    }));
    return [...codeRows, ...qtyTotalRows];
  }, [issuedGiftCardCodes, quantity, total, tenantCurrency, gc]);

  return (
    <>
      <Stack.Screen
        options={{
          title: provider_name ? gc("screenTitleWithProvider", { providerName: String(provider_name) }) : gc("screenTitleBuy"),
          headerBackTitle: t("common.back"),
        }}
      />
      <PaymentProcessingOverlay visible={processingPayment} message={processingMessage} />
      <PaymentSuccessOverlay
        visible={successState !== null}
        title={successState === "issued" ? gc("giftCardReadyTitle") : gc("paymentPendingTitle")}
        subtitle={
          successState === "issued"
            ? issuedGiftCardCodes.length > 0
              ? gc("giftCardReadyBodyWithCodes")
              : gc("giftCardReadyBody")
            : gc("paymentPendingBody")
        }
        status={successState === "issued" ? "success" : "pending"}
        amountPaid={total}
        currency={tenantCurrency}
        summaryRows={giftSuccessSummaryRows}
        footerHint={gc("successFooterHint") || "Tap continue when you are ready to leave this screen."}
        onDismiss={() => {
          setSuccessState(null);
          setIssuedGiftCardCodes([]);
          router.back();
        }}
      />
      <GiftCardPaymentConfirmSheet
        visible={showConfirm}
        totalLabel={formatMoney(total, tenantCurrency)}
        summaryLine={gc("confirmSummary", { quantity: String(quantity) }) || `${quantity} gift card(s) · ${formatMoney(finalAmount, tenantCurrency)} each`}
        savedCards={savedCards}
        defaultCard={defaultCard}
        useNewCard={useNewCard}
        onUseNewCardChange={setUseNewCard}
        onConfirm={onConfirmSheet}
        onCancel={() => setShowConfirm(false)}
      />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: Colors.white }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: contentPadding, paddingBottom: 48, ...constraint }}>
          {provider_name ? (
            <Text style={{ fontSize: 14, color: Colors.gray[500], marginBottom: 16 }}>
              {gc("forRecipientLead")} <Text style={{ fontWeight: "600", color: Colors.gray[800] }}>{provider_name}</Text>
            </Text>
          ) : null}
          <Text style={{ fontSize: 18, fontWeight: "600", color: Colors.gray[900], marginBottom: 8 }}>
            {gc("selectAmountHeading", { currency: tenantCurrency })}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
            {AMOUNTS.map((a) => (
              <TouchableOpacity
                key={a}
                onPress={() => { setAmount(a); setCustomAmount(""); }}
                style={{ paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, backgroundColor: amount === a && !customAmount ? Colors.primary : Colors.white, borderColor: amount === a && !customAmount ? Colors.primary : Colors.gray[200], marginRight: 8, marginBottom: 8 }}
              >
                <Text style={{ fontWeight: "500", color: amount === a && !customAmount ? Colors.white : Colors.gray[700] }}>{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>{gc("customAmountLabel")}</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 16 }}
            placeholder={gc("amountPlaceholder")}
            placeholderTextColor={Colors.gray[400]}
            value={customAmount}
            onChangeText={(tx) => { setCustomAmount(tx); if (tx) setAmount(0); }}
            keyboardType="number-pad"
          />
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>{gc("quantityLabel")}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 24 }}>
            <TouchableOpacity onPress={() => setQuantity((q) => Math.max(1, q - 1))} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center", marginRight: 16 }}>
              <Text style={{ fontSize: 20, color: Colors.gray[700] }}>−</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: "600", color: Colors.gray[900], marginRight: 16 }}>{quantity}</Text>
            <TouchableOpacity onPress={() => setQuantity((q) => Math.min(10, q + 1))} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[100], alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20, color: Colors.gray[700] }}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 14, color: Colors.gray[600], marginBottom: 8 }}>Recipient Email (Optional)</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: Colors.gray[200], borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, marginBottom: 24 }}
            placeholder="Send directly to a friend"
            placeholderTextColor={Colors.gray[400]}
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <View style={{ backgroundColor: Colors.gray[50], borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <Text style={{ color: Colors.gray[600] }}>{gc("totalLabel")}</Text>
            <Text style={{ fontSize: 24, fontWeight: "700", color: Colors.gray[900] }}>{formatMoney(total, tenantCurrency)}</Text>
          </View>
          <TouchableOpacity onPress={onPayPress} disabled={finalAmount <= 0 || loading || processingPayment} style={{ backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center", opacity: finalAmount <= 0 || loading || processingPayment ? 0.5 : 1 }}>
            {loading && !processingPayment ? <ActivityIndicator color={Colors.white} /> : <Text style={{ color: Colors.white, fontWeight: "600", fontSize: 18 }}>{gc("payWithCard")}</Text>}
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: Colors.gray[500], textAlign: "center", marginTop: 16 }}>{gc("paymentRedirectHint")}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
      {paystackHostedCheckout.modal}
    </>
  );
}
