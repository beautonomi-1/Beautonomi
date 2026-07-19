"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  renewal_payment_method_missing?: boolean;
  card: { last4: string; brand: string; exp: string } | null;
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

function cardLabel(card: { last4: string; brand: string; exp: string } | null): string {
  if (!card) return "";
  const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card";
  return `${brand} •••• ${card.last4} · exp. ${card.exp}`;
}

function formatMoney(amount: number, currency = "ZAR"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function MembershipPageClient() {
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
      setError(err instanceof FetchError ? err.message : "Failed to load memberships");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelPlatformMembership = async () => {
    if (!confirm("Cancel your platform membership?")) return;
    setCancellingPlatform(true);
    try {
      const res = await fetcher.post<{ data: { cancelled?: boolean; message?: string } }>(
        "/api/me/membership/cancel",
        {}
      );
      if (res.data?.cancelled) {
        toast.success("Membership cancelled");
        await load();
      } else {
        toast.info(res.data?.message ?? "No active membership found");
        await load();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to cancel membership");
    } finally {
      setCancellingPlatform(false);
    }
  };

  const cancelSalonMembership = async (membership: ProviderMembership) => {
    if (
      !confirm(
        `Cancel your ${membership.plan_name} membership with ${membership.provider_name}?`
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
        toast.success("Salon membership cancelled");
        await load();
      } else {
        toast.info(res.data?.message ?? "No active membership found");
        await load();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to cancel membership");
    } finally {
      setCancellingSalonId(null);
    }
  };

  const toggleAutoRenew = async (membership: ProviderMembership, newValue: boolean) => {
    if (newValue && !membership.card) {
      toast.error("Add a payment card in Payments before enabling auto-renew.");
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
        toast.error(res.data?.message ?? "Failed to update auto-renew");
      } else {
        toast.success(newValue ? "Auto-renew enabled" : "Auto-renew disabled");
        await load();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to update auto-renew");
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
      toast.error("Could not load saved cards");
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
        toast.success("Payment card updated");
        setCardSheetOpen(false);
        setCardTarget(null);
        await load();
      } else {
        toast.error(res.data?.message ?? "Failed to update card");
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to update card");
    } finally {
      setUpdatingCard(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading memberships..." />
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
      <h1 className="mb-2 text-3xl font-bold">Memberships</h1>
      <p className="mb-6 text-sm text-gray-600">
        Manage salon memberships, auto-renewal, and billing.
      </p>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-600">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      ) : null}

      {hasPlatform && platformMembership ? (
        <Card className="mb-6 border-pink-100 bg-gradient-to-br from-pink-50/80 to-white">
          <CardHeader>
            <CardTitle className="text-lg">Platform membership</CardTitle>
            <p className="text-sm text-gray-600">Active membership</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xl font-bold text-gray-900">{platformMembership.name}</p>
              {platformMembership.description ? (
                <p className="mt-2 text-sm text-gray-700">{platformMembership.description}</p>
              ) : null}
              <p className="mt-2 text-sm text-gray-500">
                {platformMembership.billing_cycle === "yearly" ? "Billed yearly" : "Billed monthly"}
                {platformMembership.expires_at
                  ? ` · Renews ${formatDateSafe(platformMembership.expires_at)}`
                  : ""}
              </p>
            </div>
            {benefits.length > 0 ? (
              <div>
                <p className="mb-2 font-medium text-gray-900">Benefits</p>
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
                <p className="font-semibold">Your savings</p>
                <p>This month: {formatMoney(savings.this_month, savingsCurrency)}</p>
                <p>Lifetime: {formatMoney(savings.lifetime, savingsCurrency)}</p>
              </div>
            )}
            {platformMembership.auto_renew !== false ? (
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => void cancelPlatformMembership()}
                disabled={cancellingPlatform}
              >
                {cancellingPlatform ? "Cancelling…" : "Cancel membership"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : hasSalon ? (
        <Card className="mb-6 bg-gray-50">
          <CardContent className="py-4 text-sm text-gray-700">
            No platform membership. Your active salon memberships are listed below.
          </CardContent>
        </Card>
      ) : null}

      {hasSalon ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Salon memberships</h2>
            <p className="mt-1 text-sm text-gray-600">
              Active memberships with providers. Discounts apply automatically when you book.
            </p>
          </div>
          {providerMemberships.map((pm) => {
            const isPastDue = pm.status === "past_due";
            const needsRenewalCard = pm.renewal_payment_method_missing === true && !isPastDue;
            return (
              <Card
                key={pm.id}
                className={isPastDue || needsRenewalCard ? "border-amber-300 shadow-sm" : undefined}
              >
                <CardContent className="space-y-4 pt-6">
                  {isPastDue ? (
                    <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                      <div>
                        <p className="font-semibold">Payment action needed</p>
                        <p className="mt-1">
                          We couldn&apos;t renew your {pm.plan_name} membership. Update your card
                          within the grace period to keep your benefits.
                        </p>
                      </div>
                    </div>
                  ) : needsRenewalCard ? (
                    <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      <div>
                        <p className="font-semibold">Add a payment method</p>
                        <p className="mt-1">
                          Your {pm.plan_name} membership is active, but we couldn&apos;t save a card
                          for renewals. Add a payment method{" "}
                          {pm.next_billing_at ? `before ${formatDateSafe(pm.next_billing_at)}` : "soon"}{" "}
                          to keep it from lapsing.
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
                          {pm.discount_percent}% off services
                        </Badge>
                      ) : null}
                      {pm.auto_renew && pm.next_billing_at ? (
                        <span>Renews {formatDateSafe(pm.next_billing_at)}</span>
                      ) : pm.expires_at ? (
                        <span>Expires {formatDateSafe(pm.expires_at)}</span>
                      ) : null}
                      {pm.price_monthly > 0 ? (
                        <span>{formatMoney(pm.price_monthly, pm.currency)}/month</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <span className="text-sm font-medium text-gray-800">Auto-renew</span>
                    {togglingId === pm.id ? (
                      <span className="text-sm text-gray-500">Saving…</span>
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
                      <span>{cardLabel(pm.card)}</span>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={isPastDue ? "default" : "outline"}
                      size="sm"
                      onClick={() => void openUpdateCard(pm)}
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      {isPastDue ? "Update card" : "Change card"}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/account-settings/membership/billing-history?provider_id=${encodeURIComponent(pm.provider_id)}&provider_name=${encodeURIComponent(pm.provider_name)}&plan_id=${encodeURIComponent(pm.plan_id)}`}
                      >
                        Billing history
                      </Link>
                    </Button>
                    {pm.provider_slug ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/partner-profile?slug=${encodeURIComponent(pm.provider_slug)}`}>
                          View provider
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
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
                      {cancellingSalonId === pm.id ? "Cancelling…" : "Cancel salon membership"}
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
            <p className="text-gray-600">No memberships yet</p>
            <p className="mx-auto max-w-md text-sm text-gray-500">
              Browse provider profiles to see membership plans and subscribe.
            </p>
            <Button asChild>
              <Link href="/search">Find a salon</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Sheet open={cardSheetOpen} onOpenChange={setCardSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Update payment card</SheetTitle>
            <SheetDescription>
              Choose a saved card for {cardTarget?.provider_name ?? "this membership"}.
            </SheetDescription>
          </SheetHeader>
          <div className="my-4 space-y-2">
            {loadingCards ? (
              <p className="text-sm text-gray-500">Loading cards…</p>
            ) : paymentMethods.length === 0 ? (
              <div className="space-y-3 text-sm text-gray-600">
                <p>No saved cards. Add one in Payments, then return here.</p>
                <Button variant="outline" asChild>
                  <Link href="/account-settings/payments">Go to Payments</Link>
                </Button>
              </div>
            ) : (
              paymentMethods.map((m) => {
                const label = `${(m.card_type ?? "Card").toUpperCase()} •••• ${m.last4 ?? "****"}${m.expiry_label ? ` · ${m.expiry_label}` : ""}`;
                const disabled = m.is_expired || updatingCard;
                return (
                  <Button
                    key={m.id}
                    variant="outline"
                    className="h-auto w-full justify-start py-3"
                    disabled={disabled}
                    onClick={() => void applyCardToMembership(m.id)}
                  >
                    <CreditCard className="mr-2 h-4 w-4 shrink-0" />
                    <span className="text-left">
                      {label}
                      {m.is_default ? " (default)" : ""}
                      {m.is_expired ? " — expired" : ""}
                    </span>
                  </Button>
                );
              })
            )}
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setCardSheetOpen(false)}>
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
