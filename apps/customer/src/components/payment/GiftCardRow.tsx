import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@beautonomi/i18n";
import { formatMoney } from "@beautonomi/utils";
import { Colors } from "@/constants/colors";
import { copyGiftCardCode, shareGiftCard } from "@/lib/gift-card-share";

export type GiftCardLike = {
  id: string;
  code?: string | null;
  balance?: number | null;
  currency?: string | null;
  expires_at?: string | null;
};

function maskCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length <= 6) return trimmed;
  return `•••• ${trimmed.slice(-6)}`;
}

function formatExpiry(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

export function GiftCardRow({
  card,
  fallbackCurrency,
  onRedeemToWallet,
}: {
  card: GiftCardLike;
  fallbackCurrency: string;
  onRedeemToWallet?: (card: GiftCardLike) => void;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const currency = String(card.currency ?? fallbackCurrency);
  const balanceNum = Number(card.balance ?? 0);
  const balanceLabel = formatMoney(balanceNum, currency);
  const code = (card.code ?? "").trim();
  const expiry = formatExpiry(card.expires_at);
  const isRedeemable = balanceNum > 0;

  const handleCopy = async () => {
    await copyGiftCardCode(code, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <View
      style={{
        backgroundColor: Colors.white,
        borderWidth: 1,
        borderColor: Colors.gray[200],
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
          <Ionicons name="gift" size={20} color={Colors.primary} />
          <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
            {balanceLabel}
          </Text>
        </View>
        {!isRedeemable ? (
          <View
            style={{
              backgroundColor: Colors.gray[100],
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontSize: 11, color: Colors.gray[500], fontWeight: "600" }}>
              {t("customer.paymentsScreen.giftCardUsed", "Used")}
            </Text>
          </View>
        ) : null}
      </View>

      {code ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,
            backgroundColor: Colors.gray[50],
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text
            selectable
            style={{
              flex: 1,
              fontSize: 15,
              letterSpacing: 1,
              color: Colors.gray[900],
              fontWeight: "600",
            }}
          >
            {revealed ? code : maskCode(code)}
          </Text>
          <TouchableOpacity
            onPress={() => setRevealed((v) => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ paddingHorizontal: 6 }}
            accessibilityRole="button"
            accessibilityLabel={
              revealed
                ? (t("customer.paymentsScreen.giftCardHide", "Hide code") as string)
                : (t("customer.paymentsScreen.giftCardShow", "Show code") as string)
            }
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={Colors.gray[500]}
            />
          </TouchableOpacity>
        </View>
      ) : null}

      {expiry ? (
        <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 8 }}>
          {t("customer.paymentsScreen.expiresSuffix", { date: expiry })}
        </Text>
      ) : null}

      {code ? (
        <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
          <TouchableOpacity
            onPress={handleCopy}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: Colors.gray[200],
              borderRadius: 10,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={t("customer.paymentsScreen.giftCardCopy", "Copy code") as string}
          >
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={16}
              color={copied ? "#16a34a" : Colors.gray[700]}
            />
            <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: copied ? "#16a34a" : Colors.gray[700] }}>
              {copied
                ? (t("customer.paymentsScreen.giftCardCopied", "Copied") as string)
                : (t("customer.paymentsScreen.giftCardCopy", "Copy code") as string)}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              void shareGiftCard({
                code,
                balance: balanceNum,
                currency,
                expiresAt: card.expires_at ?? null,
              })
            }
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: Colors.gray[200],
              borderRadius: 10,
              paddingVertical: 8,
              paddingHorizontal: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={t("customer.paymentsScreen.giftCardShare", "Share gift card") as string}
          >
            <Ionicons name="share-social-outline" size={16} color={Colors.gray[700]} />
            <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "600", color: Colors.gray[700] }}>
              {t("customer.paymentsScreen.giftCardShare", "Share")}
            </Text>
          </TouchableOpacity>

          {isRedeemable && onRedeemToWallet ? (
            <TouchableOpacity
              onPress={() => onRedeemToWallet(card)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                paddingVertical: 8,
                paddingHorizontal: 12,
                backgroundColor: Colors.primary,
              }}
              accessibilityRole="button"
              accessibilityLabel={t("customer.paymentsScreen.giftCardRedeem", "Redeem to wallet") as string}
            >
              <Ionicons name="wallet-outline" size={16} color={Colors.white} />
              <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "700", color: Colors.white }}>
                {t("customer.paymentsScreen.giftCardRedeem", "To wallet")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
