import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { twStyle } from "@/lib/twStyle";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { usePaycloudFeatureEnabled } from "@/hooks/usePaycloudFeatureEnabled";
import { useProviderStackBack } from "@/lib/provider-tab-navigation";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

const SETUP_ITEMS = [
  {
    icon: "business-outline" as const,
    labelKey: "provider.mobile.screens.paymentSetup.payoutBankAccountsLabel",
    subtitleKey: "provider.mobile.screens.paymentSetup.payoutBankAccountsSubtitle",
    route: "/(app)/(tabs)/more/settings/payout-accounts",
    color: "#059669",
    flag: null as string | null,
  },
  {
    icon: "phone-portrait-outline" as const,
    labelKey: "provider.mobile.screens.paymentSetup.yocoPaymentsLabel",
    subtitleKey: "provider.mobile.screens.paymentSetup.yocoPaymentsSubtitle",
    route: "/(app)/(tabs)/more/settings/yoco-devices",
    color: "#2563eb",
    flag: "payment_yoco",
  },
  {
    icon: "hardware-chip-outline" as const,
    labelKey: "provider.mobile.screens.paymentSetup.cardMachinesLabel",
    subtitleKey: "provider.mobile.screens.paymentSetup.cardMachinesSubtitle",
    route: "/(app)/(tabs)/more/card-machines",
    color: "#7c3aed",
    flag: "payment_paycloud",
  },
  {
    icon: "qr-code-outline" as const,
    labelKey: "provider.mobile.screens.paymentSetup.paystackTerminalLabel",
    subtitleKey: "provider.mobile.screens.paymentSetup.paystackTerminalSubtitle",
    route: "/(app)/(tabs)/more/paystack-terminal",
    color: "#16a34a",
    flag: "payment_paystack_virtual_terminal",
  },
  {
    icon: "gift-outline" as const,
    labelKey: "provider.mobile.screens.paymentSetup.giftCardsLabel",
    subtitleKey: "provider.mobile.screens.paymentSetup.giftCardsSubtitle",
    route: "/(app)/(tabs)/more/gift-cards",
    color: "#a855f7",
    flag: null,
  },
  {
    icon: "hardware-chip-outline" as const,
    labelKey: "provider.mobile.screens.paymentSetup.terminalShopLabel",
    subtitleKey: "provider.mobile.screens.paymentSetup.terminalShopSubtitle",
    route: "/(app)/(tabs)/more/terminal-shop",
    color: "#db2777",
    flag: "terminal_ecommerce_enabled",
  },
];

export default function PaymentSetupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const handleBack = useProviderStackBack();
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = usePaycloudFeatureEnabled();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const terminalEcommerceEnabled = useFeatureFlag("terminal_ecommerce_enabled");
  const terminalCatalogEnabled = useFeatureFlag("terminal_product_catalog_enabled");
  const terminalShopEnabled = terminalEcommerceEnabled || terminalCatalogEnabled;

  const visibleItems = SETUP_ITEMS.filter((item) => {
    if (item.flag === "payment_yoco") return yocoEnabled;
    if (item.flag === "payment_paycloud") return paycloudEnabled;
    if (item.flag === "payment_paystack_virtual_terminal") return paystackTerminalEnabled;
    if (item.flag === "terminal_ecommerce_enabled") return terminalShopEnabled;
    return true;
  });

  return (
    <ScreenContainer>
      <ScreenHeader
        title={t("provider.mobile.screens.paymentSetup.title")}
        subtitle={t("provider.mobile.screens.paymentSetup.subtitle")}
        showBack
        onBack={handleBack}
      />
      {visibleItems.map((item) => {
        const itemLabel = t(item.labelKey);
        const itemSubtitle = t(item.subtitleKey);
        return (
        <TouchableOpacity
          key={item.route}
          onPress={() => router.push(item.route as never)}
          style={twStyle("mb-3 flex-row items-center rounded-2xl border border-gray-200 bg-white p-4")}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${itemLabel}. ${itemSubtitle}`}
        >
          <View
            style={[twStyle("h-10 w-10 items-center justify-center rounded-2xl"), { backgroundColor: `${item.color}20` }]}
          >
            <Ionicons name={item.icon} size={22} color={item.color} />
          </View>
          <View style={twStyle("ms-3 flex-1")}>
            <Text style={twStyle("font-semibold text-gray-900")}>{itemLabel}</Text>
            <Text style={twStyle("text-xs text-gray-500")}>{itemSubtitle}</Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={20} color="#9ca3af" />
        </TouchableOpacity>
        );
      })}
    </ScreenContainer>
  );
}
