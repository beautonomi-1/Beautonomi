"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import { cn } from "@/lib/utils";

interface MembershipPreviewPillProps {
  customerId?: string;
  subtotal: number;
  className?: string;
}

export function MembershipPreviewPill({ customerId, subtotal, className }: MembershipPreviewPillProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const [discount, setDiscount] = useState(0);
  const [planName, setPlanName] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId || subtotal <= 0) {
      setDiscount(0);
      setPlanName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          customer_id: customerId,
          subtotal: String(subtotal),
        });
        const res = await fetcher.get<{
          data?: { membershipDiscountAmount?: number; membershipPlanName?: string };
        }>(`/api/provider/bookings/pricing-preview?${params}`);
        if (cancelled) return;
        setDiscount(Number(res?.data?.membershipDiscountAmount ?? 0));
        setPlanName(res?.data?.membershipPlanName ?? null);
      } catch {
        if (!cancelled) {
          setDiscount(0);
          setPlanName(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, subtotal]);

  if (!customerId || discount <= 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900",
        className,
      )}
    >
      <Sparkles className="h-4 w-4 shrink-0 text-violet-600" />
      <span>
        {planName ? `${planName}: ` : ""}
        {formatMoney(discount)} membership discount applied
      </span>
    </div>
  );
}
