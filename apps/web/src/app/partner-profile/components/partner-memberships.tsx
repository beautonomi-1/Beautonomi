"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import EmptyState from "@/components/ui/empty-state";
import LoadingTimeout from "@/components/ui/loading-timeout";
import LoginModal from "@/components/global/login-modal";
import { useAuth } from "@/providers/AuthProvider";

function safeMoney(amount: unknown): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function safeDiscountPct(amount: unknown): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n));
}

export default function PartnerMemberships({
  providerSlug,
  providerId,
}: {
  providerSlug: string;
  providerId: string;
}) {
  const [plans, setPlans] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuying, setIsBuying] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletCurrency, setWalletCurrency] = useState("ZAR");
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activeMembershipStatus, setActiveMembershipStatus] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetcher.get<{ data?: { plans?: any[] } }>(
          `/api/public/providers/${providerSlug}/membership-plans`
        );
        const inner = res && typeof res === "object" && "data" in res ? (res as { data?: { plans?: any[] } }).data : null;
        setPlans(inner?.plans ?? []);
      } catch {
        setPlans([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [providerSlug]);

  useEffect(() => {
    if (!user || authLoading || !providerId) {
      setActivePlanId(null);
      setActiveMembershipStatus(null);
      setWalletBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{
          data?: { provider_memberships?: { plan_id: string; provider_id: string; status?: string }[] };
        }>("/api/me/membership", { staleTimeMs: 0 });
        if (cancelled) return;
        const rows = res?.data?.provider_memberships ?? [];
        const mine = rows.find(
          (r) =>
            r.provider_id === providerId &&
            (r.status === "active" || r.status === "past_due" || r.status === "paused"),
        );
        setActivePlanId(mine?.plan_id ?? null);
        setActiveMembershipStatus(mine?.status ?? null);
      } catch {
        if (!cancelled) {
          setActivePlanId(null);
          setActiveMembershipStatus(null);
        }
      }
      try {
        const wallet = await fetcher.get<{ data?: { wallet?: { balance?: number; currency?: string } } }>(
          "/api/me/wallet",
          { staleTimeMs: 0 },
        );
        if (cancelled) return;
        const w = wallet.data?.wallet;
        setWalletBalance(Number(w?.balance ?? 0));
        if (w?.currency) setWalletCurrency(w.currency);
      } catch {
        if (!cancelled) setWalletBalance(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, providerId]);

  const buy = async (planId: string, tender: "paystack" | "wallet" = "paystack") => {
    if (authLoading) return;
    if (!user) {
      setIsLoginModalOpen(true);
      return;
    }

    try {
      setIsBuying(planId);
      const res = await fetcher.post<{ data: { payment_url: string; status?: string }; error: null }>(`/api/me/memberships/purchase`, {
        plan_id: planId,
        tender,
        source: "partner_profile_memberships",
        campaign_id: searchParams.get("campaign_id") || undefined,
        utm_source: searchParams.get("utm_source") || undefined,
        utm_medium: searchParams.get("utm_medium") || undefined,
        utm_campaign: searchParams.get("utm_campaign") || undefined,
        referrer_path: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
      });
      const url = res?.data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.success(tender === "wallet" ? "Membership paid from your wallet." : "Membership activated.");
      setActivePlanId(planId);
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : "Failed to start membership purchase");
    } finally {
      setIsBuying(null);
    }
  };

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">Memberships</h2>

      {isLoading ? (
        <LoadingTimeout loadingMessage="Loading memberships..." />
      ) : plans.length === 0 ? (
        <EmptyState
          title="No memberships available"
          description="This provider doesn't offer any membership plans at this time"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((p) => (
            <div key={p.id} className="border rounded-lg p-5">
              <div className="font-semibold">{p.name}</div>
              {p.description && <div className="text-sm text-gray-600 mt-1">{p.description}</div>}
              <div className="text-sm text-gray-900 mt-3">
                {p.currency ?? ""} {safeMoney(p.price_monthly ?? p.price)} / month
              </div>
              <div className="text-sm text-gray-600">
                {safeDiscountPct(p.discount_percent)}% off services
              </div>
              {/* Recurring consent disclosure */}
              {activePlanId !== p.id && (
                <p className="text-xs text-gray-400 mt-3">
                  Auto-renews monthly at {p.currency ?? ""} {safeMoney(p.price_monthly ?? p.price)}. Cancel anytime from your account.
                </p>
              )}
              {activePlanId === p.id && (
                <p className={`text-xs mt-3 font-medium ${activeMembershipStatus === "paused" ? "text-slate-600" : "text-green-600"}`}>
                  {activeMembershipStatus === "paused"
                    ? "Paused — manage in account"
                    : "✓ Active — auto-renews monthly"}
                </p>
              )}
              <Button
                className="mt-3 w-full bg-gray-900 text-white"
                onClick={() => void buy(p.id, "paystack")}
                disabled={authLoading || isBuying === p.id || activePlanId === p.id}
              >
                {authLoading
                  ? "Checking account..."
                  : isBuying === p.id
                    ? "Redirecting..."
                    : activePlanId === p.id
                      ? activeMembershipStatus === "paused"
                        ? "Paused — manage in account"
                        : "Your current plan"
                      : "Subscribe"}
              </Button>
              {activePlanId !== p.id &&
              walletBalance != null &&
              walletBalance >= Number(p.price_monthly ?? p.price ?? 0) ? (
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => void buy(p.id, "wallet")}
                  disabled={authLoading || isBuying === p.id}
                >
                  Pay with wallet ({walletCurrency} {safeMoney(walletBalance)})
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <LoginModal
        open={isLoginModalOpen}
        setOpen={setIsLoginModalOpen}
        initialMode="login"
        redirectContext="customer"
        onAuthSuccess={() => setIsLoginModalOpen(false)}
      />
    </div>
  );
}

