import { useState, useCallback, useMemo, useEffect } from "react";
import { View, Text, TouchableOpacity, Alert, Platform, DeviceEventEmitter } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { getAppNativeVersion } from "@/lib/app-native-version";
import {
  resolveSetupStepRoute,
  type SetupNavStep,
} from "@/lib/setup-step-navigation";
import { useAuth } from "@/providers/AuthProvider";
import { useProvider } from "@/providers/ProviderContext";
import { useTranslation } from "@beautonomi/i18n";
import { useApi, MONEY_SURFACE_TIMEOUT_MS } from "@/hooks/useApi";
import { Colors } from "@/constants/colors";
import { ScreenContainer } from "@/components/ui/ScreenContainer";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { openNativeStoreReview } from "@/lib/open-store-review";
import { recordManualStoreReview } from "@/lib/store-review-prompt";
import { getAnalyticsClient } from "@/lib/analytics-rn";
import { formatCurrency } from "@/lib/format";
import { useFeatureFlag, useConfigBundle } from "@/providers/ConfigBundleProvider";
import { usePaycloudFeatureEnabled } from "@/hooks/usePaycloudFeatureEnabled";
import { usePayCloudSettings } from "@/hooks/usePayCloud";
import { PROVIDER_SETUP_STATUS_CHANGED } from "@/lib/setup-status-cache";
import { ProviderOrgSwitcher } from "@/components/ProviderOrgSwitcher";
import { StartOwnBusinessCard } from "@/components/StartOwnBusinessCard";
import { DirectionalIcon } from "@/components/ui/DirectionalIcon";
/**
 * Setup status API response (GET /api/provider/setup-status) — single source
 * of truth for the More-tab completion card, the Dashboard hero card, the
 * Setup checklist screen, and the Onboarding hub. Identical % everywhere.
 */
type SetupStatusStep = {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  required: boolean;
  /** Web route (informational on mobile). */
  link?: string;
  /** Canonical native route returned by the server. */
  native_route: string | null;
};
type SetupStatusData = {
  isComplete: boolean;
  completionPercentage: number;
  missing_steps?: string[];
  steps: SetupStatusStep[];
};

type FinanceSummaryData = {
  earnings?: {
    available_balance?: number;
    pending_payouts?: number;
    minimum_payout_amount?: number;
  };
};

type PayoutAccountSummary = {
  id: string;
  account_name?: string | null;
  bank_name?: string | null;
  account_number_last4?: string | null;
  account_number?: string | null;
  active?: boolean;
  is_primary?: boolean;
};

type PayoutScheduleData = {
  payout_schedule?: string;
  payout_hold_days?: number;
  next_payout_date?: string | null;
  next_payout_description?: string | null;
};

type TeamAccessData = {
  can_process_payments?: boolean;
  can_request_payouts?: boolean;
  is_business_owner?: boolean;
};

type ProviderNavCounts = {
  pending_bookings: number;
  active_product_orders: number;
  unread_messages: number;
  waiting_room: number;
  open_return_requests?: number;
  /** Custom service requests awaiting provider quote / response */
  pending_custom_requests?: number;
  critical_total: number;
};

function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}

/**
 * §provider-setup-seamless-ux 2026-05: the More-tab completion card now reads
 * from `/api/provider/setup-status` (canonical source of truth) and uses the
 * server-returned `native_route` per step. The previous client-side
 * `PROFILE_COMPLETION_ROUTE_MAP` was deleted; we keep only a defensive
 * fallback for steps whose `native_route` came back null or is a web path.
 *
 * When no native route is available we deep-link into the onboarding wizard
 * with `?focus=<id>` so the provider lands directly on the step that fixes
 * the missing field — matching the setup-status and Dashboard cards.
 */
function getStepNativeRoute(step: SetupStatusStep): string {
  return resolveSetupStepRoute(step as SetupNavStep);
}

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  labelKey?: string;
  subtitle?: string;
  subtitleKey?: string;
  route: string;
  color: string;
  bg: string;
}

const MENU_SECTIONS: { titleKey: string; items: MenuItem[] }[] = [
  {
    titleKey: "provider.mobile.screens.moreTab.sectionGrowBusiness",
    items: [
      {
        icon: "megaphone-outline",
        label: "Buy ads",
        labelKey: "provider.mobile.screens.moreTab.adsLabel",
        subtitle: "Sponsored listings, campaigns & reach",
        subtitleKey: "provider.mobile.screens.moreTab.adsSubtitle",
        route: "/(app)/(tabs)/more/settings/ads",
        color: "#d97706",
        bg: "#fffbeb",
      },
      {
        icon: "card-outline",
        label: "Sell memberships",
        labelKey: "provider.mobile.screens.moreTab.membershipsLabel",
        subtitle: "Plans, benefits, pricing & subscribers",
        subtitleKey: "provider.mobile.screens.moreTab.membershipsSubtitle",
        route: "/(app)/(tabs)/more/membership-plans",
        color: "#7c3aed",
        bg: "#ede9fe",
      },
      {
        icon: "pricetag-outline",
        label: "Promo codes",
        labelKey: "provider.mobile.screens.moreTab.promoCodesLabel",
        subtitle: "Your discounts—scoped to your bookings only",
        subtitleKey: "provider.mobile.screens.moreTab.promoCodesSubtitle",
        route: "/(app)/(tabs)/more/promotions",
        color: "#ea580c",
        bg: "#fff7ed",
      },
    ],
  },
  {
    titleKey: "provider.mobile.screens.moreTab.sectionOperations",
    items: [
      { icon: "book-outline", label: "Bookings & calendar", labelKey: "provider.mobile.screens.moreTab.bookingsCalendarLabel", subtitle: "Appointments, waitlist & schedule", subtitleKey: "provider.mobile.screens.moreTab.bookingsCalendarSubtitle", route: "/(app)/(tabs)/more/bookings", color: "#6366f1", bg: "#eef2ff" },
      { icon: "ban-outline", label: "Time blocks", labelKey: "provider.mobile.screens.moreTab.timeBlocksLabel", subtitle: "Breaks, meetings & unavailable periods", subtitleKey: "provider.mobile.screens.moreTab.timeBlocksSubtitle", route: "/(app)/(tabs)/more/time-blocks", color: "#d97706", bg: "#fffbeb" },
      { icon: "people-outline", label: "Group Bookings", labelKey: "provider.mobile.screens.moreTab.groupBookingsLabel", subtitle: "Manage group appointments", subtitleKey: "provider.mobile.screens.moreTab.groupBookingsSubtitle", route: "/(app)/(tabs)/more/group-bookings", color: "#8b5cf6", bg: "#ede9fe" },
      { icon: "construct-outline", label: "Resources & forms", labelKey: "provider.mobile.screens.moreTab.resourcesFormsLabel", subtitle: "Resources, intake & consent forms", subtitleKey: "provider.mobile.screens.moreTab.resourcesFormsSubtitle", route: "/(app)/(tabs)/more/resources-forms-hub", color: "#0d9488", bg: "#ccfbf1" },
      { icon: "chatbox-ellipses-outline", label: "Custom Requests", labelKey: "provider.mobile.screens.moreTab.customRequestsLabel", subtitle: "Client quotes & offers", subtitleKey: "provider.mobile.screens.moreTab.customRequestsSubtitle", route: "/(app)/(tabs)/more/custom-requests", color: "#f97316", bg: "#fff7ed" },
    ],
  },
  {
    titleKey: "provider.mobile.screens.moreTab.sectionEcommerce",
    items: [
      { icon: "cube-outline", label: "Products & e-commerce", labelKey: "provider.mobile.screens.moreTab.productsEcommerceLabel", subtitle: "Inventory, orders & sales", subtitleKey: "provider.mobile.screens.moreTab.productsEcommerceSubtitle", route: "/(app)/(tabs)/more/products-ecommerce-hub", color: "#8b5cf6", bg: "#ede9fe" },
    ],
  },
  {
    titleKey: "provider.mobile.screens.moreTab.sectionBusiness",
    items: [
      { icon: "layers-outline", label: "Catalogue & offerings", labelKey: "provider.mobile.screens.moreTab.catalogueLabel", subtitle: "Services, products & packages", subtitleKey: "provider.mobile.screens.moreTab.catalogueSubtitle", route: "/(app)/(tabs)/more/catalogue", color: "#ec4899", bg: "#fdf2f8" },
      { icon: "people-circle-outline", label: "Team & scheduling", labelKey: "provider.mobile.screens.moreTab.teamSchedulingLabel", subtitle: "Staff, shifts & time clock", subtitleKey: "provider.mobile.screens.moreTab.teamSchedulingSubtitle", route: "/(app)/(tabs)/more/team", color: "#14b8a6", bg: "#ccfbf1" },
      { icon: "cash-outline", label: "Money", labelKey: "provider.mobile.screens.moreTab.moneyLabel", subtitle: "Earnings, ledger, sales & payouts", subtitleKey: "provider.mobile.screens.moreTab.moneySubtitle", route: "/(app)/(tabs)/more/money", color: "#22c55e", bg: "#f0fdf4" },
      { icon: "receipt-outline", label: "Billing", labelKey: "provider.mobile.screens.moreTab.billingLabel", subtitle: "Plan, invoices, bills & VAT", subtitleKey: "provider.mobile.screens.moreTab.billingSubtitle", route: "/(app)/(tabs)/more/billing", color: "#8b5cf6", bg: "#ede9fe" },
      { icon: "people-outline", label: "Team & pay", labelKey: "provider.mobile.screens.moreTab.teamPayLabel", subtitle: "Payroll, team totals & your earnings", subtitleKey: "provider.mobile.screens.moreTab.teamPaySubtitle", route: "/(app)/(tabs)/more/team-pay", color: "#0d9488", bg: "#ccfbf1" },
      { icon: "settings-outline", label: "Payment setup", labelKey: "provider.mobile.screens.moreTab.paymentSetupLabel", subtitle: "Payout accounts, terminals & gift cards", subtitleKey: "provider.mobile.screens.moreTab.paymentSetupSubtitle", route: "/(app)/(tabs)/more/payment-setup", color: "#2563eb", bg: "#dbeafe" },
      { icon: "bar-chart-outline", label: "Reports", labelKey: "provider.mobile.screens.moreTab.reportsLabel", subtitle: "Analytics, activity & insights", subtitleKey: "provider.mobile.screens.moreTab.reportsSubtitle", route: "/(app)/(tabs)/more/reports", color: "#3b82f6", bg: "#eff6ff" },
      { icon: "images-outline", label: "Gallery", labelKey: "provider.mobile.screens.moreTab.galleryLabel", subtitle: "Portfolio & photos", subtitleKey: "provider.mobile.screens.moreTab.gallerySubtitle", route: "/(app)/(tabs)/more/gallery", color: "#f43f5e", bg: "#fff1f2" },
    ],
  },
  {
    titleKey: "provider.mobile.screens.moreTab.sectionEngagement",
    items: [
      { icon: "chatbubbles-outline", label: "Engagement", labelKey: "provider.mobile.screens.moreTab.engagementLabel", subtitle: "Reviews, messaging & marketing", subtitleKey: "provider.mobile.screens.moreTab.engagementSubtitle", route: "/(app)/(tabs)/more/engagement-hub", color: "#6366f1", bg: "#eef2ff" },
      { icon: "compass-outline", label: "Explore posts", labelKey: "provider.mobile.screens.moreTab.explorePostsLabel", subtitle: "Your feed posts, views & comments", subtitleKey: "provider.mobile.screens.moreTab.explorePostsSubtitle", route: "/(app)/(tabs)/more/explore-posts", color: "#a855f7", bg: "#faf5ff" },
    ],
  },
  {
    titleKey: "provider.mobile.screens.moreTab.sectionSettings",
    items: [
      { icon: "shield-outline", label: "Trust & Safety", labelKey: "provider.mobile.screens.moreTab.trustSafetyLabel", subtitleKey: "provider.mobile.screens.safetyHub.moreMenuSubtitle", route: "/(app)/(tabs)/more/safety", color: "#0ea5e9", bg: "#e0f2fe" },
      { icon: "lock-closed-outline", label: "Login & security", labelKey: "provider.mobile.screens.moreTab.loginSecurityLabel", subtitle: "Email, phone, password, biometrics & sessions", subtitleKey: "provider.mobile.screens.moreTab.loginSecuritySubtitle", route: "/(app)/(tabs)/more/settings-login-and-security", color: "#6366f1", bg: "#eef2ff" },
      { icon: "shield-checkmark-outline", label: "Identity verification", labelKey: "provider.mobile.screens.moreTab.identityVerificationLabel", subtitle: "Verify your identity (KYC) & earn the Verified badge", subtitleKey: "provider.mobile.screens.moreTab.identityVerificationSubtitle", route: "/(app)/(tabs)/more/settings/verification", color: "#0ea5e9", bg: "#e0f2fe" },
      { icon: "language-outline", label: "Language", labelKey: "provider.mobile.screens.moreTab.languageRegionLabel", subtitle: "App language & display currency", subtitleKey: "provider.mobile.screens.moreTab.languageRegionSubtitle", route: "/(app)/(tabs)/more/settings/language", color: "#0ea5e9", bg: "#e0f2fe" },
      { icon: "storefront-outline", label: "Locations & operating hours", labelKey: "provider.mobile.screens.moreTab.locationsHoursLabel", subtitle: "Branches, addresses & opening times", subtitleKey: "provider.mobile.screens.moreTab.locationsHoursSubtitle", route: "/(app)/(tabs)/more/locations-operating-hub", color: "#059669", bg: "#ecfdf5" },
      { icon: "car-outline", label: "Travel fees", labelKey: "provider.mobile.screens.moreTab.travelFeesLabel", subtitle: "At-home travel fees", subtitleKey: "provider.mobile.screens.moreTab.travelFeesSubtitle", route: "/(app)/(tabs)/more/settings/travel-fees", color: "#f59e0b", bg: "#fef3c7" },
      { icon: "close-circle-outline", label: "Cancellation policies & fees", labelKey: "provider.mobile.screens.moreTab.cancellationPoliciesLabel", subtitle: "Late cancel & no-show fees", subtitleKey: "provider.mobile.screens.moreTab.cancellationPoliciesSubtitle", route: "/(app)/(tabs)/more/settings/cancellation-policies", color: "#ef4444", bg: "#fee2e2" },
      { icon: "ribbon-outline", label: "Rewards & badges", labelKey: "provider.mobile.screens.moreTab.rewardsBadgesLabel", subtitle: "Points, milestones & badge progress", subtitleKey: "provider.mobile.screens.moreTab.rewardsBadgesSubtitle", route: "/(app)/(tabs)/more/rewards-hub", color: "#059669", bg: "#d1fae5" },
      { icon: "ticket-outline", label: "Support tickets", labelKey: "provider.mobile.screens.moreTab.supportTicketsLabel", subtitle: "All tickets, replies & status", subtitleKey: "provider.mobile.screens.moreTab.supportTicketsSubtitle", route: "/(app)/(tabs)/more/support-tickets", color: "#0ea5e9", bg: "#e0f2fe" },
      { icon: "settings-outline", label: "Settings & account", labelKey: "provider.mobile.screens.moreTab.settingsAccountLabel", subtitle: "Business, team & account", subtitleKey: "provider.mobile.screens.moreTab.settingsAccountSubtitle", route: "/(app)/(tabs)/more/settings-account-hub", color: "#6b7280", bg: Colors.gray[100] },
      { icon: "help-buoy-outline", label: "Help & support", labelKey: "provider.mobile.screens.moreTab.helpSupportLabel", subtitle: "Contact support & new ticket", subtitleKey: "provider.mobile.screens.moreTab.helpSupportSubtitle", route: "/(app)/(tabs)/more/contact-support", color: "#0284c7", bg: "#e0f2fe" },
    ],
  },
];

/** Top shortcuts (customer app pattern: 2x2 quick actions above the fold) */
const QUICK_ACTIONS: { icon: keyof typeof Ionicons.glyphMap; label: string; labelKey: string; route: string; color: string }[] = [
  { icon: "book-outline", label: "Bookings", labelKey: "provider.mobile.screens.moreTab.qaBookings", route: "/(app)/(tabs)/more/bookings", color: "#6366f1" },
  { icon: "flash-outline", label: "Express booking", labelKey: "provider.mobile.screens.moreTab.qaExpressBooking", route: "/(app)/(tabs)/more/express-booking", color: "#f59e0b" },
  { icon: "storefront-outline", label: "Front Desk", labelKey: "provider.mobile.screens.moreTab.qaFrontDesk", route: "/(app)/(tabs)/more/waiting-room", color: "#d97706" },
  { icon: "chatbox-ellipses-outline", label: "Custom requests", labelKey: "provider.mobile.screens.moreTab.qaCustomRequests", route: "/(app)/(tabs)/more/custom-requests", color: "#f97316" },
  { icon: "layers-outline", label: "Catalogue", labelKey: "provider.mobile.screens.moreTab.qaCatalogue", route: "/(app)/(tabs)/more/catalogue", color: "#ec4899" },
  { icon: "megaphone-outline", label: "Buy ads", labelKey: "provider.mobile.screens.moreTab.qaBuyAds", route: "/(app)/(tabs)/more/settings/ads", color: "#f59e0b" },
  { icon: "card-outline", label: "Memberships", labelKey: "provider.mobile.screens.moreTab.qaMemberships", route: "/(app)/(tabs)/more/membership-plans", color: "#7c3aed" },
  { icon: "phone-portrait-outline", label: "Yoco", labelKey: "provider.mobile.screens.moreTab.qaYoco", route: "/(app)/(tabs)/more/settings/yoco-devices", color: "#2563eb" },
  { icon: "hardware-chip-outline", label: "Card machines", labelKey: "provider.mobile.screens.moreTab.qaCardMachines", route: "/(app)/(tabs)/more/card-machines", color: "#7c3aed" },
  { icon: "qr-code-outline", label: "Paystack Terminal", labelKey: "provider.mobile.screens.moreTab.qaPaystackTerminal", route: "/(app)/(tabs)/more/paystack-terminal", color: "#16a34a" },
  { icon: "ribbon-outline", label: "Subscription", labelKey: "provider.mobile.screens.moreTab.qaSubscription", route: "/(app)/(tabs)/more/settings/subscription", color: "#8b5cf6" },
  { icon: "cash-outline", label: "Payouts", labelKey: "provider.mobile.screens.moreTab.qaPayouts", route: "/(app)/(tabs)/more/money?tab=payouts", color: "#047857" },
  { icon: "wallet-outline", label: "Bank accounts", labelKey: "provider.mobile.screens.moreTab.qaBankAccounts", route: "/(app)/(tabs)/more/payment-setup", color: "#059669" },
];

export default function MoreScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = usePaycloudFeatureEnabled();
  const { refresh: refreshConfigBundle } = useConfigBundle();
  const { settings: paycloudSettings } = usePayCloudSettings();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    "provider.mobile.screens.moreTab.sectionGrowBusiness": true,
    "provider.mobile.screens.moreTab.sectionOperations": true,
    "provider.mobile.screens.moreTab.sectionEcommerce": true,
    "provider.mobile.screens.moreTab.sectionSettings": true,
  });
  const [refreshing, setRefreshing] = useState(false);

  const { data: completionData, loading: completionLoading, error: completionError, refresh: refreshCompletion } = useApi<SetupStatusData>(
    "/api/provider/setup-status",
  );
  type MeProfileLite = {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    /** From GET /api/me/profile: business (`providers`) rating when the user is owner/staff */
    provider_rating_average?: number | null;
    provider_review_count?: number | null;
  };
  const { data: meProfile, refresh: refreshMeProfile } = useApi<MeProfileLite>("/api/me/profile", { staleTimeMs: 45_000 });
  const { provider } = useProvider();
  const { data: financeSummary, refresh: refreshFinanceSummary } = useApi<FinanceSummaryData>("/api/provider/finance?range=month", { staleTimeMs: 30_000, timeoutMs: MONEY_SURFACE_TIMEOUT_MS });
  const { data: payoutAccounts, loading: payoutAccountsLoading, refresh: refreshPayoutAccounts } = useApi<PayoutAccountSummary[]>("/api/provider/payout-accounts", { staleTimeMs: 30_000, timeoutMs: MONEY_SURFACE_TIMEOUT_MS });
  const { data: payoutSchedule, refresh: refreshPayoutSchedule } = useApi<PayoutScheduleData>("/api/provider/payouts/next-date", { staleTimeMs: 60_000, timeoutMs: MONEY_SURFACE_TIMEOUT_MS });
  const { data: teamAccess } = useApi<TeamAccessData>("/api/provider/team-access", { staleTimeMs: 60_000 });
  const { data: permissionData } = useApi<{ isOwner?: boolean; permissions?: Record<string, boolean> }>(
    "/api/provider/permissions",
    { staleTimeMs: 60_000 },
  );
  const isBusinessOwner = permissionData?.isOwner === true;
  const canEditSettings =
    isBusinessOwner || permissionData?.permissions?.edit_settings === true;
  const canProcessPayments =
    teamAccess?.can_process_payments === true ||
    permissionData?.permissions?.process_payments === true;
  const canRequestPayouts =
    canEditSettings ||
    teamAccess?.can_request_payouts === true ||
    teamAccess?.is_business_owner === true;
  const canViewSales =
    isBusinessOwner ||
    permissionData?.permissions?.view_sales === true ||
    permissionData?.permissions?.create_sales === true;
  const canViewReports =
    isBusinessOwner || permissionData?.permissions?.view_reports === true;

  const filteredQuickActions = QUICK_ACTIONS.filter((action) => {
    const route = action.route;
    if (
      route.includes("payment-setup") ||
      route.includes("billing") ||
      route.includes("settings/ads") ||
      route.includes("yoco-devices") ||
      route.includes("card-machines") ||
      route.includes("paystack-terminal")
    ) {
      return canEditSettings;
    }
    if (route.includes("money") || route.includes("payouts") || route.includes("finance")) {
      return canRequestPayouts || canEditSettings;
    }
    if (route.includes("reports")) {
      return canViewReports;
    }
    if (
      route.includes("products-ecommerce-hub") ||
      route.includes("product-orders") ||
      route.includes("orders-hub") ||
      route.includes("walk-in")
    ) {
      return canViewSales;
    }
    return true;
  });
  const { data: navCounts, refresh: refreshNavCounts } = useApi<ProviderNavCounts>("/api/provider/nav-counts", { staleTimeMs: 30_000 });
  const completion = completionData ?? null;
  const completionItems = completion?.steps ?? [];
  const completionPct = completion?.completionPercentage ?? 0;
  const showCompletionCard =
    isBusinessOwner && completionItems.length > 0 && !completion?.isComplete;
  // Prefer the next *required* blocker for the card's primary CTA so tapping
  // the card lands the provider on a step that actually gates accepting
  // bookings (Yoco / portfolio are optional and should not steal the slot).
  const firstIncompleteStep =
    completionItems.find((s) => s.required && !s.completed) ??
    completionItems.find((s) => !s.completed) ??
    null;
  const incompleteRequiredCount = completionItems.filter(
    (s) => s.required && !s.completed,
  ).length;
  const incompleteOptionalCount = completionItems.filter(
    (s) => !s.required && !s.completed,
  ).length;
  // Required steps first (including completed rows with checkmarks), then any
  // optional rows still pending. This makes the "Complete your business
  // profile" card feel like a checklist instead of only an error list.
  const orderedCompletionSteps = [
    ...completionItems.filter((s) => s.required),
    ...completionItems.filter((s) => !s.required && !s.completed),
  ];
  const COMPLETION_ITEM_DISPLAY_LIMIT = 10;
  const completionStepsToRender = orderedCompletionSteps.slice(
    0,
    COMPLETION_ITEM_DISPLAY_LIMIT,
  );
  const completionOverflowCount = Math.max(
    0,
    orderedCompletionSteps.length - completionStepsToRender.length,
  );
  const showCompletionError = !completionLoading && !!completionError && !completionData;
  const availablePayout = Number(financeSummary?.earnings?.available_balance ?? 0);
  const pendingPayouts = Number(financeSummary?.earnings?.pending_payouts ?? 0);
  const minimumPayout =
    financeSummary?.earnings?.minimum_payout_amount != null
      ? Number(financeSummary.earnings.minimum_payout_amount)
      : null;
  const accounts = Array.isArray(payoutAccounts) ? payoutAccounts : [];
  const primaryPayoutAccount =
    accounts.find((account) => account.is_primary === true) ??
    accounts.find((account) => account.active !== false) ??
    accounts[0];
  const hasPayoutAccount = accounts.length > 0;
  const payoutAccountLast4 = primaryPayoutAccount?.account_number_last4 ?? primaryPayoutAccount?.account_number?.slice(-4);
  const requestPayoutDisabledReason = !canRequestPayouts
    ? t("provider.mobile.screens.moreTab.payoutRequiresEditSettings")
    : !hasPayoutAccount
      ? t("provider.mobile.screens.moreTab.payoutAddBankFirst")
      : minimumPayout != null && availablePayout < minimumPayout
        ? t("provider.mobile.screens.moreTab.payoutMinimumIs", { amount: formatCurrency(minimumPayout) })
        : null;
  const nextPayoutDate = payoutSchedule?.next_payout_date
    ? new Date(payoutSchedule.next_payout_date)
    : null;

  function completionItemLabel(step: SetupStatusStep) {
    // Setup-status returns server-authored titles ("Business Details",
    // "Service Address", etc.) which are already user-facing copy. We try a
    // translation key first for back-compat with existing locale files;
    // fall back to the server title otherwise.
    const key = `provider.profileCompletionItems.${step.id}` as never;
    const translated = t(key);
    if (typeof translated === "string" && translated !== key) return translated;
    return step.title;
  }

  useFocusEffect(
    useCallback(() => {
      void refreshCompletion();
      void refreshMeProfile();
      void refreshFinanceSummary();
      void refreshPayoutAccounts();
      void refreshPayoutSchedule();
      void refreshNavCounts();
    }, [refreshCompletion, refreshMeProfile, refreshFinanceSummary, refreshPayoutAccounts, refreshPayoutSchedule, refreshNavCounts])
  );

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(PROVIDER_SETUP_STATUS_CHANGED, () => {
      void refreshCompletion();
    });
    return () => sub.remove();
  }, [refreshCompletion]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshCompletion(),
        refreshMeProfile(),
        refreshFinanceSummary(),
        refreshPayoutAccounts(),
        refreshPayoutSchedule(),
        refreshNavCounts(),
        refreshConfigBundle(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshCompletion, refreshMeProfile, refreshFinanceSummary, refreshPayoutAccounts, refreshPayoutSchedule, refreshNavCounts, refreshConfigBundle]);

  const getRouteBadgeCount = useCallback(
    (route: string): number => {
      if (route.includes("/bookings")) {
        return Number(navCounts?.pending_bookings ?? 0) + Number(navCounts?.waiting_room ?? 0);
      }
      if (route.includes("products-ecommerce-hub") || route.includes("product-orders") || route.includes("orders-hub")) {
        return (
          Number(navCounts?.active_product_orders ?? 0) + Number(navCounts?.open_return_requests ?? 0)
        );
      }
      if (route.includes("engagement-hub") || route.includes("messaging")) {
        return Number(navCounts?.unread_messages ?? 0);
      }
      if (route.includes("custom-requests")) {
        return Number(navCounts?.pending_custom_requests ?? 0);
      }
      if (route.includes("waiting-room")) {
        return Number(navCounts?.waiting_room ?? 0);
      }
      return 0;
    },
    [navCounts],
  );

  const headerInitials = useMemo(() => {
    const n = (meProfile?.full_name || user?.email || "").trim();
    if (!n) return "?";
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }, [meProfile?.full_name, user?.email]);

  const headerSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (meProfile?.phone?.trim()) parts.push(meProfile.phone.trim());
    const em =
      meProfile?.email?.trim() ||
      (typeof (user as { email?: string } | null)?.email === "string" ? (user as { email: string }).email.trim() : "");
    if (em) parts.push(em);
    return parts.join(" · ");
  }, [meProfile?.phone, meProfile?.email, user]);

  const toggleSection = useCallback((title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  }, []);

  function handleMenuPress(route: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as never);
  }

  const rateStoreTitle =
    Platform.OS === "ios"
      ? t("common.rateBeautonomiAppStore")
      : Platform.OS === "android"
        ? t("common.rateBeautonomiPlayStore")
        : t("common.rateBeautonomiStoreWeb");

  function handleSignOut() {
    const goToLogin = () => router.replace("/(auth)/login" as never);
    const performSignOut = () => signOut().then(goToLogin).catch(goToLogin);
    if (Platform.OS === "web") {
      performSignOut();
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(t("provider.mobile.screens.moreTab.signOutAlertTitle"), t("provider.mobile.screens.moreTab.signOutAlertBody"), [
      { text: t("provider.mobile.screens.moreTab.signOutCancel"), style: "cancel" },
      { text: t("provider.mobile.screens.moreTab.signOutConfirm"), style: "destructive", onPress: performSignOut },
    ]);
  }

  return (
    <ScreenContainer
      scrollable
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
        {/* Profile header - tappable to My Profile */}
        <TouchableOpacity
          style={{ marginBottom: 20, flexDirection: "row", alignItems: "center", paddingTop: 16 }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/(app)/(tabs)/more/profile" as never);
          }}
          activeOpacity={0.7}
          accessibilityLabel={t("provider.mobile.screens.moreTab.myProfileA11y")}
          accessibilityRole="button"
        >
          {meProfile?.avatar_url ? (
            <Image
              source={{ uri: meProfile.avatar_url }}
              style={{ width: 56, height: 56, borderRadius: 28 }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={{
                width: 56,
                height: 56,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 28,
                backgroundColor: Colors.gray[900],
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#fff" }}>{headerInitials}</Text>
            </View>
          )}
          <View style={{ marginStart: 14, flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  letterSpacing: -0.5,
                  color: Colors.gray[900],
                  flexGrow: 1,
                  flexShrink: 1,
                }}
              >
                {t("provider.mobile.screens.moreTab.myProfile")}
              </Text>
              {provider?.is_verified ? (
                <VerifiedBadge verified size="md" />
              ) : null}
              {meProfile?.provider_rating_average != null && (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push("/(app)/(tabs)/more/reviews" as never);
                  }}
                  style={{ flexDirection: "row", alignItems: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel={`Business rating ${meProfile.provider_rating_average.toFixed(1)} from ${meProfile.provider_review_count ?? 0} reviews. Opens reviews.`}
                >
                  <Ionicons name="star" size={16} color="#f59e0b" style={{ marginEnd: 3 }} />
                  <Text style={{ fontSize: 16, fontWeight: "700", color: Colors.gray[900] }}>
                    {meProfile.provider_rating_average.toFixed(1)}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.gray[500] }}>({meProfile.provider_review_count ?? 0})</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={{ marginTop: 2, fontSize: 14, color: Colors.gray[500] }} numberOfLines={2}>
              {headerSubtitle}
            </Text>
          </View>
          <DirectionalIcon name="chevron-forward" size={20} color={Colors.gray[300]} />
        </TouchableOpacity>

        <ProviderOrgSwitcher />
        <StartOwnBusinessCard />

        {/* Payouts - web payout center parity: balance, request action, and bank setup above the fold */}
        {(canEditSettings) ? (
        <View
          style={{
            marginBottom: 16,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: "#bbf7d0",
            backgroundColor: "#ecfdf5",
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: "#d1fae5",
                alignItems: "center",
                justifyContent: "center",
                marginEnd: 12,
              }}
            >
              <Ionicons name="wallet-outline" size={24} color="#047857" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#047857", textTransform: "uppercase", letterSpacing: 0.7 }}>
                {t("provider.mobile.screens.moreTab.providerPayouts")}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 28, fontWeight: "800", color: "#064e3b", letterSpacing: -0.8 }}>
                {formatCurrency(availablePayout)}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 13, color: "#047857" }}>
                {t("provider.mobile.screens.moreTab.availableToWithdraw")}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {minimumPayout != null ? (
              <View style={{ borderRadius: 999, backgroundColor: "#d1fae5", paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#065f46" }}>
                  {t("provider.mobile.screens.moreTab.minAmount", { amount: formatCurrency(minimumPayout) })}
                </Text>
              </View>
            ) : null}
            {pendingPayouts > 0 && (
              <View style={{ borderRadius: 999, backgroundColor: "#fef3c7", paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400e" }}>
                  {t("provider.mobile.screens.moreTab.pendingAmount", { amount: formatCurrency(pendingPayouts) })}
                </Text>
              </View>
            )}
            {nextPayoutDate && Number.isFinite(nextPayoutDate.getTime()) && (
              <View style={{ borderRadius: 999, backgroundColor: "#e0f2fe", paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#075985" }}>
                  {t("provider.mobile.screens.moreTab.nextRun", { date: nextPayoutDate.toLocaleDateString() })}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={() =>
              handleMenuPress(
                hasPayoutAccount || !canEditSettings
                  ? "/(app)/(tabs)/more/money?tab=payouts"
                  : "/(app)/(tabs)/more/payment-setup",
              )
            }
            activeOpacity={0.75}
            style={{
              marginTop: 14,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 14,
              backgroundColor: hasPayoutAccount ? "#047857" : "#111827",
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={hasPayoutAccount ? t("provider.mobile.screens.moreTab.requestPayoutA11y") : t("provider.mobile.screens.moreTab.setUpBankAccountPayoutsA11y")}
          >
            <Ionicons name={hasPayoutAccount ? "cash-outline" : "business-outline"} size={20} color="#fff" />
            <Text style={{ marginStart: 8, flex: 1, fontSize: 15, fontWeight: "700", color: "#fff" }}>
              {hasPayoutAccount ? t("provider.mobile.screens.moreTab.requestPayout") : t("provider.mobile.screens.moreTab.setUpBankAccount")}
            </Text>
            <DirectionalIcon name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          {canEditSettings ? (
          <TouchableOpacity
            onPress={() => handleMenuPress("/(app)/(tabs)/more/settings/payout-accounts")}
            activeOpacity={0.75}
            style={{
              marginTop: 10,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#a7f3d0",
              backgroundColor: "#fff",
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
            accessibilityRole="button"
            accessibilityLabel={t("provider.mobile.screens.moreTab.bankAccountSetupA11y")}
          >
            <Ionicons name={hasPayoutAccount ? "checkmark-circle" : "alert-circle"} size={20} color={hasPayoutAccount ? "#059669" : "#d97706"} />
            <View style={{ marginStart: 8, flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.gray[900] }}>
                {t("provider.mobile.screens.moreTab.bankAccountSetup")}
              </Text>
              <Text style={{ marginTop: 1, fontSize: 12, color: Colors.gray[500] }} numberOfLines={2}>
                {payoutAccountsLoading
                  ? t("provider.mobile.screens.moreTab.checkingPayoutAccount")
                  : hasPayoutAccount
                    ? `${primaryPayoutAccount?.bank_name || t("provider.mobile.screens.moreTab.bankAccountFallback")}${payoutAccountLast4 ? ` • •••• ${payoutAccountLast4}` : ""}`
                    : t("provider.mobile.screens.moreTab.addBankAccountPrompt")}
              </Text>
            </View>
            <DirectionalIcon name="chevron-forward" size={16} color="#d1d5db" />
          </TouchableOpacity>
          ) : null}

          {requestPayoutDisabledReason && (
            <Text style={{ marginTop: 10, fontSize: 12, color: "#92400e", lineHeight: 16 }}>
              {requestPayoutDisabledReason}
            </Text>
          )}
        </View>
        ) : null}

        {/* Highlight ads + memberships above the fold (also listed under “Grow your business”) */}
        <View style={{ marginBottom: 16, flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            onPress={() => handleMenuPress("/(app)/(tabs)/more/settings/ads")}
            activeOpacity={0.75}
            style={{
              flex: 1,
              borderRadius: 16,
              padding: 14,
              backgroundColor: "#fffbeb",
              borderWidth: 1,
              borderColor: "#fde68a",
            }}
            accessibilityRole="button"
            accessibilityLabel={t("provider.mobile.screens.moreTab.adsCardA11y")}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "rgba(245, 158, 11, 0.25)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="megaphone-outline" size={20} color="#d97706" />
              </View>
              <Text style={{ marginStart: 10, fontSize: 12, fontWeight: "700", color: "#92400e", textTransform: "uppercase", letterSpacing: 0.6 }}>
                {t("provider.mobile.screens.moreTab.adsCardTitle")}
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#78350f" }}>{t("provider.mobile.screens.moreTab.adsCardCta")}</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: "#a16207", lineHeight: 16 }}>{t("provider.mobile.screens.moreTab.adsCardSubtitle")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleMenuPress("/(app)/(tabs)/more/membership-plans")}
            activeOpacity={0.75}
            style={{
              flex: 1,
              borderRadius: 16,
              padding: 14,
              backgroundColor: "#f5f3ff",
              borderWidth: 1,
              borderColor: "#ddd6fe",
            }}
            accessibilityRole="button"
            accessibilityLabel={t("provider.mobile.screens.moreTab.sellMembershipsA11y")}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: "rgba(124, 58, 237, 0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="card-outline" size={20} color="#7c3aed" />
              </View>
              <Text style={{ marginStart: 10, fontSize: 12, fontWeight: "700", color: "#5b21b6", textTransform: "uppercase", letterSpacing: 0.6 }}>
                {t("provider.mobile.screens.moreTab.recurringCardTitle")}
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "#4c1d95" }}>{t("provider.mobile.screens.moreTab.sellMembershipsCta")}</Text>
            <Text style={{ marginTop: 4, fontSize: 12, color: "#6d28d9", lineHeight: 16 }}>{t("provider.mobile.screens.moreTab.sellMembershipsSubtitle")}</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions - customer-style 2x2 grid (shortens perceived page length) */}
        <View style={{ marginBottom: 20, flexDirection: "row", flexWrap: "wrap" }}>
          {filteredQuickActions.filter(
            (action) =>
              (paystackTerminalEnabled || !action.route.includes("paystack-terminal")) &&
              (yocoEnabled || !action.route.includes("yoco")) &&
              (paycloudEnabled || !action.route.includes("card-machines")),
          ).map((action) => {
            const badge = formatBadgeCount(getRouteBadgeCount(action.route));
            return (
              <TouchableOpacity
                key={action.route}
                onPress={() => handleMenuPress(action.route)}
                activeOpacity={0.7}
                style={{ flex: 1, minWidth: "45%", marginEnd: 12, marginBottom: 12, backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], alignItems: "center", paddingVertical: 16 }}
                accessibilityRole="button"
                accessibilityLabel={badge ? `${t(action.labelKey)}, ${badge} alerts` : t(action.labelKey)}
              >
                <View
                  style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, marginBottom: 8, backgroundColor: `${action.color}20` }}
                >
                  <Ionicons name={action.icon} size={20} color={action.color} />
                  {badge ? (
                    <View style={{ position: "absolute", right: -8, top: -8, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: "#fff" }}>{badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ fontSize: 12, fontWeight: "500", color: Colors.gray[700], textAlign: "center" }} numberOfLines={2}>
                  {t(action.labelKey)}
                </Text>
                {action.route.includes("card-machines") && paycloudEnabled ? (
                  <Text style={{ marginTop: 2, fontSize: 10, color: Colors.gray[500], textAlign: "center" }}>
                    {paycloudSettings?.ready ? t("provider.mobile.screens.moreTab.paycloudReady") : paycloudSettings?.accept_paycloud ? t("provider.mobile.screens.moreTab.paycloudSetUp") : t("provider.mobile.screens.moreTab.paycloudOff")}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Profile completion load error - non-blocking message with retry */}
        {showCompletionError && (
          <View style={{ marginBottom: 20, borderRadius: 16, borderWidth: 1, borderColor: "#fcd34d", backgroundColor: "#fffbeb", padding: 16 }}>
            <Text style={{ fontSize: 14, color: "#92400e" }}>
              {t("provider.profileCompletionLoadError")}
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                refreshCompletion();
              }}
              style={{ marginTop: 12, alignSelf: "flex-start", borderRadius: 8, backgroundColor: "#fcd34d", paddingHorizontal: 16, paddingVertical: 8 }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t("common.retry")}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#78350f" }}>
                {t("common.retry")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Profile completion card - show when < 100% and items exist */}
        {!completionLoading && showCompletionCard && (
          <View style={{ marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const route = firstIncompleteStep
                  ? getStepNativeRoute(firstIncompleteStep)
                  : "/(app)/(tabs)/more/settings/setup-status";
                router.push(route as never);
              }}
              activeOpacity={0.8}
              style={{ backgroundColor: Colors.white, borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], padding: 16 }}
              accessibilityRole="button"
              accessibilityLabel={t("provider.profileCompletionTitle")}
            >
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <View
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", marginEnd: 12 }}
                >
                  <Ionicons name="sparkles" size={22} color="#6366f1" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: Colors.gray[900] }}>
                    {t("provider.profileCompletionTitle")}
                  </Text>
                  <Text style={{ fontSize: 14, color: Colors.gray[500], marginTop: 4 }}>
                    {incompleteRequiredCount > 0
                      ? `${incompleteRequiredCount} required task${incompleteRequiredCount === 1 ? "" : "s"} left${incompleteOptionalCount > 0 ? ` · ${incompleteOptionalCount} optional` : ""}`
                      : incompleteOptionalCount > 0
                        ? `All required tasks done · ${incompleteOptionalCount} optional improvement${incompleteOptionalCount === 1 ? "" : "s"}`
                        : t("provider.profileCompletionSubtitle")}
                  </Text>
                  <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1, height: 6, backgroundColor: Colors.gray[100], borderRadius: 9999, overflow: "hidden", marginEnd: 10 }}>
                      <View
                        style={{ height: "100%", backgroundColor: "#4f46e5", borderRadius: 9999, width: `${completionPct}%` }}
                      />
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: Colors.gray[600] }}>
                      {completionPct}%
                    </Text>
                  </View>
                  {completionStepsToRender.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      {completionStepsToRender.map((step, idx) => {
                        const missingRequired = step.required && !step.completed;
                        const iconName = step.completed
                          ? "checkmark-circle"
                          : missingRequired
                            ? "alert-circle"
                            : "ellipse-outline";
                        const iconColor = step.completed
                          ? "#16a34a"
                          : missingRequired
                            ? "#ef4444"
                            : "#9ca3af";
                        const route = getStepNativeRoute(step);
                        return (
                          <TouchableOpacity
                            key={step.id}
                            onPress={(e) => {
                              e.stopPropagation();
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              router.push(route as never);
                            }}
                            style={{ flexDirection: "row", alignItems: "center", marginTop: idx === 0 ? 0 : 10 }}
                            accessibilityRole="button"
                            accessibilityLabel={`${completionItemLabel(step)}${step.completed ? ", completed" : step.required ? ", required" : ", optional"}`}
                          >
                            <Ionicons
                              name={iconName as keyof typeof Ionicons.glyphMap}
                              size={18}
                              color={iconColor}
                              style={{ marginEnd: 10 }}
                            />
                            <Text
                              style={{
                                flex: 1,
                                fontSize: 14,
                                color: step.completed
                                  ? "#166534"
                                  : missingRequired
                                    ? "#b91c1c"
                                    : "#6b7280",
                                fontWeight: step.completed ? "600" : "400",
                              }}
                              numberOfLines={1}
                            >
                              {completionItemLabel(step)}
                            </Text>
                            {step.completed ? (
                              <View
                                style={{
                                  marginStart: 8,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 9999,
                                  backgroundColor: "#dcfce7",
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: "700", color: "#166534" }}>
                                  {t("provider.mobile.screens.moreTab.taskDone")}
                                </Text>
                              </View>
                            ) : !step.required ? (
                              <View
                                style={{
                                  marginStart: 8,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 9999,
                                  backgroundColor: Colors.gray[100],
                                }}
                              >
                                <Text style={{ fontSize: 10, fontWeight: "700", color: Colors.gray[600] }}>
                                  {t("provider.mobile.screens.moreTab.taskOptional")}
                                </Text>
                              </View>
                            ) : null}
                            <DirectionalIcon
                              name="chevron-forward"
                              size={14}
                              color="#cbd5f5"
                              style={{ marginStart: 6 }}
                            />
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push("/(app)/(tabs)/more/settings/setup-status" as never);
                        }}
                        style={{
                          marginTop: 12,
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          backgroundColor: "#eef2ff",
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t("provider.mobile.screens.moreTab.openFullSetupChecklistA11y")}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "600", color: "#4338ca" }}>
                          {completionOverflowCount > 0
                            ? t("provider.mobile.screens.moreTab.viewFullChecklistMore", { count: completionOverflowCount })
                            : t("provider.mobile.screens.moreTab.viewFullChecklist")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Collapsible menu sections - short by default (customer: fewer items on main screen) */}
        <View style={{ marginBottom: 8, marginStart: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, color: Colors.gray[400] }}>
            {t("provider.mobile.screens.moreTab.allFeatures")}
          </Text>
        </View>
        {MENU_SECTIONS.map((section) => {
          const sectionTitle = t(section.titleKey);
          const isExpanded = expandedSections[section.titleKey] ?? false;
          return (
            <View key={section.titleKey} style={{ marginBottom: 8 }}>
              <TouchableOpacity
                onPress={() => toggleSection(section.titleKey)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: Colors.gray[100],
                  backgroundColor: Colors.white,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderTopLeftRadius: isExpanded ? 16 : 16,
                  borderTopRightRadius: isExpanded ? 16 : 16,
                  borderBottomLeftRadius: isExpanded ? 0 : 16,
                  borderBottomRightRadius: isExpanded ? 0 : 16,
                  borderBottomWidth: isExpanded ? 0 : 1,
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${sectionTitle}, ${isExpanded ? t("provider.mobile.screens.moreTab.collapse") : t("provider.mobile.screens.moreTab.expand")}`}
              >
                <Text style={{ fontSize: 15, fontWeight: "500", color: Colors.gray[900] }}>{sectionTitle}</Text>
                <Ionicons
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#9ca3af"
                />
              </TouchableOpacity>
              {isExpanded && (
                <View style={{ overflow: "hidden", borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderWidth: 1, borderTopWidth: 0, borderColor: Colors.gray[100], backgroundColor: Colors.white }}>
                  {section.items.filter(
                    (item) => {
                      if (
                        !(
                          (paystackTerminalEnabled || !item.route.includes("paystack-terminal")) &&
                          (yocoEnabled || !item.route.includes("yoco")) &&
                          (paycloudEnabled || !item.route.includes("card-machines"))
                        )
                      ) {
                        return false;
                      }
                      const route = item.route;
                      if (
                        route.includes("payment-setup") ||
                        route.includes("billing") ||
                        route.includes("settings/ads") ||
                        route.includes("payout-accounts") ||
                        route.includes("yoco-devices") ||
                        route.includes("card-machines") ||
                        route.includes("paystack-terminal")
                      ) {
                        return canEditSettings;
                      }
                      if (
                        route.includes("money") ||
                        route.includes("payouts") ||
                        route.includes("finance")
                      ) {
                        return canRequestPayouts || canEditSettings;
                      }
                      if (route.includes("reports")) {
                        return canViewReports;
                      }
                      if (
                        route.includes("products-ecommerce-hub") ||
                        route.includes("product-orders") ||
                        route.includes("orders-hub") ||
                        route.includes("walk-in")
                      ) {
                        return canViewSales;
                      }
                      return true;
                    },
                  ).map((item, idx) => {
                    const badge = formatBadgeCount(getRouteBadgeCount(item.route));
                    const itemSubtitle = item.subtitleKey ? t(item.subtitleKey) : (item.subtitle ?? "");
                    const itemLabel = item.labelKey ? t(item.labelKey) : item.label;
                    return (
                      <TouchableOpacity
                        key={item.route}
                        style={{
                          minHeight: 52,
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderBottomWidth: idx < section.items.length - 1 ? 1 : 0,
                          borderBottomColor: Colors.gray[50],
                        }}
                        onPress={() => handleMenuPress(item.route)}
                        activeOpacity={0.6}
                        accessibilityRole="button"
                        accessibilityLabel={badge ? `${itemLabel}: ${itemSubtitle}. ${badge} alerts.` : `${itemLabel}: ${itemSubtitle}`}
                      >
                        <View
                          style={{ minHeight: 32, minWidth: 32, backgroundColor: item.bg, alignItems: "center", justifyContent: "center", borderRadius: 8 }}
                        >
                          <Ionicons name={item.icon} size={16} color={item.color} />
                        </View>
                        <View style={{ marginStart: 12, flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "500", color: Colors.gray[900] }}>
                            {itemLabel}
                          </Text>
                          <Text style={{ marginTop: 2, fontSize: 12, color: Colors.gray[500] }}>
                            {itemSubtitle}
                          </Text>
                        </View>
                        {badge ? (
                          <View style={{ marginEnd: 8, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff" }}>{badge}</Text>
                          </View>
                        ) : null}
                        <DirectionalIcon name="chevron-forward" size={16} color="#d1d5db" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ marginBottom: 8, marginStart: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 1, color: Colors.gray[400] }}>
            {t("provider.moreTab.rateStoreHeading")}
          </Text>
        </View>
        <TouchableOpacity
          style={{
            marginBottom: 20,
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: Colors.gray[100],
            backgroundColor: Colors.white,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
          onPress={() => {
            getAnalyticsClient()?.track("rate_app_store", { source: "more_tab" });
            void recordManualStoreReview(user?.id);
            void openNativeStoreReview();
          }}
          activeOpacity={0.7}
          accessibilityLabel={rateStoreTitle}
          accessibilityRole="button"
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: Colors.gray[50],
              alignItems: "center",
              justifyContent: "center",
              marginEnd: 12,
            }}
          >
            <Ionicons name="star-outline" size={18} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: Colors.gray[900] }}>{rateStoreTitle}</Text>
            <Text style={{ fontSize: 12, color: Colors.gray[500], marginTop: 2 }}>{t("common.rateBeautonomiStoreSubtitle")}</Text>
          </View>
          <Ionicons name="open-outline" size={16} color="#d1d5db" />
        </TouchableOpacity>

        {/* Sign Out - Revolut minimal style */}
        <TouchableOpacity
          style={{ marginBottom: 8, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: Colors.gray[200] }}
          onPress={handleSignOut}
          activeOpacity={0.6}
          accessibilityLabel={t("provider.mobile.screens.moreTab.signOutA11y")}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 15, fontWeight: "500", color: "#dc2626" }}>
            {t("auth.logout")}
          </Text>
        </TouchableOpacity>

        <View style={{ alignItems: "center", marginTop: 8, paddingBottom: 16 }}>
          <Text style={{ fontSize: 12, color: Colors.gray[300] }}>
            Beautonomi v{getAppNativeVersion()}
          </Text>
        </View>
    </ScreenContainer>
  );
}
