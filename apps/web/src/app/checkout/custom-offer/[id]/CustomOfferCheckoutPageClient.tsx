"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { useTranslation } from "@beautonomi/i18n";
import { Loader2 } from "lucide-react";
import { getDefaultMoneyLocale } from "@beautonomi/utils";

type QuoteData = {
  pricing?: {
    subtotal: number;
    travelFee: number;
    promotionDiscountAmount: number;
    taxAmount: number;
    serviceFeeAmount: number;
    tipAmount: number;
    totalAmount: number;
  };
  deposit?: { required?: boolean; deposit_amount?: number; full_total?: number };
  feature_custom_offer_full_checkout?: boolean;
  can_pay?: boolean;
};

export default function CustomOfferCheckoutPageClient({ offerId }: { offerId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [offerStatus, setOfferStatus] = useState<string>("pending");
  const [offerCurrency, setOfferCurrency] = useState<string | undefined>(undefined);

  const money = useCallback(
    (amount: number, currency?: string) => {
      if (!currency) return amount.toFixed(2);
      try {
        return new Intl.NumberFormat(getDefaultMoneyLocale(), {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        return amount.toFixed(2);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [offerRes, quoteRes] = await Promise.all([
          fetcher.get<{ data: { status?: string; currency?: string | null } }>(`/api/me/custom-offers/${offerId}`),
          fetcher.get<{ data: QuoteData }>(`/api/me/custom-offers/${offerId}/quote`),
        ]);
        if (cancelled) return;
        setOfferStatus(String(offerRes.data?.status ?? "pending").toLowerCase());
        setOfferCurrency(offerRes.data?.currency ?? undefined);
        setQuote(quoteRes.data ?? null);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof FetchError ? e.message : t("web.checkout.customOffer.loadFailed"));
          router.replace("/account-settings/custom-requests");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offerId, router, t]);

  const pay = async (paymentOption: "full" | "deposit" = "full") => {
    setPaying(true);
    try {
      const res = await fetcher.post<{
        data: {
          paymentUrl?: string;
          payment_url?: string;
          charged?: boolean;
          booking_id?: string | null;
        };
      }>(`/api/me/custom-offers/${offerId}/accept`, {
        payment_option: paymentOption,
        callback_url: `${window.location.origin}/checkout/success?payment_type=custom_offer&offer_id=${encodeURIComponent(offerId)}`,
      });
      const url = res.data?.paymentUrl ?? res.data?.payment_url;
      if (url) {
        window.location.href = url;
        return;
      }
      if (res.data?.charged) {
        toast.success(t("web.checkout.customOffer.paymentSuccessful"));
        if (res.data.booking_id) {
          router.push(`/account-settings/bookings/${res.data.booking_id}`);
        } else {
          router.push("/account-settings/custom-requests");
        }
        return;
      }
      toast.error(t("web.checkout.customOffer.paymentStartFailed"));
    } catch (e) {
      toast.error(e instanceof FetchError ? e.message : t("web.checkout.customOffer.paymentStartFailed"));
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <LoadingTimeout isLoading />
      </div>
    );
  }

  if (offerStatus === "payment_pending") {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        <h1 className="text-xl font-semibold">{t("web.checkout.customOffer.waitingTitle")}</h1>
        <p className="text-gray-600 text-sm">{t("web.checkout.customOffer.waitingBody")}</p>
        <Button variant="outline" asChild>
          <Link href="/account-settings/custom-requests">{t("web.checkout.customOffer.backToRequests")}</Link>
        </Button>
      </div>
    );
  }

  if (offerStatus === "changes_requested") {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-4">
        <h1 className="text-xl font-semibold">{t("web.checkout.customOffer.changesRequestedTitle")}</h1>
        <p className="text-gray-600 text-sm">{t("web.checkout.customOffer.changesRequestedBody")}</p>
        <Button variant="outline" asChild>
          <Link href="/account-settings/custom-requests">{t("web.checkout.customOffer.backToRequests")}</Link>
        </Button>
      </div>
    );
  }

  const total = quote?.pricing?.totalAmount ?? 0;
  const currency = offerCurrency;
  const canPay = quote?.can_pay !== false;

  return (
    <div className="max-w-lg mx-auto py-10 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("web.checkout.customOffer.title")}</h1>
        <p className="text-sm text-gray-600 mt-1">{t("web.checkout.customOffer.subtitle")}</p>
      </div>
      {quote?.pricing ? (
        <div className="rounded-xl border bg-white p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span>{t("web.checkout.customOffer.subtotal")}</span>
            <span>{money(quote.pricing.subtotal, currency)}</span>
          </div>
          {quote.pricing.travelFee > 0 ? (
            <div className="flex justify-between">
              <span>{t("web.checkout.customOffer.travel")}</span>
              <span>{money(quote.pricing.travelFee, currency)}</span>
            </div>
          ) : null}
          {quote.pricing.taxAmount > 0 ? (
            <div className="flex justify-between">
              <span>{t("web.provider.finance.taxVat")}</span>
              <span>{money(quote.pricing.taxAmount, currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold pt-2 border-t">
            <span>{t("web.checkout.customOffer.total")}</span>
            <span>{money(total, currency)}</span>
          </div>
        </div>
      ) : null}
      <Button className="w-full" disabled={paying || !canPay} onClick={() => void pay("full")}>
        {paying ? <Loader2 className="w-4 h-4 animate-spin mr-2 inline" /> : null}
        {t("web.checkout.customOffer.payNow")}
      </Button>
      <Button variant="ghost" className="w-full" asChild>
        <Link href="/account-settings/custom-requests">{t("web.checkout.customOffer.cancel")}</Link>
      </Button>
    </div>
  );
}
