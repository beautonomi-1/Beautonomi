"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Megaphone,
  RefreshCw,
  Sparkles,
  Star,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { ProviderOrgSwitcher } from "@/components/provider/ProviderOrgSwitcher";
import { StartOwnBusinessCard } from "@/components/provider/StartOwnBusinessCard";
import {
  MORE_MENU_SECTIONS,
  MORE_QUICK_ACTIONS,
  formatBadgeCount,
  getRouteBadgeCount,
  passesFeatureFlag,
  passesMorePermissionGate,
  type ProviderNavCounts,
} from "@/components/provider/more/provider-more-config";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { usePermissions } from "@/hooks/usePermissions";
import { fetcher, DEFAULT_FETCH_TIMEOUT_MS } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";

type SetupStatusStep = {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  required: boolean;
  link: string;
};

type SetupStatusData = {
  isComplete: boolean;
  completionPercentage: number;
  steps: SetupStatusStep[];
};

type MeProfileLite = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  provider_rating_average?: number | null;
  provider_review_count?: number | null;
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
  next_payout_date?: string | null;
};

type TeamAccessData = {
  can_process_payments?: boolean;
  can_request_payouts?: boolean;
  is_business_owner?: boolean;
};

type PaycloudSettingsLite = {
  ready?: boolean;
  accept_paycloud?: boolean;
};

const DEFAULT_EXPANDED: Record<string, boolean> = {
  "Grow your business": true,
  Operations: true,
  "E-Commerce & Products": true,
  Business: true,
  Engagement: true,
  Settings: true,
};

const COMPLETION_ITEM_DISPLAY_LIMIT = 10;

export function ProviderMoreHub() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { provider, isLoading: portalLoading } = useProviderPortal();
  const { isOwner, permissions, hasPermission } = usePermissions();
  const { format: formatMoney } = useProviderMoneyFormat();

  const paystackTerminalEnabled = useFeatureFlag("payment_paystack_virtual_terminal");
  const yocoEnabled = useFeatureFlag("payment_yoco");
  const paycloudEnabled = useFeatureFlag("payment_paycloud");

  const [expandedSections, setExpandedSections] = useState(DEFAULT_EXPANDED);
  const [refreshing, setRefreshing] = useState(false);

  const [meProfile, setMeProfile] = useState<MeProfileLite | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatusData | null>(null);
  const [setupError, setSetupError] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [navCounts, setNavCounts] = useState<ProviderNavCounts | null>(null);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummaryData | null>(null);
  const [payoutAccounts, setPayoutAccounts] = useState<PayoutAccountSummary[]>([]);
  const [payoutAccountsLoading, setPayoutAccountsLoading] = useState(true);
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutScheduleData | null>(null);
  const [teamAccess, setTeamAccess] = useState<TeamAccessData | null>(null);
  const [paycloudSettings, setPaycloudSettings] = useState<PaycloudSettingsLite | null>(null);

  const canEditSettings = isOwner || hasPermission("edit_settings");
  const canRequestPayouts =
    canEditSettings ||
    teamAccess?.can_request_payouts === true ||
    teamAccess?.is_business_owner === true;
  const canViewSales =
    isOwner ||
    hasPermission("view_sales") ||
    hasPermission("create_sales");

  const permissionOpts = useMemo(
    () => ({
      isOwner,
      permissions,
      canRequestPayouts,
      canViewSales,
    }),
    [isOwner, permissions, canRequestPayouts, canViewSales],
  );

  const featureFlags = useMemo(
    () => ({
      paystackTerminalEnabled,
      yocoEnabled,
      paycloudEnabled,
    }),
    [paystackTerminalEnabled, yocoEnabled, paycloudEnabled],
  );

  const loadData = useCallback(async () => {
    const tasks: Promise<void>[] = [];

    tasks.push(
      fetcher
        .get<{ data: MeProfileLite }>("/api/me/profile", { timeoutMs: DEFAULT_FETCH_TIMEOUT_MS })
        .then((res) => setMeProfile(res.data ?? null))
        .catch(() => {}),
    );

    tasks.push(
      fetcher
        .get<{ data: SetupStatusData }>("/api/provider/setup-status", {
          timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        })
        .then((res) => {
          setSetupStatus(res.data ?? null);
          setSetupError(false);
        })
        .catch(() => {
          setSetupError(true);
        })
        .finally(() => setSetupLoading(false)),
    );

    tasks.push(
      fetcher
        .get<{ data: ProviderNavCounts }>("/api/provider/nav-counts", {
          timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        })
        .then((res) => setNavCounts(res.data ?? null))
        .catch(() => {}),
    );

    if (canEditSettings) {
      setPayoutAccountsLoading(true);
      tasks.push(
        fetcher
          .get<{ data: FinanceSummaryData }>("/api/provider/finance?range=month", {
            timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
          })
          .then((res) => setFinanceSummary(res.data ?? null))
          .catch(() => {}),
      );
      tasks.push(
        fetcher
          .get<{ data: PayoutAccountSummary[] }>("/api/provider/payout-accounts", {
            timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
          })
          .then((res) => setPayoutAccounts(Array.isArray(res.data) ? res.data : []))
          .catch(() => setPayoutAccounts([]))
          .finally(() => setPayoutAccountsLoading(false)),
      );
      tasks.push(
        fetcher
          .get<{ data: PayoutScheduleData }>("/api/provider/payouts/next-date", {
            timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
          })
          .then((res) => setPayoutSchedule(res.data ?? null))
          .catch(() => {}),
      );
    } else {
      setPayoutAccountsLoading(false);
    }

    tasks.push(
      fetcher
        .get<{ data: TeamAccessData }>("/api/provider/team-access", {
          timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        })
        .then((res) => setTeamAccess(res.data ?? null))
        .catch(() => {}),
    );

    if (paycloudEnabled) {
      tasks.push(
        fetcher
          .get<{ data: PaycloudSettingsLite }>("/api/provider/paycloud/settings", {
            timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
          })
          .then((res) => setPaycloudSettings(res.data ?? null))
          .catch(() => {}),
      );
    }

    await Promise.all(tasks);
  }, [canEditSettings, paycloudEnabled]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    setSetupLoading(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

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
    const em = meProfile?.email?.trim() || user?.email?.trim() || "";
    if (em) parts.push(em);
    return parts.join(" · ");
  }, [meProfile?.phone, meProfile?.email, user?.email]);

  const completionItems = setupStatus?.steps ?? [];
  const completionPct = setupStatus?.completionPercentage ?? 0;
  const showCompletionCard =
    isOwner && completionItems.length > 0 && !setupStatus?.isComplete;
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
  const orderedCompletionSteps = [
    ...completionItems.filter((s) => s.required),
    ...completionItems.filter((s) => !s.required && !s.completed),
  ];
  const completionStepsToRender = orderedCompletionSteps.slice(
    0,
    COMPLETION_ITEM_DISPLAY_LIMIT,
  );
  const completionOverflowCount = Math.max(
    0,
    orderedCompletionSteps.length - completionStepsToRender.length,
  );

  const availablePayout = Number(financeSummary?.earnings?.available_balance ?? 0);
  const pendingPayouts = Number(financeSummary?.earnings?.pending_payouts ?? 0);
  const minimumPayout =
    financeSummary?.earnings?.minimum_payout_amount != null
      ? Number(financeSummary.earnings.minimum_payout_amount)
      : null;
  const primaryPayoutAccount =
    payoutAccounts.find((a) => a.is_primary === true) ??
    payoutAccounts.find((a) => a.active !== false) ??
    payoutAccounts[0];
  const hasPayoutAccount = payoutAccounts.length > 0;
  const payoutAccountLast4 =
    primaryPayoutAccount?.account_number_last4 ??
    primaryPayoutAccount?.account_number?.slice(-4);
  const nextPayoutDate = payoutSchedule?.next_payout_date
    ? new Date(payoutSchedule.next_payout_date)
    : null;
  const requestPayoutDisabledReason = !canRequestPayouts
    ? "Requires Edit settings permission"
    : !hasPayoutAccount
      ? "Add a bank account first"
      : minimumPayout != null && availablePayout < minimumPayout
        ? `Minimum payout is ${formatMoney(minimumPayout)}`
        : null;

  const filteredQuickActions = MORE_QUICK_ACTIONS.filter(
    (action) =>
      passesFeatureFlag(action.featureFlag, featureFlags) &&
      passesMorePermissionGate(action.permission, permissionOpts),
  );

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  };

  return (
    <div className="pb-8" data-testid="provider-more-hub">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">More</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Finance, bookings, growth, and settings — same as the mobile app
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onRefresh()}
          disabled={refreshing || portalLoading}
          className="shrink-0"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      <div className="flex items-center gap-3.5 mb-5">
        <Link
          href="/provider/account/profile"
          className="flex flex-1 items-center gap-3.5 p-1 -mx-1 rounded-xl hover:bg-gray-50 transition-colors touch-manipulation min-w-0"
        >
          <Avatar className="h-14 w-14 shrink-0">
            {meProfile?.avatar_url ? (
              <AvatarImage src={meProfile.avatar_url} alt="" />
            ) : null}
            <AvatarFallback className="bg-gray-900 text-white text-lg font-bold">
              {headerInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold text-gray-900">My profile</span>
              {(provider as { is_verified?: boolean } | null)?.is_verified ? (
                <VerifiedBadge verified size="md" />
              ) : null}
            </div>
            {headerSubtitle ? (
              <p className="text-sm text-gray-500 mt-0.5 truncate">{headerSubtitle}</p>
            ) : null}
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300 shrink-0" />
        </Link>
        {meProfile?.provider_rating_average != null ? (
          <Link
            href="/provider/reviews"
            className="inline-flex shrink-0 flex-col items-center rounded-xl border border-gray-100 bg-white px-2.5 py-2 hover:bg-gray-50"
          >
            <span className="inline-flex items-center gap-1 text-gray-900">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-bold">{meProfile.provider_rating_average.toFixed(1)}</span>
            </span>
            <span className="text-[10px] text-gray-500">
              {meProfile.provider_review_count ?? 0} reviews
            </span>
          </Link>
        ) : null}
      </div>

      <ProviderOrgSwitcher variant="light" className="mb-4" />
      <StartOwnBusinessCard />

      {canEditSettings ? (
        <div className="mb-4 rounded-2xl border border-green-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100">
              <Wallet className="h-6 w-6 text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Provider payouts
              </p>
              <p className="text-3xl font-extrabold text-emerald-950 tracking-tight mt-0.5">
                {formatMoney(availablePayout)}
              </p>
              <p className="text-sm text-emerald-700">All-time available to withdraw</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {minimumPayout != null ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                Min {formatMoney(minimumPayout)}
              </span>
            ) : null}
            {pendingPayouts > 0 ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                {formatMoney(pendingPayouts)} pending
              </span>
            ) : null}
            {nextPayoutDate && Number.isFinite(nextPayoutDate.getTime()) ? (
              <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-900">
                Next run {nextPayoutDate.toLocaleDateString()}
              </span>
            ) : null}
          </div>

          <Link
            href={
              hasPayoutAccount || !canEditSettings
                ? "/provider/finance?tab=payouts"
                : "/provider/payment-setup"
            }
            className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-800 px-3.5 py-3 text-white hover:bg-emerald-900 transition-colors"
          >
            <Wallet className="h-5 w-5" />
            <span className="flex-1 font-bold">
              {hasPayoutAccount ? "Request payout" : "Set up bank account"}
            </span>
            <ChevronRight className="h-4 w-4 opacity-80" />
          </Link>

          <Link
            href="/provider/settings/payout-accounts"
            className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3.5 py-3 hover:bg-emerald-50/50 transition-colors"
          >
            {hasPayoutAccount ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">Bank account setup</p>
              <p className="text-xs text-gray-500 truncate">
                {payoutAccountsLoading
                  ? "Checking payout account..."
                  : hasPayoutAccount
                    ? `${primaryPayoutAccount?.bank_name || "Bank account"}${payoutAccountLast4 ? ` • •••• ${payoutAccountLast4}` : ""}`
                    : "Add a bank account before requesting payouts"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300" />
          </Link>

          {requestPayoutDisabledReason ? (
            <p className="mt-2 text-xs text-amber-800">{requestPayoutDisabledReason}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Link
          href="/provider/settings/ads"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 hover:bg-amber-100/80 transition-colors touch-manipulation"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-200/40">
              <Megaphone className="h-5 w-5 text-amber-700" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wide text-amber-900">Ads</span>
          </div>
          <p className="font-bold text-amber-950">Buy ads</p>
          <p className="text-xs text-amber-800 mt-1 leading-snug">
            Boost discovery & fill your calendar
          </p>
        </Link>
        <Link
          href="/provider/settings/services/memberships"
          className="rounded-2xl border border-violet-200 bg-violet-50 p-3.5 hover:bg-violet-100/80 transition-colors touch-manipulation"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-200/40">
              <CreditCardIcon />
            </div>
            <span className="text-xs font-bold uppercase tracking-wide text-violet-900">
              Recurring
            </span>
          </div>
          <p className="font-bold text-violet-950">Sell memberships</p>
          <p className="text-xs text-violet-800 mt-1 leading-snug">
            Plans, perks & subscriber revenue
          </p>
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredQuickActions.map((action) => {
          const Icon = action.icon;
          const badge = formatBadgeCount(getRouteBadgeCount(action.href, navCounts));
          const isCardMachines = action.href.includes("card-machines");
          return (
            <Link
              key={action.href}
              href={action.href}
              className="relative flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-3 py-4 hover:bg-gray-50 hover:border-gray-200 transition-colors touch-manipulation min-h-[96px]"
            >
              <div
                className="relative flex h-10 w-10 items-center justify-center rounded-xl mb-2"
                style={{ backgroundColor: `${action.color}20` }}
              >
                <Icon className="h-5 w-5" style={{ color: action.color }} />
                {badge ? (
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
                    {badge}
                  </span>
                ) : null}
              </div>
              <span className="text-xs font-medium text-gray-700 text-center leading-snug">
                {action.label}
              </span>
              {isCardMachines && paycloudEnabled ? (
                <span className="mt-1 text-[10px] text-gray-500 text-center">
                  {paycloudSettings?.ready
                    ? "Ready"
                    : paycloudSettings?.accept_paycloud
                      ? "Set up"
                      : "Off"}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {!setupLoading && setupError && !setupStatus ? (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Couldn&apos;t load profile setup status. Check your connection and try again.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-amber-300 bg-amber-100 hover:bg-amber-200"
            onClick={() => {
              setSetupLoading(true);
              void loadData();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {!setupLoading && showCompletionCard ? (
        <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <button
            type="button"
            className="w-full text-left"
            onClick={() => {
              const href = firstIncompleteStep?.link ?? "/provider/get-started";
              router.push(href);
            }}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50">
                <Sparkles className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">Complete your business profile</p>
                <p className="text-sm text-gray-500 mt-1">
                  {incompleteRequiredCount > 0
                    ? `${incompleteRequiredCount} required task${incompleteRequiredCount === 1 ? "" : "s"} left${incompleteOptionalCount > 0 ? ` · ${incompleteOptionalCount} optional` : ""}`
                    : incompleteOptionalCount > 0
                      ? `All required tasks done · ${incompleteOptionalCount} optional improvement${incompleteOptionalCount === 1 ? "" : "s"}`
                      : "Finish setup to start accepting bookings"}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-gray-600">{completionPct}%</span>
                </div>
              </div>
            </div>
          </button>

          {completionStepsToRender.length > 0 ? (
            <div className="mt-3 space-y-2 border-t border-gray-50 pt-3">
              {completionStepsToRender.map((step) => {
                const missingRequired = step.required && !step.completed;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => router.push(step.link)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left hover:bg-gray-50"
                  >
                    {step.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    ) : missingRequired ? (
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                      <Circle className="h-4 w-4 text-gray-400 shrink-0" />
                    )}
                    <span
                      className={cn(
                        "flex-1 text-sm truncate",
                        step.completed
                          ? "text-green-800 font-medium"
                          : missingRequired
                            ? "text-red-800"
                            : "text-gray-600",
                      )}
                    >
                      {step.title}
                    </span>
                    {step.completed ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                        Done
                      </span>
                    ) : !step.required ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                        Optional
                      </span>
                    ) : null}
                    <ChevronRight className="h-3.5 w-3.5 text-indigo-200 shrink-0" />
                  </button>
                );
              })}
              <Link
                href="/provider/get-started"
                className="mt-2 flex items-center justify-center rounded-xl bg-indigo-50 py-2.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
              >
                {completionOverflowCount > 0
                  ? `View full checklist · +${completionOverflowCount} more`
                  : "View full checklist"}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">
        All features
      </p>

      <div className="space-y-2 mb-6">
        {MORE_MENU_SECTIONS.map((section) => {
          const items = section.items.filter(
            (item) =>
              passesFeatureFlag(item.featureFlag, featureFlags) &&
              passesMorePermissionGate(item.permission, permissionOpts),
          );
          if (items.length === 0) return null;
          const isExpanded = expandedSections[section.title] ?? false;

          return (
            <Collapsible
              key={section.title}
              open={isExpanded}
              onOpenChange={(open) =>
                setExpandedSections((prev) => ({ ...prev, [section.title]: open }))
              }
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3.5 text-left hover:bg-gray-50 transition-colors touch-manipulation">
                <span className="font-medium text-gray-900">{section.title}</span>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden rounded-b-2xl border border-t-0 border-gray-100 bg-white">
                {items.map((item, idx) => {
                  const Icon = item.icon;
                  const badge = formatBadgeCount(getRouteBadgeCount(item.href, navCounts));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex min-h-[52px] items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors touch-manipulation",
                        idx < items.length - 1 && "border-b border-gray-50",
                      )}
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: item.bg }}
                      >
                        <Icon className="h-4 w-4" style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
                      </div>
                      {badge ? (
                        <span className="mr-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-extrabold text-white">
                          {badge}
                        </span>
                      ) : null}
                      <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                    </Link>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors touch-manipulation"
      >
        Sign out
      </button>
    </div>
  );
}

function CreditCardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-violet-700" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}
