"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import EmptyState from "@/components/ui/empty-state";
import LoadingTimeout from "@/components/ui/loading-timeout";

export default function PartnerMemberships({ providerSlug }: { providerSlug: string }) {
  const [plans, setPlans] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuying, setIsBuying] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetcher.get<{ data: { plans: any[] } }>(
          `/api/public/providers/${providerSlug}/membership-plans`
        );
        setPlans(res.data.plans || []);
      } catch {
        setPlans([]);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [providerSlug]);

  const buy = async (planId: string) => {
    try {
      setIsBuying(planId);
      const res = await fetcher.post<{ data: { payment_url: string }; error: null }>(`/api/me/memberships/purchase`, {
        plan_id: planId,
      });
      const url = res?.data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      toast.success("Membership purchase started.");
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
                {p.currency} {Number(p.price_monthly).toFixed(2)} / month
              </div>
              <div className="text-sm text-gray-600">
                {Number(p.discount_percent || 0)}% off services
              </div>
              <Button
                className="mt-4 w-full bg-gray-900 text-white"
                onClick={() => buy(p.id)}
                disabled={isBuying === p.id}
              >
                {isBuying === p.id ? "Redirecting..." : "Buy membership"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

