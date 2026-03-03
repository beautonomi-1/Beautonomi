"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetcher } from "@/lib/http/fetcher";
import { Sparkles, ArrowRight } from "lucide-react";

interface TeaserData {
  points_balance: number;
  redemption_value: number;
  redemption_currency: string;
  redemption_rate: number;
}

export function LoyaltyTeaser() {
  const [data, setData] = useState<TeaserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: TeaserData }>("/api/me/loyalty", { cache: "no-store" });
        if (!cancelled) setData(res.data);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!data) return null;

  const hasPoints = data.points_balance > 0;
  const currencySymbol = data.redemption_currency === "ZAR" ? "R" : data.redemption_currency + " ";

  return (
    <Link
      href="/account-settings/loyalty"
      className="block mb-4 md:mb-6"
    >
      <div className="rounded-xl md:rounded-2xl p-4 md:p-5 bg-gradient-to-r from-[#FF0077]/10 via-[#FF0077]/5 to-transparent border border-[#FF0077]/20 shadow-sm hover:shadow-md hover:border-[#FF0077]/30 transition-all">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 p-2.5 rounded-lg bg-[#FF0077]/10">
              <Sparkles className="w-5 h-5 text-[#FF0077]" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {hasPoints
                  ? `You have ${data.points_balance.toLocaleString()} loyalty points`
                  : "Start earning loyalty points"}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {hasPoints
                  ? `Worth ~${currencySymbol}${Math.round(data.redemption_value)} — redeem for discounts`
                  : "Book services to earn points and unlock rewards"}
              </p>
            </div>
          </div>
          <span className="flex-shrink-0 text-[#FF0077] font-medium text-sm inline-flex items-center gap-1">
            View rewards
            <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
