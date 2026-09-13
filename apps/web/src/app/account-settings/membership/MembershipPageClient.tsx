"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDefaultMoneyLocale } from "@beautonomi/utils";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AlertCircle, CreditCard, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import BackButton from "../components/back-button";
import { useTranslation, type TFunction } from "@beautonomi/i18n";

type ProviderMembership = {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_slug: string | null;
  plan_id: string;
  plan_name: string;
  plan_description: string | null;
  discount_percent: number;
  price_monthly: number;
  currency: string;
  status: string;
  expires_at: string | null;
  started_at: string;
  auto_renew: boolean;
  next_billing_at: string | null;
  last_payment_at: string | null;
  past_due_since: string | null;
  paused_until: string | null;
  scheduled_plan_id: string | null;
  scheduled_plan_name?: string | null;
  scheduled_change_at: string | null;
  renewal_payment_method_missing?: boolean;
  card: { last4: string; brand: string; exp: string } | null;
};

type SalonPlanOption = {
  id: string;
  name: string;
  price_monthly?: number;
  price?: number;
  currency?: string;
  discount_percent?: number;
};

type UsageRow = {
  id: string;
  booking_number?: string | null;
  scheduled_at?: string | null;
  status?: string | null;
  membership_discount_amount: number;
  currency: string;
};

type PlatformMembership = {
  id: string;
  name: string;
  description?: string;
  billing_cycle: string;
  expires_at: string | null;
  auto_renew: boolean;
};

type MembershipBenefit = { name: string; description?: string };

type MembershipData = {
  has_membership: boolean;
  membership: PlatformMembership | null;
  benefits: MembershipBenefit[];
  savings: { this_month: number; lifetime: number };
  savings_currency?: string;
  provider_memberships: ProviderMembership[];
};

type PaymentMethod = {
  id: string;
  card_type?: string;
  last4?: string;
  expiry_label?: string;
  is_default?: boolean;
  is_expired?: boolean;
};

function formatDateSafe(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function cardLabel(
  card: { last4: string; brand: string; exp: string } | null,
  t: TFunction,
): string {
  if (!card) return "";
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : t("web.accountSettings.membership.cardFallback");
  return t("web.accountSettings.membership.cardLine", { brand, last4: card.last4, exp: card.exp });
}

function formatMoney(amount: number, currency = "ZAR"): string {
  return new Intl.NumberFormat(getDefaultMoneyLocale(), {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function MembershipPageClient() {
  const { t } = useTranslation();
  const [data, setData] = useState<MembershipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingPlatform, setCancellingPlatform] = useState(false);
  const [cancellingSalonId, setCancellingSalonId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [cardSheetOpen, setCardSheetOpen] = useState(false);
  const [cardTarget, setCardTarget] = useState<ProviderMembership | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [planSheetOpen, setPlanSheetOpen] = useState(false);
  const [planTarget, setPlanTarget] = useState<ProviderMembership | null>(null);
  const [salonPlans, setSalonPlans] = useState<SalonPlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [schedulingPlan, setSchedulingPlan] = useState(false);
  const [usageSheetOpen, setUsageSheetOpen] = useState(false);
  const [usageTarget, setUsageTarget] = useState<ProviderMembership | null>(null);
  const [usageRows, setUsageRows] = useState<UsageRow[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher.get<{ data: MembershipData }>("/api/me/membership", {
        cache: "no-store",
        staleTimeMs: 0,
      });
      setData(res.data ?? null);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : t("web.accountSettings.membership.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelPlatformMembership = async () => {
    if (!confirm(t("web.accountSettings.membership.cancelPlatformConfirm"))) return;
    setCancellingPlatform(true);
    try {
      const res = await fetcher.post<{ data: { cancelled?: boolean; message?: string } }>(
        "/api/me/membership/cancel",
        {}
      );
      if (res.data?.cancelled) {
        toast.success(t("web.accountSettings.membership.cancelled"));
        await load();
      } else {
        toast.info(res.data?.message ?? t("web.accountSettings.membership.noActiveMembership"));
        await load();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.membership.cancelFailed"));
    } finally {
      setCancellingPlatform(false);
    }
  };

  const cancelSalonMembership = async (membership: ProviderMembership) => {
    if (
      !confirm(
        t("web.accountSettings.membership.cancelSalonConfirm", { planName: membership.plan_name, providerName: membership.provider_name })
      )
    ) {
      return;
    }
    setCancellingSalonId(membership.id);
    try {
      const res = await fetcher.post<{ data: { cancelled?: boolean; message?: string } }>(
        "/api/me/membership/cancel",
        { provider_membership_id: membership.id }
      );
      if (res.data?.cancelled) {
        toast.success(t("web.accountSettings.membership.salonCancelled"));
        await load();
      } else {
        toast.info(res.data?.message ?? t("web.accountSettings.membership.noActiveMembership"));
        await load();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.membership.cancelFailed"));
    } finally {
      setCancellingSalonId(null);
    }
  };

  const toggleAutoRenew = async (membership: ProviderMembership, newValue: boolean) => {
    if (newValue && !membership.card) {
      toast.error(t("web.accountSettings.membership.addCardBeforeAutoRenew"));
      return;
    }
    setTogglingId(membership.id);
    try {
      const res = await fetcher.post<{
        data: { success?: boolean; auto_renew?: boolean; message?: string; code?: string };
      }>("/api/me/membership/auto-renew", {
        membership_id: membership.id,
        auto_renew: newValue,
      });
      if (!res.data?.success) {
        toast.error(res.data?.message ?? t("web.accountSettings.membership.autoRenewUpdateFailed"));
      } else {
        toast.success(newValue ? t("web.accountSettings.membership.autoRenewEnabled") : t("web.accountSettings.membership.autoRenewDisabled"));
        await load();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.membership.autoRenewUpdateFailed"));
    } finally {
      setTogglingId(null);
    }
  };

  const openUpdateCard = async (membership: ProviderMembership) => {
    setCardTarget(membership);
    setCardSheetOpen(true);
    setLoadingCards(true);
    try {
      const res = await fetcher.get<{ data: PaymentMethod[] }>("/api/me/payment-methods", {
        cache: "no-store",
      });
      setPaymentMethods(res.data ?? []);
    } catch {
      toast.error(t("web.accountSettings.membership.loadCardsFailed"));
      setPaymentMethods([]);
    } finally {
      setLoadingCards(false);
    }
  };

  const applyCardToMembership = async (paymentMethodId: string) => {
    if (!cardTarget) return;
    setUpdatingCard(true);
    try {
      const res = await fetcher.post<{ data: { success?: boolean; message?: string } }>(
        "/api/me/membership/payment-method",
        { membership_id: cardTarget.id, payment_method_id: paymentMethodId }
      );
      if (res.data?.success) {
        toast.success(t("web.accountSettings.membership.cardUpdated"));
        setCardSheetOpen(false);
        setCardTarget(null);
        await load();
      } else {
        toast.error(res.data?.message ?? t("web.accountSettings.membership.updateCardFailed"));
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.membership.updateCardFailed"));
    } finally {
      setUpdatingCard(false);
    }
  };

  const pauseOrResume = async (membership: ProviderMembership) => {
    const paused = membership.status === "paused";
    if (
      !paused &&
      !confirm(t("web.accountSettings.membership.pauseConfirm", { planName: membership.plan_name, providerName: membership.provider_name }))
    ) {
      return;
    }
    setPausingId(membership.id);
    try {
      if (paused) {
        const res = await fetcher.post<{ data: { resumed?: boolean; status?: string; message?: string } }>(
          "/api/me/membership/resume",
          { provider_membership_id: membership.id },
        );
        toast.success(res.data?.resumed ? t("web.accountSettings.membership.resumed") : res.data?.message ?? t("web.accountSettings.membership.updated"));
      } else {
        const res = await fetcher.post<{ data: { paused?: boolean; message?: string } }>(
          "/api/me/membership/pause",
          { provider_membership_id: membership.id },
        );
        toast.success(res.data?.paused ? t("web.accountSettings.membership.paused") : res.data?.message ?? t("web.accountSettings.membership.updated"));
      }
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.membership.updateFailed"));
    } finally {
      setPausingId(null);
    }
  };

  const openChangePlan = async (membership: ProviderMembership) => {
    if (membership.auto_renew !== true) {
      toast.error(t("web.accountSettings.membership.changePlanAutoRenewFirst"));
      return;
    }
    if (!membership.provider_slug) {
      toast.error(t("web.accountSettings.membership.changePlanNoPublicProfile"));
      return;
    }
    setPlanTarget(membership);
    setPlanSheetOpen(true);
    setLoadingPlans(true);
    try {
      const res = await fetcher.get<{ data?: { plans?: SalonPlanOption[] } }>(
        `/api/public/providers/${membership.provider_slug}/membership-plans`,
      );
      setSalonPlans(res.data?.plans ?? []);
    } catch {
      toast.error(t("web.accountSettings.membership.loadPlansFailed"));
      setSalonPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  };

  const schedulePlanChange = async (planId: string) => {
    if (!planTarget) return;
    setSchedulingPlan(true);
    try {
      const res = await fetcher.post<{
        data: {
          scheduled?: boolean;
          cleared?: boolean;
          scheduled_plan_name?: string | null;
          scheduled_change_at?: string | null;
        };
      }>("/api/me/membership/change-plan", {
        provider_membership_id: planTarget.id,
        plan_id: planId,
      });
      if (res.data?.cleared) {
        toast.success(t("web.accountSettings.membership.scheduledChangeCleared"));
      } else if (res.data?.scheduled) {
        toast.success(
          res.data.scheduled_change_at
            ? t("web.accountSettings.membership.planChangeScheduledFor", { date: formatDateSafe(res.data.scheduled_change_at) })
            : t("web.accountSettings.membership.planChangeScheduled"),
        );
      } else {
        toast.success(t("web.accountSettings.membership.updated"));
      }
      setPlanSheetOpen(false);
      setPlanTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.membership.schedulePlanFailed"));
    } finally {
      setSchedulingPlan(false);
    }
  };

  const openUsage = async (membership: ProviderMembership) => {
    setUsageTarget(membership);
    setUsageSheetOpen(true);
    setLoadingUsage(true);
    try {
      const res = await fetcher.get<{
        data: { bookings?: UsageRow[]; discount_total?: number };
      }>(`/api/me/membership/usage?provider_membership_id=${encodeURIComponent(membership.id)}`, {
        cache: "no-store",
      });
      setUsageRows(res.data?.bookings ?? []);
      setUsageTotal(Number(res.data?.discount_total ?? 0));
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.accountSettings.membership.loadUsageFailed"));
      setUsageRows([]);
      setUsageTotal(0);
    } finally {
      setLoadingUsage(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage={t("web.accountSettings.membership.loading")} />
      </div>
    );
  }

  const hasPlatform = Boolean(data?.has_membership && data?.membership);
  const platformMembership = data?.membership;
  const benefits = data?.benefits ?? [];
  const savings = data?.savings ?? { this_month: 0, lifetime: 0 };
  const providerMemberships = data?.provider_memberships ?? [];
  const savingsCurrency = data?.savings_currency ?? providerMemberships[0]?.currency ?? "ZAR";
  const hasSalon = providerMemberships.length > 0;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <BackButton href="/account-settings" />
      <h1 className="mb-2 text-3xl font-bold">{t("web.accountSettings.membership.title")}</h1>
      <p className="mb-6 text-sm text-gray-600">
        {t("web.accountSettings.membership.subtitle")}
      </p>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
            {t("web.accountSettings.membership.retry")}
          </Button>
        </div>
      ) : null}

      {hasPlatform && platformMembership ? (
        <Card className="mb-6 border-pink-100 bg-gradient-to-br from-pink-50/80 to-white">
          <CardHeader>
            <CardTitle className="text-lg">{t("web.accountSettings.membership.platformTitle")}</CardTitle>
            <p className="text-sm text-gray-600">{t("web.accountSettings.membership.activeMembership")}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xl font-bold text-gray-900">{platformMembership.name}</p>
              {platformMembership.description ? (
                <p className="mt-2 text-sm text-gray-700">{platformMembership.description}</p>
              ) : null}
              <p className="mt-2 text-sm text-gray-500">
                {platformMembership.billing_cycle === "yearly"
                  ? t("web.accountSettings.membership.billedYearly")
                  : t("web.accountSettings.membership.billedMonthly")}
                {platformMembership.expires_at
                  ? t("web.accountSettings.membership.renews", { date: formatDateSafe(platformMembership.expires_at) })
                  : ""}
              </p>
            </div>
            {benefits.length > 0 ? (
              <div>
                <p className="mb-2 font-medium text-gray-900">{t("web.accountSettings.membership.benefits")}</p>
                <ul className="space-y-2">
                  {benefits.map((b, i) => (
                    <li key={i} className="rounded-lg bg-white/80 px-3 py-2 text-sm">
                      <span className="font-medium">{b.name}</span>
                      {b.description ? (
                        <span className="mt-0.5 block text-gray-600">{b.description}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(savings.this_month > 0 || savings.lifetime > 0) && (
              <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">{t("web.accountSettings.membership.yourSavings")}</p>
                <p>{t("web.accountSettings.membership.thisMonth", { amount: formatMoney(savings.this_month, savingsCurrency) })}</p>
                <p>{t("web.accountSettings.membership.lifetime", { amount: formatMoney(savings.lifetime, savingsCurrency) })}</p>
              </div>
            )}
            {platformMembership.auto_renew !== false ? (
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => void cancelPlatformMembership()}
                disabled={cancellingPlatform}
              >
{cancellingPlatform ? t("web.accountSettings.membership.cancelling") : t("web.accountSettings.membership.cancelMembership")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : hasSalon ? (
        <Card className="mb-6 bg-gray-50">
          <CardContent className="py-4 text-sm text-gray-700">
            {t("web.accountSettings.membership.noPlatformMembership")}
          </CardContent>
        </Card>
      ) : null}

      {hasSalon ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t("web.accountSettings.membership.salonTitle")}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {t("web.accountSettings.membership.salonSubtitle")}
            </p>
          </div>
          {providerMemberships.map((pm) => {
            const isPastDue = pm.status === "past_due";
            const isPaused = pm.status === "paused";
            const needsRenewalCard = pm.renewal_payment_method_missing === true && !isPastDue && !isPaused;
            return (
              <Card
                key={pm.id}
                className={isPastDue || needsRenewalCard ? "border-amber-300 shadow-sm" : undefined}
              >
                <CardContent className="space-y-4 pt-6">
                  {isPaused ? (
                    <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
                      <div>
                        <p className="font-semibold">{t("web.accountSettings.membership.pausedTitle")}</p>
                        <p className="mt-1">
                          {t("web.accountSettings.membership.pausedBodyBefore")}
                          {pm.paused_until ? t("web.accountSettings.membership.pausedUntil", { date: formatDateSafe(pm.paused_until) }) : ""}
                          {t("web.accountSettings.membership.pausedBodyAfter")}
                        </p>
                      </div>
                    </div>
                  ) : isPastDue ? (
                    <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                      <div>
                        <p className="font-semibold">{t("web.accountSettings.membership.paymentActionNeeded")}</p>
                        <p className="mt-1">
                          {t("web.accountSettings.membership.pastDueBody", { planName: pm.plan_name })}
                        </p>
                      </div>
                    </div>
                  ) : needsRenewalCard ? (
                    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      <div>
                        <p className="font-semibold">{t("web.accountSettings.membership.addPaymentMethod")}</p>
                        <p className="mt-1">
                          {t("web.accountSettings.membership.renewalCardBodyBefore", { planName: pm.plan_name })}{" "}
                          {pm.next_billing_at
                            ? t("web.accountSettings.membership.beforeDate", { date: formatDateSafe(pm.next_billing_at) })
                            : t("web.accountSettings.membership.soon")}{" "}
                          {t("web.accountSettings.membership.renewalCardBodyAfter")}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-lg font-semibold text-gray-900">{pm.provider_name}</p>
                    <p className="font-medium text-gray-800">{pm.plan_name}</p>
                    {pm.plan_description ? (
                      <p className="mt-1 text-sm text-gray-600 line-clamp-2">{pm.plan_description}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                      {pm.discount_percent > 0 ? (
                        <Badge variant="secondary" className="bg-pink-100 text-pink-800">
                          {t("web.accountSettings.membership.discountOffServices", { percent: pm.discount_percent })}
                        </Badge>
                      ) : null}
                      {pm.scheduled_plan_id ? (
                        <span>
                          {t("web.accountSettings.membership.changesTo", { planName: pm.scheduled_plan_name ?? t("web.accountSettings.membership.selectedPlan") })}{" "}
                          {pm.scheduled_change_at ? formatDateSafe(pm.scheduled_change_at) : t("web.accountSettings.membership.atPeriodEnd")}
                        </span>
                      ) : null}
                      {pm.auto_renew && pm.next_billing_at ? (
<span>{t("web.accountSettings.membership.renewsDate", { date: formatDateSafe(pm.next_billing_at) })}</span>
                      ) : pm.expires_at ? (
<span>{t("web.accountSettings.membership.expiresDate", { date: formatDateSafe(pm.expires_at) })}</span>
                      ) : null}
                      {pm.price_monthly > 0 ? (
<span>{t("web.accountSettings.membership.perMonth", { amount: formatMoney(pm.price_monthly, pm.currency) })}</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <span className="text-sm font-medium text-gray-800">{t("web.accountSettings.membership.autoRenew")}</span>
                    {togglingId === pm.id ? (
                      <span className="text-sm text-gray-500">{t("web.accountSettings.membership.saving")}</span>
                    ) : (
                      <Switch
                        checked={pm.auto_renew}
                        onCheckedChange={(v) => void toggleAutoRenew(pm, v)}
                      />
                    )}
                  </div>

                  {pm.card ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <CreditCard className="h-4 w-4" />
                      <span>{cardLabel(pm.card, t)}</span>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={isPastDue ? "default" : "outline"}
                      size="sm"
                      onClick={() => void openUpdateCard(pm)}
                    >
                      <CreditCard className="me-2 h-4 w-4" />
{isPastDue ? t("web.accountSettings.membership.updateCard") : t("web.accountSettings.membership.changeCard")}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/account-settings/membership/billing-history?provider_id=${encodeURIComponent(pm.provider_id)}&provider_name=${encodeURIComponent(pm.provider_name)}&plan_id=${encodeURIComponent(pm.plan_id)}`}
                      >
                        {t("web.accountSettings.membership.billingHistory")}
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void openUsage(pm)}>
                      {t("web.accountSettings.membership.usage")}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void openChangePlan(pm)}>
                      {t("web.accountSettings.membership.changePlan")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void pauseOrResume(pm)}
                      disabled={pausingId === pm.id}
                    >
                      {pausingId === pm.id
                        ? t("web.accountSettings.membership.saving")
                        : isPaused
                          ? t("web.accountSettings.membership.resume")
                          : t("web.accountSettings.membership.pause")}
                    </Button>
                    {pm.provider_slug ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/partner-profile?slug=${encodeURIComponent(pm.provider_slug)}`}>
                          {t("web.accountSettings.membership.viewProvider")}
                          <ExternalLink className="ms-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>

                  {pm.status !== "cancelled" ? (
                    <Button
                      variant="outline"
                      className="w-full border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => void cancelSalonMembership(pm)}
                      disabled={cancellingSalonId === pm.id}
                    >
{cancellingSalonId === pm.id ? t("web.accountSettings.membership.cancelling") : t("web.accountSettings.membership.cancelSalonMembership")}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}

      {!hasPlatform && !hasSalon ? (
        <Card>
          <CardContent className="space-y-4 py-8 text-center">
            <p className="text-gray-600">{t("web.accountSettings.membership.noMembershipsYet")}</p>
            <p className="mx-auto max-w-md text-sm text-gray-500">
              {t("web.accountSettings.membership.noMembershipsBody")}
            </p>
            <Button asChild>
              <Link href="/search">{t("web.accountSettings.membership.findSalon")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Sheet open={cardSheetOpen} onOpenChange={setCardSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("web.accountSettings.membership.updatePaymentCard")}</SheetTitle>
            <SheetDescription>
              {t("web.accountSettings.membership.chooseSavedCard", { name: cardTarget?.provider_name ?? t("web.accountSettings.membership.thisMembership") })}
            </SheetDescription>
          </SheetHeader>
          <div className="my-4 space-y-2">
            {loadingCards ? (
              <p className="text-sm text-gray-500">{t("web.accountSettings.membership.loadingCards")}</p>
            ) : paymentMethods.length === 0 ? (
              <div className="space-y-3 text-sm text-gray-600">
                <p>{t("web.accountSettings.membership.noSavedCards")}</p>
                <Button variant="outline" asChild>
                  <Link href="/account-settings/payments">{t("web.accountSettings.membership.goToPayments")}</Link>
                </Button>
              </div>
            ) : (
              paymentMethods.map((m) => {
                const label = `${(m.card_type ?? t("web.accountSettings.membership.cardFallback")).toUpperCase()} •••• ${m.last4 ?? "****"}${m.expiry_label ? ` · ${m.expiry_label}` : ""}`;
                const disabled = m.is_expired || updatingCard;
                return (
                  <Button
                    key={m.id}
                    variant="outline"
                    className="h-auto w-full justify-start py-3"
                    disabled={disabled}
                    onClick={() => void applyCardToMembership(m.id)}
                  >
                    <CreditCard className="me-2 h-4 w-4 shrink-0" />
                    <span className="text-start">
                      {label}
                      {m.is_default ? t("web.accountSettings.membership.defaultSuffix") : ""}
                      {m.is_expired ? t("web.accountSettings.membership.expiredSuffix") : ""}
                    </span>
                  </Button>
                );
              })
            )}
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setCardSheetOpen(false)}>
              {t("web.accountSettings.membership.close")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={planSheetOpen} onOpenChange={setPlanSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("web.accountSettings.membership.changePlan")}</SheetTitle>
            <SheetDescription>
              {t("web.accountSettings.membership.changePlanDesc")}
            </SheetDescription>
          </SheetHeader>
          <div className="my-4 space-y-2">
            {loadingPlans ? (
              <p className="text-sm text-gray-500">{t("web.accountSettings.membership.loadingPlans")}</p>
            ) : salonPlans.length === 0 ? (
              <p className="text-sm text-gray-600">{t("web.accountSettings.membership.noOtherPlans")}</p>
            ) : (
              salonPlans.map((plan) => {
                const current = plan.id === planTarget?.plan_id;
                const pending = plan.id === planTarget?.scheduled_plan_id;
                return (
                  <Button
                    key={plan.id}
                    variant={current ? "default" : "outline"}
                    className="h-auto w-full justify-start py-3"
                    disabled={schedulingPlan}
                    onClick={() => void schedulePlanChange(plan.id)}
                  >
                    <span className="text-start">
                      <span className="block font-medium">{plan.name}</span>
                      <span className="block text-xs text-gray-500">
                        {t("web.accountSettings.membership.planPriceMonth", { amount: formatMoney(Number(plan.price_monthly ?? plan.price ?? 0), plan.currency ?? planTarget?.currency ?? "ZAR") })}
                        {current ? t("web.accountSettings.membership.currentSuffix") : ""}
                        {pending ? t("web.accountSettings.membership.scheduledSuffix") : ""}
                      </span>
                    </span>
                  </Button>
                );
              })
            )}
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setPlanSheetOpen(false)}>
              {t("web.accountSettings.membership.close")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={usageSheetOpen} onOpenChange={setUsageSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("web.accountSettings.membership.usageTitle")}</SheetTitle>
            <SheetDescription>
              {t("web.accountSettings.membership.usageDesc", { planName: usageTarget?.plan_name ?? t("web.accountSettings.membership.membershipFallback") })}
            </SheetDescription>
          </SheetHeader>
          <div className="my-4 space-y-2">
            {loadingUsage ? (
              <p className="text-sm text-gray-500">{t("web.accountSettings.membership.loadingUsage")}</p>
            ) : usageRows.length === 0 ? (
              <p className="text-sm text-gray-600">{t("web.accountSettings.membership.noDiscountedBookings")}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-800">
                  {t("web.accountSettings.membership.totalSaved", { amount: formatMoney(usageTotal, usageTarget?.currency ?? "ZAR") })}
                </p>
                {usageRows.map((row) => (
                  <div key={row.id} className="rounded-lg border border-gray-100 px-3 py-2 text-sm">
                    <p className="font-medium text-gray-900">
                      {row.booking_number ?? row.id.slice(0, 8)}
                    </p>
                    <p className="text-gray-600">
                      {formatDateSafe(row.scheduled_at)} · {formatMoney(row.membership_discount_amount, row.currency)}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setUsageSheetOpen(false)}>
              {t("web.accountSettings.membership.close")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
