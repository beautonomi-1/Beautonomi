import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentTabs } from "@/components/ui/SegmentTabs";
import { SettingsBusinessContent } from "./_components/settings-content";
import { SubscriptionContent } from "./subscription";
import { BillingHistoryContent } from "./billing-history";
import { useTranslation } from "@beautonomi/i18n";
import { useApi } from "@/hooks/useApi";
import { twStyle } from "@/lib/twStyle";

export default function SettingsHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const sh = (key: string) => t(`provider.mobile.screens.settingsHub.${key}`) as string;
  const [activeKey, setActiveKey] = useState("business");
  const { data: invMeta } = useApi<{
    obligations_summary?: { due_count?: number };
  }>("/api/provider/invoices?page=1&limit=1", { staleTimeMs: 60_000 });
  const hasAmountsDue = (invMeta?.obligations_summary?.due_count ?? 0) > 0;
  const tabs = [
    { key: "business", label: sh("tabBusiness") },
    { key: "subscription", label: sh("tabSubscription") },
    { key: "billing", label: sh("tabBilling") },
  ];

  return (
    <ScreenContainer scrollable={false}>
      <ScreenHeader title={sh("title")} showBack subtitle={sh("subtitle")} />
      <View style={{ marginBottom: 16 }}>
        <SegmentTabs tabs={tabs} activeKey={activeKey} onSelect={setActiveKey} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        {activeKey === "business" && <SettingsBusinessContent />}
        {activeKey === "subscription" && <SubscriptionContent />}
        {activeKey === "billing" && (
          <View style={{ flex: 1, minHeight: 0 }}>
            {hasAmountsDue ? (
              <View style={twStyle("mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3")}>
                <Text style={twStyle("text-sm text-gray-800")}>{sh("amountsDueBanner")}</Text>
                <TouchableOpacity
                  style={twStyle("mt-2 self-start rounded-lg bg-indigo-600 px-3 py-2")}
                  onPress={() => router.push("/(app)/(tabs)/more/billing?tab=invoices")}
                >
                  <Text style={twStyle("text-sm font-semibold text-white")}>{sh("amountsDueCta")}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <BillingHistoryContent />
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}
