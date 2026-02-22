"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Home,
  Building2,
} from "lucide-react";
// Force fresh module evaluation
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { QuickStartBanner } from "@/components/provider/QuickStartBanner";
import { RewardsCard } from "@/components/provider/RewardsCard";
import { BadgeCongratsModal } from "@/components/provider/BadgeCongratsModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { handleError, withRetry, getErrorMessage } from "@/lib/provider-portal/error-handler";

interface ProviderDashboardStats {
  // Booking counts
  total_bookings: number;
  active_bookings: number;
  confirmed_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  no_show_bookings: number;
  pending_bookings: number;
  
  // Location type breakdown
  at_home_bookings: number;
  at_salon_bookings: number;
  at_home_completed: number;
  at_salon_completed: number;
  at_home_confirmed: number;
  at_salon_confirmed: number;
  at_home_pending: number;
  at_salon_pending: number;
  at_home_cancelled: number;
  at_salon_cancelled: number;
  at_home_no_show: number;
  at_salon_no_show: number;
  
  // Revenue - Current period
  revenue_this_month: number;
  revenue_today: number;
  revenue_growth: number;
  
  // Revenue - Lifetime
  lifetime_revenue: number;
  
  // Financial status
  available_balance: number;
  pending_payments_amount: number;
  pending_payments_count: number;
  
  // Revenue streams
  service_earnings_total: number;
  gift_card_sales_total: number;
  membership_sales_total: number;
  refunds_total: number;
  
  // Travel fees breakdown
  travel_fees_total: number;
  travel_fees_today: number;
  travel_fees_this_month: number;
  travel_fees_last_month: number;
  
  // Performance metrics
  completion_rate: number;
  no_show_rate: number;
  average_rating: number;
  total_reviews: number;
  
  // Schedule
  appointments_today: number;
  appointments_this_week: number;
  appointments_this_month: number;
  
  // Gamification
  gamification?: {
    total_points: number;
    lifetime_points: number;
    current_tier_points: number;
    current_badge: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      icon_url: string | null;
      tier: number;
      color: string;
      requirements: any;
      benefits: any;
    } | null;
    badge_earned_at: string | null;
    badge_expires_at: string | null;
    milestones: any[];
    recent_transactions: any[];
    progress_to_next_badge: {
      badge: {
        id: string;
        name: string;
        tier: number;
        color: string;
        requirements: any;
      };
      current_points: number;
      required_points: number;
      points_needed: number;
      progress_percentage: number;
    } | null;
  } | null;
}

export default function ProviderDashboard() {
  const router = useRouter();
  const { provider, isLoading: isLoadingProvider, loadError: providerError, selectedLocationId } = useProviderPortal();
  const [stats, setStats] = useState<ProviderDashboardStats | null>(null);
  // Start with loading false - we'll check cache first before showing loading
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMissingProfile, setIsMissingProfile] = useState(false);
  const hasLoadedRef = useRef(false);
  const loadingProviderIdRef = useRef<string | null>(null);
  const lastLocationIdRef = useRef<string | null>(null);
  
  // Cache dashboard stats in sessionStorage - MUST be defined before useEffect
  // Include location_id in cache key to separate caches per location
  const getDashboardCacheKey = () => {
    const baseKey = 'provider_dashboard_stats';
    return selectedLocationId ? `${baseKey}_${selectedLocationId}` : baseKey;
  };
  const DASHBOARD_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes - longer for stability
  
  // Check cache on mount BEFORE setting any loading state
  // IMPORTANT: Use expired cache as fallback too - prevents loading screen flash
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const cacheKey = getDashboardCacheKey();
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const _cacheAge = parsed.timestamp ? Date.now() - parsed.timestamp : Infinity;
          if (parsed.timestamp) {
            // Use cache immediately (even if expired) to prevent loading screen
            // The other useEffect will handle refreshing if needed
            setStats(parsed.data);
            setIsLoading(false);
            setError(null);
          }
        }
      } catch {
        // Ignore cache errors
      }
    }
  }, []); // Run only once on mount

  // Define loadDashboardFresh FIRST to avoid forward reference issues
  const loadDashboardFresh = useCallback(async (showLoading = true) => {
    const startTime = Date.now();
    try {
      // Only show loading if explicitly requested (not when refreshing in background)
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      setIsMissingProfile(false);

      const url = selectedLocationId 
        ? `/api/provider/dashboard?location_id=${selectedLocationId}`
        : "/api/provider/dashboard";
      
      const response = await withRetry(
        () => fetcher.get<{ data: ProviderDashboardStats }>(
          url,
          { timeoutMs: 5000 } // Reduced from 8s to 5s for faster failure
        ),
        {
          maxRetries: 1, // Reduced from 2 to 1 for faster response
          retryDelay: 500, // Reduced from 1000ms to 500ms
          onRetry: (_attempt) => {
            // Silently retry - error handler will show toast if needed
          },
        }
      );
      
      const _duration = Date.now() - startTime;
      
      setStats(response.data);
      
      // Cache the response
      if (typeof window !== 'undefined') {
        try {
          const cacheKey = getDashboardCacheKey();
          sessionStorage.setItem(cacheKey, JSON.stringify({
            data: response.data,
            timestamp: Date.now(),
          }));
        } catch {
          // Ignore storage errors
        }
      }
    } catch (err) {
      const _duration = Date.now() - startTime;
      // Check if the error is "Provider profile not found"
      if (err instanceof FetchError && 
          (err.message.includes("Provider profile not found") || 
           err.status === 404)) {
        setIsMissingProfile(true);
        setError("Provider profile not found. Please complete onboarding to continue.");
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
  }, [selectedLocationId]);

  const loadDashboard = useCallback(async () => {
    // Check cache first - use it immediately to prevent loading screen
    if (typeof window !== 'undefined') {
      try {
        const cacheKey = getDashboardCacheKey();
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          const cacheAge = Date.now() - parsed.timestamp;
          if (parsed.timestamp && cacheAge < DASHBOARD_CACHE_DURATION) {
            // Use cached data immediately - don't show loading
            setStats(parsed.data);
            setIsLoading(false);
            setError(null);
            
            // Refresh in background if cache is > 10 seconds old
            // Pass showLoading=false to prevent showing loading screen during background refresh
            if (cacheAge > 10 * 1000) {
              loadDashboardFresh(false).catch(() => {
                // Silently fail background refresh - keep cached data
              });
            }
            return;
          } else {
            // Cache expired but still use it as fallback while loading fresh data
            // This prevents the flash of loading screen
            setStats(parsed.data);
            setIsLoading(false); // Explicitly set loading to false
            setError(null);
            // Refresh in background without showing loading
            loadDashboardFresh(false).catch(() => {
              // Silently fail - keep expired cache
            });
            return;
          }
      }
    } catch {
      // Ignore cache errors
    }
  }

    await loadDashboardFresh(true);
  }, [loadDashboardFresh, selectedLocationId]);

  useEffect(() => {
    // IMPORTANT: Check cache FIRST before waiting for provider
    // This prevents loading screen when returning to the tab after browser loses focus
    if (typeof window !== 'undefined' && !stats) {
      try {
        const cacheKey = getDashboardCacheKey();
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.timestamp && Date.now() - parsed.timestamp < DASHBOARD_CACHE_DURATION) {
            // Restore from cache immediately - don't wait for provider
            setStats(parsed.data);
            setIsLoading(false);
            setError(null);
          }
        }
      } catch {
        // Ignore cache errors
      }
    }
    
    // Wait for provider to load before loading dashboard stats
    // IMPORTANT: Don't reset loading state if we already have stats (prevents flash of loading on tab switch)
    if (!isLoadingProvider && provider) {
      // Prevent infinite loops; refetch when provider or location changes
      const currentProviderId = provider.id;
      const locationChanged = lastLocationIdRef.current !== selectedLocationId;
      if (!hasLoadedRef.current || loadingProviderIdRef.current !== currentProviderId || locationChanged) {
        hasLoadedRef.current = true;
        loadingProviderIdRef.current = currentProviderId;
        lastLocationIdRef.current = selectedLocationId ?? null;
        // Only set loading if we don't have stats yet
        if (!stats) {
          setIsLoading(true);
        }
        loadDashboard();
      } else if (stats) {
        // We already have stats for this provider - don't show loading
        setIsLoading(false);
      }
    } else if (!isLoadingProvider && providerError) {
      setError(providerError);
      setIsLoading(false);
      hasLoadedRef.current = false;
      loadingProviderIdRef.current = null;
    } else if (isLoadingProvider && stats) {
      // Provider is loading but we have cached stats - don't show loading
      setIsLoading(false);
    }
    // Only depend on isLoadingProvider and provider.id, not the entire provider object
    // loadDashboard is stable (only depends on loadDashboardFresh which has empty deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingProvider, provider?.id, providerError, stats, selectedLocationId]);

  // Memoize calculated values to prevent unnecessary recalculations
  // MOVED BEFORE EARLY RETURNS to fix hooks order violation
  const activeBookings = useMemo(() => {
    if (!stats) return 0;
    return stats.active_bookings;
  }, [stats]);

  // Show loading if provider is still loading or dashboard is loading
  // BUT: Don't show loading if we have cached stats (prevents flash of loading screen)
  // This makes the dashboard feel instant when returning to the tab
  const shouldShowLoading = (isLoadingProvider || isLoading) && !stats;
  
  if (shouldShowLoading) {
    return (
      <SettingsDetailLayout
        title="Dashboard"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Dashboard" }
        ]}
      >
        <LoadingTimeout 
          loadingMessage={isLoadingProvider ? "Loading provider..." : "Loading dashboard..."} 
          timeoutMs={10000}
        />
      </SettingsDetailLayout>
    );
  }

  if (error || !stats) {
    return (
      <SettingsDetailLayout
        title="Dashboard"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Dashboard" }
        ]}
      >
        {isMissingProfile ? (
          <div className="bg-white rounded-lg border p-4 sm:p-6 md:p-8 max-w-2xl mx-auto w-full">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-amber-500 mx-auto mb-3 sm:mb-4" />
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                Provider Profile Not Found
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                You have a provider account, but your provider profile hasn't been set up yet. 
                Complete the onboarding process to start accepting bookings and manage your business.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <Button
                  onClick={() => router.push("/provider/onboarding")}
                  className="bg-[#FF0077] hover:bg-[#D60565] text-white w-full sm:w-auto"
                >
                  Complete Onboarding
                </Button>
                <Button
                  variant="outline"
                  onClick={loadDashboard}
                  className="w-full sm:w-auto"
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Failed to load dashboard"
            description={error || "Unable to load dashboard data"}
            action={{
              label: "Retry",
              onClick: loadDashboard,
            }}
          />
        )}
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Dashboard"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Dashboard" }
      ]}
      showCloseButton={false}
    >
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your business performance"
      />

      {/* Business Type Info */}
      {provider?.business_type && (
        <div className="mb-4 sm:mb-6 p-4 bg-white border rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Business Type</p>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    provider.business_type === "freelancer"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-purple-50 text-purple-700 border-purple-200"
                  }
                >
                  {provider.business_type === "freelancer" ? "Freelancer" : "Salon with Locations"}
                </Badge>
                {provider.business_type === "freelancer" && (
                  <p className="text-xs text-gray-500">
                    You are set up as a staff member for calendar bookings and have location information for at-home services.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Start Banner */}
      <QuickStartBanner />

      {/* Rewards & Achievements Card */}
      {stats.gamification && (
        <>
          <RewardsCard gamification={stats.gamification} />
          <BadgeCongratsModal gamification={stats.gamification} />
        </>
      )}

      {/* Key Metrics - Primary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatCard
          title="Revenue This Month"
          value={`ZAR ${stats.revenue_this_month.toLocaleString()}`}
          subtitle={`${stats.revenue_growth > 0 ? "+" : ""}${stats.revenue_growth}% vs last month`}
          icon={<DollarSign className="w-5 h-5" />}
          color="green"
          onClick={() => router.push("/provider/finance")}
        />
        <StatCard
          title="Travel Fees This Month"
          value={`ZAR ${(stats?.travel_fees_this_month ?? 0).toLocaleString()}`}
          subtitle={stats?.travel_fees_last_month ? 
            `${stats.travel_fees_this_month > stats.travel_fees_last_month ? "+" : ""}${Math.round(((stats.travel_fees_this_month - stats.travel_fees_last_month) / Math.max(stats.travel_fees_last_month, 1)) * 100)}% vs last month` :
            "From at-home bookings"}
          icon={<Home className="w-5 h-5" />}
          color="purple"
          onClick={() => router.push("/provider/finance")}
        />
        <StatCard
          title="Available Balance"
          value={`ZAR ${stats.available_balance.toLocaleString()}`}
          subtitle="Ready to withdraw"
          icon={<DollarSign className="w-5 h-5" />}
          color="blue"
          onClick={() => router.push("/provider/finance")}
        />
        <StatCard
          title="Pending Payments"
          value={`ZAR ${stats.pending_payments_amount.toLocaleString()}`}
          subtitle={`${stats.pending_payments_count} unpaid bookings`}
          icon={<DollarSign className="w-5 h-5" />}
          color="orange"
          onClick={() => router.push("/provider/bookings?payment_status=pending")}
        />
      </div>
      
      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatCard
          title="Active Bookings"
          value={activeBookings.toLocaleString()}
          subtitle={`${stats.pending_bookings} pending`}
          icon={<Calendar className="w-5 h-5" />}
          color="purple"
          onClick={() => router.push("/provider/bookings")}
        />
      </div>

      {/* Today's Activity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div 
          className="bg-white border rounded-lg p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/provider/bookings")}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm text-gray-600">Appointments Today</p>
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold">{stats.appointments_today}</p>
          <p className="text-xs text-gray-500 mt-1">Scheduled for today</p>
        </div>
        <div 
          className="bg-white border rounded-lg p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/provider/finance")}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm text-gray-600">Today's Revenue</p>
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold">
            ZAR {stats.revenue_today.toLocaleString()}
          </p>
        </div>
        <div 
          className="bg-white border rounded-lg p-3 sm:p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/provider/bookings")}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm text-gray-600">Completion Rate</p>
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold">{stats.completion_rate.toFixed(1)}%</p>
          <p className="text-xs text-gray-500 mt-1">{stats.completed_bookings}/{stats.total_bookings} completed</p>
        </div>
      </div>

      {/* Revenue Streams (This Month) */}
      <div className="bg-white border rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
        <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Revenue Breakdown (This Month)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
          <div className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" onClick={() => router.push("/provider/finance")}>
            <p className="text-xs text-gray-600 mb-1">Service Earnings</p>
            <p className="text-lg sm:text-xl font-semibold text-green-600">
              ZAR {(stats.service_earnings_total || 0).toLocaleString()}
            </p>
          </div>
          <div className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" onClick={() => router.push("/provider/finance")}>
            <p className="text-xs text-gray-600 mb-1">Travel Fees</p>
            <p className="text-lg sm:text-xl font-semibold text-purple-600">
              ZAR {(stats?.travel_fees_this_month || 0).toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">At-home bookings</p>
          </div>
          <div className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" onClick={() => router.push("/provider/reports/gift-cards")}>
            <p className="text-xs text-gray-600 mb-1">Gift Card Sales</p>
            <p className="text-lg sm:text-xl font-semibold text-blue-600">
              ZAR {(stats.gift_card_sales_total || 0).toLocaleString()}
            </p>
          </div>
          <div className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" onClick={() => router.push("/provider/reports/packages")}>
            <p className="text-xs text-gray-600 mb-1">Membership Sales</p>
            <p className="text-lg sm:text-xl font-semibold text-indigo-600">
              ZAR {(stats.membership_sales_total || 0).toLocaleString()}
            </p>
          </div>
          <div className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" onClick={() => router.push("/provider/finance")}>
            <p className="text-xs text-gray-600 mb-1">Refunds</p>
            <p className="text-lg sm:text-xl font-semibold text-red-600">
              ZAR {(stats.refunds_total || 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Performance Metrics & Booking Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
        {/* Performance Metrics */}
        <div className="bg-white border rounded-lg p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Performance</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Completion Rate</span>
              <span className="text-lg font-semibold text-green-600">{stats.completion_rate.toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">No-Show Rate</span>
              <span className={`text-lg font-semibold ${stats.no_show_rate > 10 ? 'text-red-600' : 'text-green-600'}`}>
                {stats.no_show_rate.toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center justify-between cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors" onClick={() => router.push("/provider/reviews")}>
              <span className="text-sm text-gray-600">Average Rating</span>
              <span className="text-lg font-semibold text-orange-600">
                {stats.average_rating.toFixed(1)} ⭐
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Total Reviews</span>
              <span className="text-lg font-semibold">{stats.total_reviews}</span>
            </div>
          </div>
        </div>
        
        {/* Booking Status Breakdown */}
        <div className="bg-white border rounded-lg p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Booking Status</h3>
          <div className="space-y-3">
            <StatusCard
              title="Pending"
              count={stats?.pending_bookings ?? 0}
              icon={<Clock className="w-4 h-4" />}
              color="yellow"
              onClick={() => router.push("/provider/bookings?status=pending")}
            />
            <StatusCard
              title="Confirmed"
              count={stats?.confirmed_bookings ?? 0}
              icon={<CheckCircle2 className="w-4 h-4" />}
              color="green"
              onClick={() => router.push("/provider/bookings?status=confirmed")}
            />
            <StatusCard
              title="Completed"
              count={stats?.completed_bookings ?? 0}
              icon={<CheckCircle2 className="w-4 h-4" />}
              color="blue"
              onClick={() => router.push("/provider/bookings?status=completed")}
            />
            <StatusCard
              title="Cancelled"
              count={stats?.cancelled_bookings ?? 0}
              icon={<XCircle className="w-4 h-4" />}
              color="red"
              onClick={() => router.push("/provider/bookings?status=cancelled")}
            />
            <StatusCard
              title="No Show"
              count={stats?.no_show_bookings ?? 0}
              icon={<AlertCircle className="w-4 h-4" />}
              color="gray"
              onClick={() => router.push("/provider/bookings?status=no_show")}
            />
          </div>
        </div>
      </div>

      {/* Location Type Breakdown */}
      {(stats?.at_home_bookings ?? 0) > 0 || (stats?.at_salon_bookings ?? 0) > 0 ? (
        <div className="bg-white border rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Booking Type Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* At Home Bookings */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Home className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-gray-900">At Home / House Calls</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total</span>
                  <span className="font-semibold">{stats?.at_home_bookings ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Completed</span>
                  <span className="font-semibold text-green-600">{stats?.at_home_completed ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Confirmed</span>
                  <span className="font-semibold text-blue-600">{stats?.at_home_confirmed ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pending</span>
                  <span className="font-semibold text-yellow-600">{stats?.at_home_pending ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cancelled</span>
                  <span className="font-semibold text-red-600">{stats?.at_home_cancelled ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">No Show</span>
                  <span className="font-semibold text-gray-600">{stats?.at_home_no_show ?? 0}</span>
                </div>
              </div>
            </div>

            {/* At Salon Bookings */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h4 className="font-semibold text-gray-900">At Salon</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total</span>
                  <span className="font-semibold">{stats?.at_salon_bookings ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Completed</span>
                  <span className="font-semibold text-green-600">{stats?.at_salon_completed ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Confirmed</span>
                  <span className="font-semibold text-blue-600">{stats?.at_salon_confirmed ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pending</span>
                  <span className="font-semibold text-yellow-600">{stats?.at_salon_pending ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cancelled</span>
                  <span className="font-semibold text-red-600">{stats?.at_salon_cancelled ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">No Show</span>
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
          className="bg-white border rounded-lg p-4 sm:p-6 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/provider/calendar")}
        >
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Today</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">Appointments</span>
              <span className="text-sm sm:text-base font-semibold">{stats.appointments_today}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">Revenue</span>
              <span className="text-sm sm:text-base font-semibold">
                ZAR {stats.revenue_today.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
        <div 
          className="bg-white border rounded-lg p-4 sm:p-6 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/provider/reports/bookings")}
        >
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">This Week</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">Appointments</span>
              <span className="text-sm sm:text-base font-semibold">{stats.appointments_this_week}</span>
            </div>
            <p className="text-xs text-gray-500">Scheduled this week</p>
          </div>
        </div>
        <div 
          className="bg-white border rounded-lg p-4 sm:p-6 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push("/provider/reports/business")}
        >
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">This Month</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">Appointments</span>
              <span className="text-sm sm:text-base font-semibold">{stats.appointments_this_month}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs sm:text-sm text-gray-600">Revenue</span>
              <span className="text-sm sm:text-base font-semibold">
                ZAR {stats.revenue_this_month.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </SettingsDetailLayout>
  );
}

const StatCard = React.memo(function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
  onClick,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "orange";
  onClick?: () => void;
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-green-50 text-green-600",
    purple: "bg-purple-50 text-purple-600",
    orange: "bg-orange-50 text-orange-600",
  };

  return (
    <div 
      className={`bg-white border rounded-lg p-3 sm:p-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]' : ''}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
      <h3 className="text-xl sm:text-2xl font-semibold mb-1">{value}</h3>
      <p className="text-xs sm:text-sm text-gray-600">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
});

const StatusCard = React.memo(function StatusCard({
  title,
  count,
  icon,
  color,
  onClick,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  color: "yellow" | "green" | "red" | "gray" | "blue";
  onClick?: () => void;
}) {
  const colorClasses = {
    yellow: "bg-yellow-50 text-yellow-600",
    green: "bg-green-50 text-green-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-50 text-gray-600",
    blue: "bg-blue-50 text-blue-600",
  };

  return (
    <div 
      className={`bg-white border rounded-lg p-3 sm:p-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow active:scale-[0.98]' : ''}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-xl sm:text-2xl font-semibold">{count}</p>
        </div>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
});
