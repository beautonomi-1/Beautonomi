"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Home,
  Building2,
  MapPin,
} from "lucide-react";
// Force fresh module evaluation
import { fetcher, FetchError, FetchTimeoutError, PROVIDER_BOOTSTRAP_TIMEOUT_MS } from "@/lib/http/fetcher";
import { computeGrowthPercent, formatGrowthLabel } from "@beautonomi/utils";
import { useRoutePerformance } from "@/lib/performance/useRoutePerformance";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { PageHeader } from "@/components/provider/PageHeader";
import { ActiveLocationChip } from "@/components/provider/ActiveLocationChip";
import { QuickStartBanner } from "@/components/provider/QuickStartBanner";
import { ProviderDashboardExcellenceBanner } from "@/components/provider/ProviderDashboardExcellenceBanner";
import { ProviderDashboardAppDownloadCard } from "@/components/provider/ProviderDashboardAppDownloadCard";
import { ProviderAppDownloadNudge } from "@/components/provider/ProviderAppDownloadNudge";
import { RewardsCard } from "@/components/provider/RewardsCard";
import { BadgeCongratsModal } from "@/components/provider/BadgeCongratsModal";
import { ProviderIdentityStrip } from "@/components/provider/ProviderIdentityStrip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { handleError, withRetry, getErrorMessage } from "@/lib/provider-portal/error-handler";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { formatCurrency, cn } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import type { ProviderDashboardStats } from "./provider-dashboard-stats";
import { buildPayoutBalanceCardView } from "./payout-balance-card";
import { DashboardInsightsPanel } from "./DashboardInsightsPanel";
import { useTranslation } from "@beautonomi/i18n";

const ICON_DOLLAR_5 = <DollarSign className="w-5 h-5" />;
const ICON_HOME_5 = <Home className="w-5 h-5" />;
const ICON_CALENDAR_5 = <Calendar className="w-5 h-5" />;
const ICON_CLOCK_4 = <Clock className="w-4 h-4" />;
const ICON_CHECK_4 = <CheckCircle2 className="w-4 h-4" />;
const ICON_XCIRCLE_4 = <XCircle className="w-4 h-4" />;
const ICON_ALERT_4 = <AlertCircle className="w-4 h-4" />;

export type DashboardClientProps = {
  /** Server-rendered dashboard payload (all locations — matches API when no location_id). */
  initialStats: ProviderDashboardStats | null;
  initialLoadError: string | null;
  initialMissingProfile: boolean;
};

export function DashboardClient({
  initialStats,
  initialLoadError,
  initialMissingProfile,
}: DashboardClientProps) {
  const { t } = useTranslation();
  const dashboardBreadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbDashboard") },
  ];
  const router = useRouter();
  const searchParams = useSearchParams();
  const { bundle } = useConfigBundle();
  const [showSubscriptionSuccessNudge, setShowSubscriptionSuccessNudge] = useState(false);

  useEffect(() => {
    if (searchParams.get("subscription_success") !== "1") return;
    setShowSubscriptionSuccessNudge(true);
    router.replace("/provider/dashboard");
  }, [searchParams, router]);
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const { provider, isLoading: isLoadingProvider, loadError: providerError, selectedLocationId } = useProviderPortal();
  const [stats, setStats] = useState<ProviderDashboardStats | null>(() => initialStats ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => initialLoadError ?? null);
  const [isMissingProfile, setIsMissingProfile] = useState(() => initialMissingProfile);
  // The SSR payload is always all-locations (no location_id). Track whether the
  // figures currently on screen are still that SSR payload so we can warn when a
  // branch is selected but the client hasn't refetched the scoped numbers yet.
  const [isShowingSsrAllLocations, setIsShowingSsrAllLocations] = useState(() => Boolean(initialStats));
  const hasLoadedRef = useRef(false);
  const loadingProviderIdRef = useRef<string | null>(null);
  const lastLocationIdRef = useRef<string | null>(null);
  const hasPrefetchedRoutesRef = useRef(false);
  const navigateTo = useCallback((path: string) => router.push(path), [router]);
  useRoutePerformance("dashboard", !isLoadingProvider && !isLoading && !!stats);

  // Cache key is scoped to host + provider + selected location.
  const dashboardCacheKey = useMemo(() => {
    const host = typeof window !== "undefined" ? window.location.host : "default";
    const providerId = provider?.id ?? "unknown";
    const locationSegment = selectedLocationId ?? "all";
    return `provider_dashboard_stats:${host}:${providerId}:${locationSegment}`;
  }, [provider?.id, selectedLocationId]);
  const DASHBOARD_CACHE_DURATION = 30 * 1000;
  const clearLegacyDashboardCacheKeys = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        if (key === "provider_dashboard_stats" || key.startsWith("provider_dashboard_stats_")) {
          keys.push(key);
        }
      }
      keys.forEach((key) => sessionStorage.removeItem(key));
    } catch {
      // Ignore storage errors
    }
  }, []);
  
  // Define loadDashboardFresh FIRST to avoid forward reference issues
  const loadDashboardFresh = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      setIsMissingProfile(false);

      const url = selectedLocationId
        ? `/api/provider/dashboard?location_id=${encodeURIComponent(selectedLocationId)}&include=insights`
        : "/api/provider/dashboard?include=insights";
      
      const response = await withRetry(
        () => fetcher.get<{ data: ProviderDashboardStats }>(
          url,
          { timeoutMs: Math.max(PROVIDER_BOOTSTRAP_TIMEOUT_MS, 60_000), staleTimeMs: 0 }
        ),
        {
          maxRetries: 1,
          retryDelay: 500,
          onRetry: (_attempt) => {},
        }
      );
      
      setStats(response.data);
      // Stats now reflect the active location scope (client fetch), not SSR.
      setIsShowingSsrAllLocations(false);
      
      // Cache the response
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(dashboardCacheKey, JSON.stringify({
            data: response.data,
            timestamp: Date.now(),
          }));
        } catch {
          // Ignore storage errors
        }
      }
    } catch (err) {
      // Check if the error is "Provider profile not found"
      if (err instanceof FetchError && 
          (err.message.includes("Provider profile not found") || 
           err.status === 404)) {
        setIsMissingProfile(true);
        setError(t("web.provider.dashboard.profileNotFoundError"));
      } else {
        // Don't log or show errors for cancelled requests (component unmounts)
        if (err instanceof FetchTimeoutError && err.message.includes('cancelled')) {
          // Silently ignore cancelled requests
          return;
        }
        const errorMessage = getErrorMessage(err, {
          action: "loadDashboard",
          resource: "dashboard stats",
        });
        setError(errorMessage);
        handleError(err, {
          action: "loadDashboard",
          resource: "dashboard stats",
        }, {
          showToast: false, // We show error in UI instead
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedLocationId, dashboardCacheKey]);

  const loadDashboard = useCallback(async () => {
    await loadDashboardFresh(true);
  }, [loadDashboardFresh]);

  useEffect(() => {
    clearLegacyDashboardCacheKeys();

    // Single cache read for all decisions
    let cachedStats: ProviderDashboardStats | null = null;
    let cacheAge = Infinity;
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem(dashboardCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.timestamp) {
            cachedStats = parsed.data;
            cacheAge = Date.now() - parsed.timestamp;
          }
        }
      } catch { /* ignore */ }
    }

    // Restore from cache immediately to prevent loading flash
    if (cachedStats && !stats) {
      setStats(cachedStats);
      setIsLoading(false);
      setError(null);
    }

    if (!isLoadingProvider && provider) {
      const currentProviderId = provider.id;
      const locationChanged = lastLocationIdRef.current !== selectedLocationId;
      if (!hasLoadedRef.current || loadingProviderIdRef.current !== currentProviderId || locationChanged) {
        hasLoadedRef.current = true;
        loadingProviderIdRef.current = currentProviderId;
        lastLocationIdRef.current = selectedLocationId ?? null;

        if (cacheAge < DASHBOARD_CACHE_DURATION) {
          // Fresh cache — only background-refresh if older than 10 s
          if (cacheAge > 10_000) {
            loadDashboardFresh(false).catch(() => {});
          }
        } else {
          const hasData = !!(stats || cachedStats);
          if (!hasData) setIsLoading(true);
          loadDashboardFresh(!hasData);
        }
      } else if (stats) {
        setIsLoading(false);
      }
    } else if (!isLoadingProvider && providerError) {
      setError(providerError);
      setIsLoading(false);
      hasLoadedRef.current = false;
      loadingProviderIdRef.current = null;
    } else if (isLoadingProvider && stats) {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingProvider, provider?.id, providerError, stats, selectedLocationId, dashboardCacheKey, clearLegacyDashboardCacheKeys, loadDashboardFresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!provider) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        loadDashboardFresh(false).catch(() => {});
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [provider, loadDashboardFresh]);

  const dashboardRefreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedDashboardRefresh = useCallback(() => {
    if (dashboardRefreshDebounceRef.current) clearTimeout(dashboardRefreshDebounceRef.current);
    dashboardRefreshDebounceRef.current = setTimeout(() => {
      loadDashboardFresh(false).catch(() => {});
    }, 500);
  }, [loadDashboardFresh]);
  useEffect(() => () => {
    if (dashboardRefreshDebounceRef.current) clearTimeout(dashboardRefreshDebounceRef.current);
  }, []);

  const supabaseClient = getSupabaseClient();
  useSupabaseRealtime(supabaseClient, provider?.id, "booking_updated", debouncedDashboardRefresh);

  useEffect(() => {
    if (!provider?.id || !supabaseClient) return;
    let channel: ReturnType<typeof supabaseClient.channel> | null = null;
    try {
      channel = supabaseClient
        .channel(`dashboard-finance:${provider.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "finance_transactions",
            filter: `provider_id=eq.${provider.id}`,
          },
          debouncedDashboardRefresh,
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "additional_charges",
          },
          debouncedDashboardRefresh,
        )
        .subscribe();
    } catch {
      // Non-fatal
    }
    return () => {
      if (channel) void supabaseClient.removeChannel(channel);
    };
  }, [provider?.id, supabaseClient, debouncedDashboardRefresh]);

  useEffect(() => {
    if (hasPrefetchedRoutesRef.current) return;
    hasPrefetchedRoutesRef.current = true;
    const routes = [
      "/provider/calendar",
      "/provider/bookings",
      "/provider/finance",
      "/provider/clients",
    ];
    const run = () => {
      routes.forEach((href, index) => {
        window.setTimeout(() => router.prefetch(href), index * 120);
      });
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    run();
    return undefined;
  }, [router]);

  // Memoize calculated values to prevent unnecessary recalculations
  // MOVED BEFORE EARLY RETURNS to fix hooks order violation
  const activeBookings = useMemo(() => {
    if (!stats) return 0;
    return stats.active_bookings;
  }, [stats]);

  const payoutBalanceCard = useMemo(() => {
    if (!stats) return null;
    return buildPayoutBalanceCardView(
      stats,
      (amount) => formatCurrency(amount, tenantCurrency),
      { locationFiltered: Boolean(selectedLocationId) },
    );
  }, [stats, tenantCurrency, selectedLocationId]);

  // Show loading if provider is still loading or dashboard is loading
  // BUT: Don't show loading if we have cached stats (prevents flash of loading screen)
  // This makes the dashboard feel instant when returning to the tab
  const shouldShowLoading = (isLoadingProvider || isLoading) && !stats;
  
  if (shouldShowLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">
        <PageHeader title={t("web.provider.dashboard.pageTitle")} breadcrumbs={dashboardBreadcrumbs} />
        <LoadingTimeout 
          loadingMessage={isLoadingProvider ? t("web.provider.dashboard.loadingProvider") : t("web.provider.dashboard.loading")} 
          timeoutMs={PROVIDER_BOOTSTRAP_TIMEOUT_MS}
        />
      </div>
    );
  }

  // Role is provider but no providers row yet — portal redirects to /provider/get-started; avoid empty-state flash
  if (!isLoadingProvider && !provider && !providerError) {
    return (
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">
        <PageHeader title={t("web.provider.dashboard.pageTitle")} breadcrumbs={dashboardBreadcrumbs} />
        <LoadingTimeout loadingMessage={t("web.provider.dashboard.continuingSetup")} timeoutMs={PROVIDER_BOOTSTRAP_TIMEOUT_MS} />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">
        <PageHeader title={t("web.provider.dashboard.pageTitle")} breadcrumbs={dashboardBreadcrumbs} />
        {isMissingProfile ? (
          <div className="provider-surface max-w-2xl mx-auto w-full">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-amber-500 mx-auto mb-3 sm:mb-4" />
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                {t("web.provider.dashboard.profileNotFoundTitle")}
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                {t("web.provider.dashboard.profileNotFoundBody")}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <Button
                  onClick={() => router.push("/provider/onboarding")}
                  className="bg-primary hover:bg-primary-hover text-white w-full sm:w-auto"
                >
                  {t("web.provider.dashboard.completeOnboarding")}
                </Button>
                <Button
                  variant="outline"
                  onClick={loadDashboard}
                  className="w-full sm:w-auto"
                >
                  {t("web.provider.common.retry")}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title={t("web.provider.dashboard.loadFailed")}
            description={error || t("web.provider.dashboard.loadFailedDescription")}
            action={{
              label: t("web.provider.common.retry"),
              onClick: loadDashboard,
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-full overflow-x-hidden pb-20 md:pb-0">
      <PageHeader
        title={t("web.provider.dashboard.pageTitle")}
        subtitle={t("web.provider.dashboard.pageSubtitle")}
        breadcrumbs={dashboardBreadcrumbs}
      />

      {isShowingSsrAllLocations && selectedLocationId ? (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600">
          <MapPin className="h-3.5 w-3.5" />
          {t("web.provider.dashboard.locationUpdating")}
        </div>
      ) : (
        <ActiveLocationChip className="mb-4" />
      )}

      {/* §provider-launch (2026-06): pending_approval providers now land here
          directly — surface a non-blocking "under review" banner. */}
      {provider?.status === "pending_approval" && (
        <div className="mb-4 sm:mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <Clock className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">{t("web.provider.dashboard.underReviewTitle")}</p>
            <p className="mt-0.5 text-sm text-amber-700">
              {t("web.provider.dashboard.underReviewBody")}
            </p>
          </div>
        </div>
      )}

      {/* Identity strip: rating (Uber-style), badge, service type, at-home radius */}
      <ProviderIdentityStrip
        averageRating={stats.average_rating}
        totalReviews={stats.total_reviews}
        badgeName={stats.gamification?.current_badge?.name ?? null}
        badgeColor={stats.gamification?.current_badge?.color ?? null}
        profile={
          stats.provider_profile ?? {
            supports_house_calls: false,
            supports_salon: false,
            max_service_distance_km: null,
            is_distance_filter_enabled: false,
          }
        }
      />

      {/* Business Type Info */}
      {provider?.business_type && (
        <div className="mb-4 sm:mb-6 provider-surface">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">{t("web.provider.dashboard.businessType")}</p>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    provider.business_type === "freelancer"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-purple-50 text-purple-700 border-purple-200"
                  }
                >
                  {provider.business_type === "freelancer"
                    ? t("web.provider.dashboard.freelancer")
                    : t("web.provider.dashboard.salonWithLocations")}
                </Badge>
                {provider.business_type === "freelancer" && (
                  <p className="text-xs text-gray-500">
                    {t("web.provider.dashboard.freelancerHint")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubscriptionSuccessNudge ? (
        <ProviderAppDownloadNudge
          successHeadline={t("web.provider.dashboard.subscriptionActive")}
          subtitle={t("web.provider.dashboard.subscriptionSubtitle")}
          showContinue
          continueLabel={t("web.provider.dashboard.continue")}
          onContinue={() => setShowSubscriptionSuccessNudge(false)}
          className="mb-4 sm:mb-6"
        />
      ) : null}

      {/* Quick Start Banner */}
      <QuickStartBanner />

      <ProviderDashboardAppDownloadCard />

      <ProviderDashboardExcellenceBanner />

      <DashboardInsightsPanel stats={stats} tenantCurrency={tenantCurrency} />

      {/* Rewards & Achievements Card - always show to encourage progress */}
      {stats.gamification ? (
        <>
          <RewardsCard gamification={stats.gamification} />
          <BadgeCongratsModal gamification={stats.gamification} />
        </>
      ) : (
        <RewardsCard
          gamification={{
            total_points: 0,
            current_badge: null,
            badge_earned_at: null,
            progress_to_next_badge: null,
          }}
        />
      )}

      {/* Key Metrics - Primary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatCard
          title={t("web.provider.dashboard.revenueThisMonth")}
          value={formatCurrency(stats.revenue_this_month, tenantCurrency)}
          subtitle={t("web.provider.dashboard.revenueGrowth", {
            sign: stats.revenue_growth > 0 ? "+" : "",
            percent: stats.revenue_growth,
          })}
          icon={ICON_DOLLAR_5}
          color="green"
          href="/provider/finance"
        />
        <StatCard
          title={t("web.provider.dashboard.travelFeesThisMonth")}
          value={formatCurrency(stats?.travel_fees_this_month ?? 0, tenantCurrency)}
          subtitle={(() => {
            const growth = computeGrowthPercent(
              stats?.travel_fees_this_month ?? 0,
              stats?.travel_fees_last_month ?? 0,
            );
            if ((stats?.travel_fees_this_month ?? 0) === 0 && (stats?.travel_fees_last_month ?? 0) === 0) {
              return t("web.provider.dashboard.fromAtHomeBookings");
            }
            return t("web.provider.dashboard.growthVsLastMonth", { label: formatGrowthLabel(growth) });
          })()}
          icon={ICON_HOME_5}
          color="purple"
          href="/provider/finance"
        />
        {payoutBalanceCard ? (
          <StatCard
            title={payoutBalanceCard.title}
            value={formatCurrency(payoutBalanceCard.value, tenantCurrency)}
            subtitle={payoutBalanceCard.subtitle}
            icon={ICON_DOLLAR_5}
            color={payoutBalanceCard.color}
            href={payoutBalanceCard.href}
          />
        ) : null}
        <StatCard
          title={t("web.provider.dashboard.pendingPayments")}
          value={formatCurrency(stats.pending_payments_amount, tenantCurrency)}
          subtitle={t("web.provider.dashboard.unpaidBookings", { count: stats.pending_payments_count })}
          icon={ICON_DOLLAR_5}
          color="orange"
          href="/provider/bookings?payment_status=pending"
        />
      </div>
      
      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatCard
          title={t("web.provider.dashboard.activeBookings")}
          value={activeBookings.toLocaleString()}
          subtitle={t("web.provider.dashboard.pendingCount", { count: stats.pending_bookings })}
          icon={ICON_CALENDAR_5}
          color="purple"
          href="/provider/bookings"
        />
      </div>

      {/* Today's Activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div 
          className="provider-metric-card-interactive"
          role="button"
          tabIndex={0}
          onClick={() => navigateTo("/provider/bookings")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateTo("/provider/bookings"); } }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm text-gray-600">{t("web.provider.dashboard.appointmentsToday")}</p>
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold">{stats.appointments_today}</p>
          <p className="text-xs text-gray-500 mt-1">{t("web.provider.dashboard.scheduledForToday")}</p>
        </div>
        <div 
          className="provider-metric-card-interactive"
          role="button"
          tabIndex={0}
          onClick={() => navigateTo("/provider/finance")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateTo("/provider/finance"); } }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm text-gray-600">{t("web.provider.dashboard.todaysRevenue")}</p>
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold">
            {formatCurrency(stats.revenue_today, tenantCurrency)}
          </p>
          {(stats.unrecognized_payments_today ?? 0) > 0 ? (
            <p className="text-xs text-amber-700 mt-1">
              {t("web.provider.dashboard.paymentsReconciling", { count: stats.unrecognized_payments_today })}
            </p>
          ) : null}
          <p className="text-xs text-gray-500 mt-1">{t("web.provider.dashboard.recognizedWhenPaid")}</p>
        </div>
        <div 
          className="provider-metric-card-interactive"
          role="button"
          tabIndex={0}
          onClick={() => navigateTo("/provider/bookings")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateTo("/provider/bookings"); } }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm text-gray-600">{t("web.provider.dashboard.completionRate")}</p>
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold">{stats.completion_rate.toFixed(1)}%</p>
          <p className="text-xs text-gray-500 mt-1">
            {t("web.provider.dashboard.completedFraction", {
              completed: stats.completed_bookings,
              total: stats.total_bookings,
            })}
          </p>
        </div>
      </div>

      {/* Earnings & Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        {/* Earnings Breakdown */}
        <div className="provider-surface">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-green-700">{t("web.provider.dashboard.yourEarnings")}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/finance")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/finance"); }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.serviceEarnings")}</span>
              <span className="text-lg font-semibold text-green-600">{formatCurrency(stats.service_earnings_total ?? 0, tenantCurrency)}</span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/ecommerce/orders")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/ecommerce/orders"); }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.productOrderEarnings")}</span>
              <span className="text-lg font-semibold text-emerald-700">{formatCurrency(stats.product_order_earnings_total || 0, tenantCurrency)}</span>
            </div>
            {(stats.product_order_retail_total ?? 0) > 0 || (stats.retail_sales_today ?? 0) > 0 ? (
              <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/ecommerce/orders")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/ecommerce/orders"); }}>
                <span className="text-sm text-gray-600">{t("web.provider.dashboard.retailPos")}</span>
                <span className="text-lg font-semibold text-emerald-800">{formatCurrency(stats.product_order_retail_total ?? 0, tenantCurrency)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/bookings")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/bookings"); }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.additionalChargeEarnings")}</span>
              <span className="text-lg font-semibold text-teal-700">{formatCurrency(stats.additional_charge_earnings_total || 0, tenantCurrency)}</span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/finance")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/finance"); }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.tips")}</span>
              <span className="text-lg font-semibold text-green-600">{formatCurrency(stats.tips_total || 0, tenantCurrency)}</span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/finance")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/finance"); }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.travelFees")}</span>
              <span className="text-lg font-semibold text-purple-600">{formatCurrency(stats.travel_fees_total || 0, tenantCurrency)}</span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/reports/gift-cards/sales")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/reports/gift-cards/sales"); }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.giftCardSales")}</span>
              <span className="text-lg font-semibold text-blue-600">{formatCurrency(stats.gift_card_sales_total || 0, tenantCurrency)}</span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/reports/packages/sales")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/reports/packages/sales"); }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.membershipSales")}</span>
              <span className="text-lg font-semibold text-indigo-600">{formatCurrency(stats.membership_sales_total || 0, tenantCurrency)}</span>
            </div>
            {(stats.other_earnings_total ?? 0) > 0 ? (
              <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/finance")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/finance"); }}>
                <span className="text-sm text-gray-600">{t("web.provider.dashboard.otherEarnings")}</span>
                <span className="text-lg font-semibold text-slate-700">{formatCurrency(stats.other_earnings_total || 0, tenantCurrency)}</span>
              </div>
            ) : null}
            {stats.earnings_mix_time_basis ? (
              <p className="text-xs text-gray-500 px-2">{stats.earnings_mix_time_basis}</p>
            ) : null}
            <div className="border-t pt-2">
              <div className="flex items-center justify-between p-2">
                <span className="text-sm text-gray-800 font-medium">{t("web.provider.dashboard.recognizedEarningsTotal")}</span>
                <span className="text-lg font-semibold text-gray-900">{formatCurrency(stats.recognized_earnings_total ?? stats.revenue_this_month ?? 0, tenantCurrency)}</span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-sm text-red-600">{t("web.provider.dashboard.refunds")}</span>
                <span className="text-lg font-semibold text-red-600">-{formatCurrency(stats.refunds_total || 0, tenantCurrency)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div className="provider-surface">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-orange-700">{t("web.provider.dashboard.yourExpenses")}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-2">
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.platformCommission")}</span>
              <span className="text-lg font-semibold text-orange-600">
                {formatCurrency(stats.platform_commission_paid ?? stats.platform_fees_paid ?? 0, tenantCurrency)}
              </span>
            </div>
            {(stats.platform_fees_deducted ?? 0) > 0 && (
              <div className="flex items-center justify-between p-2">
                <span className="text-sm text-gray-600">{t("web.provider.dashboard.customerPaidPlatformFees")}</span>
                <span className="text-lg font-semibold text-amber-700">
                  {formatCurrency(stats.platform_fees_deducted ?? 0, tenantCurrency)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/subscription")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigateTo("/provider/subscription"); }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.subscriptionsAndAds")}</span>
              <span className="text-lg font-semibold text-orange-600">{formatCurrency(stats.expenses_total || 0, tenantCurrency)}</span>
            </div>
            <div className="border-t pt-2">
              <div className="flex items-center justify-between p-2">
                <span className="text-sm text-gray-600">{t("web.provider.dashboard.thisMonth")}</span>
                <span className="text-lg font-semibold text-orange-600">{formatCurrency(stats.expenses_this_month || 0, tenantCurrency)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 px-2">{t("web.provider.dashboard.expensesFootnote")}</p>
          </div>
        </div>
      </div>

      {/* Performance Metrics & Booking Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        {/* Performance Metrics */}
        <div className="provider-surface">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{t("web.provider.dashboard.performance")}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.completionRate")}</span>
              <span className="text-lg font-semibold text-green-600">{stats.completion_rate.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.noShowRate")}</span>
              <span className={`text-lg font-semibold ${stats.no_show_rate > 10 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.no_show_rate.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" role="button" tabIndex={0} onClick={() => navigateTo("/provider/reviews")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateTo("/provider/reviews"); } }}>
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.averageRating")}</span>
              <span className="text-lg font-semibold text-orange-600">
                {stats.average_rating.toFixed(1)} ⭐
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{t("web.provider.dashboard.totalReviews")}</span>
              <span className="text-lg font-semibold">{stats.total_reviews}</span>
            </div>
          </div>
        </div>
        
        {/* Booking Status Breakdown */}
        <div className="provider-surface">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{t("web.provider.dashboard.bookingStatus")}</h3>
          <div className="space-y-3">
            <StatusCard
              title={t("web.provider.common.status.pending")}
              count={stats?.pending_bookings ?? 0}
              icon={ICON_CLOCK_4}
              color="yellow"
              href="/provider/bookings?status=pending"
            />
            <StatusCard
              title={t("web.provider.common.status.confirmed")}
              count={stats?.confirmed_bookings ?? 0}
              icon={ICON_CHECK_4}
              color="green"
              href="/provider/bookings?status=confirmed"
            />
            <StatusCard
              title={t("web.provider.common.status.completed")}
              count={stats?.completed_bookings ?? 0}
              icon={ICON_CHECK_4}
              color="blue"
              href="/provider/bookings?status=completed"
            />
            <StatusCard
              title={t("web.provider.common.status.cancelled")}
              count={stats?.cancelled_bookings ?? 0}
              icon={ICON_XCIRCLE_4}
              color="red"
              href="/provider/bookings?status=cancelled"
            />
            <StatusCard
              title={t("web.provider.common.status.noShow")}
              count={stats?.no_show_bookings ?? 0}
              icon={ICON_ALERT_4}
              color="gray"
              href="/provider/bookings?status=no_show"
            />
          </div>
        </div>
      </div>

      {/* Location Type Breakdown */}
      {(stats?.at_home_bookings ?? 0) > 0 || (stats?.at_salon_bookings ?? 0) > 0 ? (
        <div className="provider-surface mb-4 sm:mb-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{t("web.provider.dashboard.bookingTypeBreakdown")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* At Home Bookings */}
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Home className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-gray-900">{t("web.provider.dashboard.atHomeHouseCalls")}</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.teamMembers.total")}</span>
                  <span className="font-semibold">{stats?.at_home_bookings ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.completed")}</span>
                  <span className="font-semibold text-green-600">{stats?.at_home_completed ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.confirmed")}</span>
                  <span className="font-semibold text-blue-600">{stats?.at_home_confirmed ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.pending")}</span>
                  <span className="font-semibold text-yellow-600">{stats?.at_home_pending ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.cancelled")}</span>
                  <span className="font-semibold text-red-600">{stats?.at_home_cancelled ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.noShow")}</span>
                  <span className="font-semibold text-gray-600">{stats?.at_home_no_show ?? 0}</span>
                </div>
              </div>
            </div>

            {/* At Salon Bookings */}
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-gray-900">{t("web.provider.common.locationType.atSalon")}</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.teamMembers.total")}</span>
                  <span className="font-semibold">{stats?.at_salon_bookings ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.completed")}</span>
                  <span className="font-semibold text-green-600">{stats?.at_salon_completed ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.confirmed")}</span>
                  <span className="font-semibold text-blue-600">{stats?.at_salon_confirmed ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.pending")}</span>
                  <span className="font-semibold text-yellow-600">{stats?.at_salon_pending ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.cancelled")}</span>
                  <span className="font-semibold text-red-600">{stats?.at_salon_cancelled ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("web.provider.common.status.noShow")}</span>
                  <span className="font-semibold text-gray-600">{stats?.at_salon_no_show ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Schedule Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div 
          className="provider-surface cursor-pointer hover:shadow-md transition-all duration-200"
          role="button"
          tabIndex={0}
          onClick={() => navigateTo("/provider/calendar")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateTo("/provider/calendar"); } }}
        >
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{t("web.provider.common.statsRange.today")}</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">{t("web.provider.pages.team/totals.appointments")}</span>
              <span className="text-sm sm:text-base font-semibold">{stats.appointments_today}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">{t("web.provider.pages.team/totals.revenue")}</span>
              <span className="text-sm sm:text-base font-semibold">
                {formatCurrency(stats.revenue_today, tenantCurrency)}
              </span>
            </div>
          </div>
        </div>
        <div 
          className="provider-surface cursor-pointer hover:shadow-md transition-all duration-200"
          role="button"
          tabIndex={0}
          onClick={() => navigateTo("/provider/reports/bookings/summary")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateTo("/provider/reports/bookings/summary"); } }}
        >
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{t("web.provider.common.statsRange.thisWeek")}</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">{t("web.provider.pages.team/totals.appointments")}</span>
              <span className="text-sm sm:text-base font-semibold">{stats.appointments_this_week}</span>
            </div>
            <p className="text-xs text-gray-500">{t("web.provider.dashboard.scheduledThisWeek")}</p>
          </div>
        </div>
        <div 
          className="provider-surface cursor-pointer hover:shadow-md transition-all duration-200"
          role="button"
          tabIndex={0}
          onClick={() => navigateTo("/provider/reports/business/overview")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigateTo("/provider/reports/business/overview"); } }}
        >
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">{t("web.provider.common.statsRange.thisMonth")}</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">{t("web.provider.pages.team/totals.appointments")}</span>
              <span className="text-sm sm:text-base font-semibold">{stats.appointments_this_month}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">{t("web.provider.pages.team/totals.revenue")}</span>
              <span className="text-sm sm:text-base font-semibold">
                {formatCurrency(stats.revenue_this_month, tenantCurrency)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const StatCard = React.memo(function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  href,
  onClick,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "orange";
  href?: string;
  onClick?: () => void;
}) {
  const router = useRouter();
  const handleClick = href ? () => router.push(href) : onClick;

  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };

  const ringClasses = {
    blue: "ring-blue-100",
    green: "ring-green-100",
    purple: "ring-purple-100",
    orange: "ring-orange-100",
  };

  const ariaLabel = subtitle ? `${title}: ${value}. ${subtitle}` : `${title}: ${value}`;

  return (
    <div 
      className={cn(
        "provider-metric-card",
        handleClick && "provider-metric-card-interactive"
      )}
      onClick={handleClick}
      role={handleClick ? "button" : undefined}
      tabIndex={handleClick ? 0 : undefined}
      aria-label={handleClick ? ariaLabel : undefined}
      onKeyDown={handleClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      } : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={cn("p-2.5 rounded-xl ring-1 ring-inset", colorClasses[color], ringClasses[color])}>{icon}</div>
      </div>
      <p className="text-xs font-medium tracking-[0.01em] text-gray-500 mb-1">{title}</p>
      <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight tabular-nums mb-1">{value}</h3>
      {subtitle && (
        <p className={cn(
          "text-xs font-medium tabular-nums inline-flex items-center gap-1 px-2 py-0.5 rounded-full w-fit",
          subtitle.includes("+") || subtitle.toLowerCase().includes("growth")
            ? "text-green-700 bg-green-50"
            : subtitle.includes("-")
              ? "text-red-700 bg-red-50"
              : "text-gray-600 bg-gray-50"
        )}>{subtitle}</p>
      )}
    </div>
  );
});

const StatusCard = React.memo(function StatusCard({
  title,
  count,
  icon,
  color,
  href,
  onClick,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  color: "yellow" | "green" | "red" | "gray" | "blue";
  href?: string;
  onClick?: () => void;
}) {
  const router = useRouter();
  const handleClick = href ? () => router.push(href) : onClick;

  const colorClasses = {
    yellow: "bg-yellow-50 text-yellow-600",
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-50 text-gray-600",
    blue: "bg-blue-50 text-blue-600",
  };

  const ringClasses = {
    yellow: "ring-yellow-100",
    green: "ring-green-100",
    red: "ring-red-100",
    gray: "ring-gray-100",
    blue: "ring-blue-100",
  };

  return (
    <div 
      className={cn(
        "provider-metric-card",
        handleClick && "provider-metric-card-interactive"
      )}
      onClick={handleClick}
      role={handleClick ? "button" : undefined}
      tabIndex={handleClick ? 0 : undefined}
      aria-label={handleClick ? `${title}: ${count} bookings` : undefined}
      onKeyDown={handleClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      } : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-[0.01em] text-gray-500 mb-1">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums tracking-tight">{count}</p>
        </div>
        <div className={cn("p-2.5 rounded-xl ring-1 ring-inset flex-shrink-0", colorClasses[color], ringClasses[color])}>{icon}</div>
      </div>
    </div>
  );
});
