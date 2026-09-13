/**
 * Native fallback screen for More tab feature slugs.
 * Redirects known slugs to native routes and keeps unknown slugs in-app.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "@/hooks/useApi";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Colors } from "@/constants/colors";
import { useEffect } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";

interface SetupStatus {
  isComplete: boolean;
  completionPercentage: number;
  steps: { id: string; title: string; completed: boolean; link: string }[];
}

const SLUG_TITLE_KEYS: Record<string, string> = {
  "bookings-calendar-hub": "moreTab.qaBookings",
  "resources-forms-hub": "moreTab.resourcesFormsLabel",
  "custom-requests": "moreTab.qaCustomRequests",
  "routes": "moreSlug.titleRoutes",
  "products-ecommerce-hub": "moreTab.productsEcommerceLabel",
  "catalogue-offerings-hub": "moreTab.catalogueLabel",
  "team-hub": "moreTab.teamSchedulingLabel",
  "finance-billing-hub": "moreSlug.titleFinanceBilling",
  "transactions-hub": "moreSlug.titleTransactions",
  "reports": "moreTab.reportsLabel",
  "gallery": "moreTab.galleryLabel",
  "engagement-hub": "moreTab.engagementLabel",
  "waitlist": "moreSlug.titleWaitlist",
  "finance-hub": "moreSlug.titleFinance",
};

const SLUG_SUBTITLE_KEYS: Record<string, string> = {
  "resources-forms-hub": "moreTab.resourcesFormsSubtitle",
  "custom-requests": "moreTab.customRequestsSubtitle",
  "routes": "moreSlug.subtitleRoutes",
  "products-ecommerce-hub": "moreTab.productsEcommerceSubtitle",
  "catalogue-offerings-hub": "moreTab.catalogueSubtitle",
  "finance-billing-hub": "moreSlug.subtitleFinanceBilling",
  "transactions-hub": "moreSlug.subtitleTransactions",
  "reports": "moreTab.reportsSubtitle",
  "engagement-hub": "moreTab.engagementSubtitle",
  "finance-hub": "moreSlug.subtitleFinanceHub",
};

const SLUG_TO_NATIVE_ROUTE: Record<string, string> = {
  routes: "/(app)/(tabs)/more/routes",
  reports: "/(app)/(tabs)/more/reports",
  "finance-hub": "/(app)/(tabs)/more/finance",
  "finance-billing-hub": "/(app)/(tabs)/more/finance-billing-hub",
  "products-ecommerce-hub": "/(app)/(tabs)/more/products-ecommerce-hub",
  "catalogue-offerings-hub": "/(app)/(tabs)/more/catalogue",
  "custom-requests": "/(app)/(tabs)/more/custom-requests",
  /** Hub: resources + forms preview; full form CRUD is `more/forms`. */
  "resources-forms-hub": "/(app)/(tabs)/more/resources-forms-hub",
  "engagement-hub": "/(app)/(tabs)/more/engagement-hub",
  "bookings-calendar-hub": "/(app)/(tabs)/more/bookings",
  "team-hub": "/(app)/(tabs)/more/team",
};

export default function MoreSlugScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { data: setupStatus } = useApi<SetupStatus>("/api/provider/setup-status");
  const title = slug
    ? SLUG_TITLE_KEYS[slug]
      ? (t(`provider.mobile.screens.${SLUG_TITLE_KEYS[slug]}`) as string)
      : slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : (t("provider.mobile.screens.moreSlug.featureFallback") as string);
  const subtitle = slug && SLUG_SUBTITLE_KEYS[slug]
    ? (t(`provider.mobile.screens.${SLUG_SUBTITLE_KEYS[slug]}`) as string)
    : null;
  const showSetupBanner = setupStatus && !setupStatus.isComplete && setupStatus.completionPercentage < 100;
  const nativeRoute = slug ? SLUG_TO_NATIVE_ROUTE[slug] : null;

  useEffect(() => {
    if (!nativeRoute) return;
    router.replace(nativeRoute as never);
  }, [nativeRoute, router]);

  return (
    <ScreenContainer>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <View style={{ paddingHorizontal: 8, paddingTop: 16 }}>
        {showSetupBanner && (
          <TouchableOpacity
            onPress={() => router.push("/(app)/(tabs)/more/settings/setup-status" as never)}
            style={{ marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: "#c7d2fe", backgroundColor: "#eef2ff", padding: 14 }}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#4338ca" }}>{t("provider.mobile.screens.moreSlug.setupStatus")}</Text>
                <Text style={{ marginTop: 2, fontSize: 13, color: "#6366f1" }}>
                  {t("provider.mobile.screens.moreSlug.percentComplete", { percent: setupStatus.completionPercentage })}
                </Text>
              </View>
              <DirectionalIcon name="chevron-forward" size={20} color="#4338ca" />
            </View>
          </TouchableOpacity>
        )}
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[200], backgroundColor: Colors.gray[50], padding: 20 }}>
          <View style={{ marginBottom: 16, height: 48, width: 48, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: Colors.gray[200] }}>
            <Ionicons name="desktop-outline" size={24} color="#6b7280" />
          </View>
          <Text style={{ fontSize: 16, fontWeight: "500", color: Colors.gray[900] }}>{title}</Text>
          {subtitle && (
            <Text style={{ marginTop: 4, fontSize: 14, color: Colors.gray[600] }}>{subtitle}</Text>
          )}
          <Text style={{ marginTop: 16, fontSize: 14, color: Colors.gray[600], lineHeight: 20 }}>
            {t("provider.mobile.screens.moreSlug.nativeRolloutBody")}
          </Text>
          {nativeRoute && (
            <TouchableOpacity
              onPress={() => router.replace(nativeRoute as never)}
              style={{ marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: "#c7d2fe", backgroundColor: "#eef2ff", paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
            >
              <Ionicons name="arrow-forward-circle-outline" size={18} color="#4338ca" />
              <Text style={{ marginStart: 6, fontSize: 13, fontWeight: "600", color: "#4338ca" }}>{t("provider.mobile.screens.moreSlug.openNative")}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}
