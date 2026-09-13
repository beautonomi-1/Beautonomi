import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { twStyle } from "@/lib/twStyle";
import {
  ProviderPaymentSuccessCard,
  type ProviderPaymentSummaryRow,
} from "@/components/payment/ProviderPaymentSuccessCard";
import { downloadPdf } from "@/lib/pdf-file";
import { getDefaultMoneyLocale } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";

/** Auto-return delay so the user lands back in the app like the booking success flow. */
const AUTO_RETURN_MS = 3200;

function pickStr(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0].trim() : "";
  return "";
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(getDefaultMoneyLocale(), { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export default function AdsPaymentSuccessScreen() {
  const { t } = useTranslation();
  const ads = (key: string) => t(`provider.mobile.screens.adsPaymentSuccess.${key}`) as string;
  const router = useRouter();
  const params = useLocalSearchParams<{
    campaign_id?: string;
    order_id?: string;
    reference?: string;
    amount?: string;
    currency?: string;
    product_label?: string;
    title?: string;
    body?: string;
  }>();
  const campaignId = pickStr(params.campaign_id);
  const orderId = pickStr(params.order_id);
  const reference = pickStr(params.reference);
  const amountRaw = pickStr(params.amount);
  const currency = pickStr(params.currency) || "ZAR";
  const productLabel = pickStr(params.product_label);
  const title = pickStr(params.title) || ads("defaultTitle");
  const body = pickStr(params.body) || ads("defaultBody");

  const amount = amountRaw ? Number(amountRaw) : NaN;
  const hasAmount = Number.isFinite(amount);

  const summaryRows = useMemo((): ProviderPaymentSummaryRow[] => {
    const rows: ProviderPaymentSummaryRow[] = [];
    if (productLabel) {
      rows.push({ icon: "megaphone-outline", label: ads("product"), value: productLabel });
    }
    if (hasAmount) {
      rows.push({ icon: "cash-outline", label: ads("amountPaid"), value: formatMoney(amount, currency) });
    }
    if (reference) {
      rows.push({
        icon: "document-text-outline",
        label: ads("paymentReference"),
        value: reference,
        valueSelectable: true,
      });
    }
    if (orderId) {
      rows.push({
        icon: "receipt-outline",
        label: ads("order"),
        value: orderId.slice(0, 8) + "…",
        valueSelectable: true,
      });
    }
    return rows;
  }, [productLabel, hasAmount, amount, currency, reference, orderId, t]);

  const adsParams = useMemo(() => {
    const query: Record<string, string> = { payment_success: "1" };
    if (campaignId) query.campaign_id = campaignId;
    return query;
  }, [campaignId]);

  const navigatedRef = useRef(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const goToAds = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace({
      pathname: "/(app)/(tabs)/more/settings/ads",
      params: adsParams,
    });
  }, [adsParams, router]);

  const goToDashboard = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace({ pathname: "/(app)/(tabs)/dashboard" });
  }, [router]);

  const downloadReceipt = useCallback(async () => {
    if (!orderId) {
      Alert.alert(ads("receiptUnavailableTitle"), ads("receiptUnavailableBody"));
      return;
    }
    setDownloadingReceipt(true);
    navigatedRef.current = true;
    try {
      await downloadPdf({
        router,
        pdfPath: `/api/provider/ads/orders/${orderId}/receipt/pdf`,
        signedUrlPath: `/api/provider/ads/orders/${orderId}/receipt/signed-url`,
        filename: `ad-receipt-${orderId}.pdf`,
        title: ads("receipt"),
      });
    } finally {
      setDownloadingReceipt(false);
    }
  }, [orderId, router, t]);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const timer = setTimeout(goToAds, AUTO_RETURN_MS);
    return () => clearTimeout(timer);
  }, [goToAds]);

  return (
    <ScreenContainer scrollable={false}>
      <LinearGradient
        colors={["#ecfdf5", "#ffffff", "#f8fafc"]}
        style={twStyle("flex-1 items-center justify-center px-6")}
      >
        <ProviderPaymentSuccessCard
          title={title}
          body={body}
          summaryRows={summaryRows.length > 0 ? summaryRows : undefined}
          footerHint={ads("footerHint")}
        />
        <View style={twStyle("mt-4 w-full max-w-sm gap-3")}>
          <TouchableOpacity
            onPress={goToAds}
            style={twStyle("w-full items-center rounded-2xl bg-emerald-600 px-5 py-4")}
            accessibilityRole="button"
            accessibilityLabel={ads("viewAdsDashboard")}
          >
            <Text style={twStyle("text-sm font-bold text-white")}>{ads("viewAdsDashboard")}</Text>
          </TouchableOpacity>
          {orderId ? (
            <TouchableOpacity
              onPress={() => void downloadReceipt()}
              disabled={downloadingReceipt}
              style={twStyle("w-full flex-row items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-5 py-3.5")}
              accessibilityRole="button"
              accessibilityLabel={ads("downloadReceipt")}
            >
              <Ionicons name="download-outline" size={16} color="#047857" />
              <Text style={twStyle("text-sm font-semibold text-emerald-700")}>
                {downloadingReceipt ? ads("openingReceipt") : ads("downloadReceipt")}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={goToDashboard}
            style={twStyle("w-full items-center rounded-2xl px-5 py-3")}
            accessibilityRole="button"
            accessibilityLabel={ads("goToDashboard")}
          >
            <Text style={twStyle("text-sm font-semibold text-gray-500")}>{ads("goToDashboard")}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </ScreenContainer>
  );
}
