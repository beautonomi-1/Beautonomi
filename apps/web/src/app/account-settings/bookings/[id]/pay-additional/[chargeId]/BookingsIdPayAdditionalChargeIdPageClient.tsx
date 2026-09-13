"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import Breadcrumb from "../../../../components/breadcrumb";
import BackButton from "../../../../components/back-button";

interface AdditionalCharge {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  requested_at: string;
  paid_at?: string;
}

interface BookingWithCharges {
  booking_number?: string;
  provider?: { business_name?: string };
  additional_charges?: AdditionalCharge[];
}

export default function PayAdditionalChargePage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;
  const chargeId = params.chargeId as string;

  const [charge, setCharge] = useState<AdditionalCharge | null>(null);
  const [booking, setBooking] = useState<BookingWithCharges | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [giftCardCode, setGiftCardCode] = useState("");
  const [walletBalance, setWalletBalance] = useState(0);

  useEffect(() => {
    loadCharge();
  }, [bookingId, chargeId]); // eslint-disable-line react-hooks/exhaustive-deps -- load on mount and when ids change

  useEffect(() => {
    void fetcher
      .get<{ data?: { wallet?: { balance?: number } } }>("/api/me/wallet", { cache: "no-store" })
      .then((res) => {
        const w = res.data?.wallet;
        if (w?.balance != null) setWalletBalance(Number(w.balance) || 0);
      })
      .catch(() => {});
  }, []);

  const loadCharge = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load booking to get charge info
      const bookingResponse = await fetcher.get<{
        data: BookingWithCharges;
        error: null;
      }>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });

      const bookingData = bookingResponse.data;
      setBooking(bookingData);

      // Find the specific charge
      const foundCharge = bookingData.additional_charges?.find(
        (c: AdditionalCharge) => c.id === chargeId
      );

      if (!foundCharge) {
        setError(t("web.accountSettings.payAdditionalCharge.notFound"));
        return;
      }

      if (foundCharge.status === 'paid') {
        setError(t("web.accountSettings.payAdditionalCharge.alreadyPaid"));
        return;
      }

      if (foundCharge.status === 'rejected') {
        setError(t("web.accountSettings.payAdditionalCharge.rejected"));
        return;
      }

      setCharge(foundCharge);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? t("web.accountSettings.payAdditionalCharge.timeout")
          : err instanceof FetchError
          ? err.message
          : t("web.accountSettings.payAdditionalCharge.loadFailed");
      setError(errorMessage);
      console.error("Error loading charge:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePayNow = async () => {
    if (!charge) return;

    try {
      setIsProcessing(true);

      // Initialize Paystack payment
      const response = await fetcher.post<{
        data: {
          authorization_url?: string;
          fully_settled?: boolean;
          paystack_amount?: number;
          wallet_amount_applied?: number;
          gift_card_amount_applied?: number;
        };
      }>(`/api/me/bookings/${bookingId}/additional-charges/${chargeId}/pay`, {
        use_wallet: useWallet,
        ...(giftCardCode.trim() ? { gift_card_code: giftCardCode.trim().toUpperCase() } : {}),
      }, { timeoutMs: 120_000 });

      const payload = response.data;
      if (payload?.fully_settled) {
        toast.success(t("web.accountSettings.payAdditionalCharge.paidSuccess"));
        router.push(`/account-settings/bookings/${bookingId}`);
        return;
      }

      if (payload?.authorization_url) {
        window.location.href = payload.authorization_url;
      } else {
        throw new Error(t("web.accountSettings.payAdditionalCharge.noPaymentLink"));
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchError ? err.message : t("web.accountSettings.payAdditionalCharge.initiateFailed");
      toast.error(errorMessage);
      console.error("Error initiating payment:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage={t("web.accountSettings.payAdditionalCharge.loading")} />
        </div>
    );
  }

  if (error || !charge) {
    return (
      <div className="container mx-auto px-4 py-8">
          <EmptyState
            title={t("web.accountSettings.payAdditionalCharge.notFoundTitle")}
            description={error || t("web.accountSettings.payAdditionalCharge.notFoundDescription")}
            action={{
              label: t("web.accountSettings.payAdditionalCharge.backToBooking"),
              onClick: () => router.push(`/account-settings/bookings/${bookingId}`),
            }}
          />
        </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <BackButton 
          href={`/account-settings/bookings/${bookingId}`} 
          label={t("web.accountSettings.payAdditionalCharge.backToBooking")} 
        />
        <Breadcrumb
          items={[
            { label: t("web.accountSettings.payAdditionalCharge.breadcrumbAccount"), href: "/account-settings" },
            { label: t("web.accountSettings.payAdditionalCharge.breadcrumbBookings"), href: "/account-settings/bookings" },
            { label: t("web.accountSettings.payAdditionalCharge.breadcrumbBooking", { number: booking?.booking_number }), href: `/account-settings/bookings/${bookingId}` },
            { label: t("web.accountSettings.payAdditionalCharge.breadcrumbPay") },
          ]}
        />

        <div className="mt-6">
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-gray-900">
            {t("web.accountSettings.payAdditionalCharge.title")}
          </h1>
          <p className="text-gray-600 mb-6">
            {t("web.accountSettings.payAdditionalCharge.subtitle")}
          </p>

          {/* Charge Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-yellow-100 rounded-full">
                <CreditCard className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  {charge.description}
                </h2>
                <p className="text-sm text-gray-600">
                  {t("web.accountSettings.payAdditionalCharge.requestedOn", { date: new Date(charge.requested_at).toLocaleDateString() })}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-lg font-medium text-gray-700">{t("web.accountSettings.payAdditionalCharge.amountDue")}</span>
                <span className="text-3xl font-bold text-gray-900">
                  {charge.currency} {charge.amount.toFixed(2)}
                </span>
              </div>

              {charge.status === 'pending' && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-900">
                        {t("web.accountSettings.payAdditionalCharge.paymentPending")}
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        {t("web.accountSettings.payAdditionalCharge.paymentPendingHint")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {charge.status === 'approved' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-blue-900">
                        {t("web.accountSettings.payAdditionalCharge.paymentApproved")}
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        {t("web.accountSettings.payAdditionalCharge.paymentApprovedHint")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {walletBalance > 0 && (
                <label className="flex items-center gap-2 mb-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useWallet}
                    onChange={(e) => setUseWallet(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">
                    {t("web.accountSettings.payAdditionalCharge.useWallet", { currency: charge.currency, amount: walletBalance.toFixed(2) })}
                  </span>
                </label>
              )}
              <label className="block text-sm text-gray-600 mb-1">{t("web.accountSettings.payAdditionalCharge.giftCardLabel")}</label>
              <input
                type="text"
                value={giftCardCode}
                onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
                placeholder={t("web.accountSettings.payAdditionalCharge.giftCardPlaceholder")}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
              />

              <Button
                onClick={handlePayNow}
                disabled={isProcessing || charge.status === 'paid'}
                variant="secondary"
                size="rounded"
                className="w-full text-lg font-semibold h-14 mt-4"
              >
                {isProcessing ? (
                  t("web.accountSettings.payAdditionalCharge.processing")
                ) : charge.status === 'paid' ? (
                  t("web.accountSettings.payAdditionalCharge.alreadyPaidCta")
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 me-2" />
                    {t("web.accountSettings.payAdditionalCharge.payNow", { currency: charge.currency, amount: charge.amount.toFixed(2) })}
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-500 text-center mt-4">
                {t("web.accountSettings.payAdditionalCharge.secureHint")}
              </p>
            </div>
          </div>

          {/* Booking Info */}
          {booking && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">{t("web.accountSettings.payAdditionalCharge.bookingLabel")}</span> #{booking.booking_number}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium">{t("web.accountSettings.payAdditionalCharge.providerLabel")}</span> {booking.provider?.business_name || t("web.accountSettings.payAdditionalCharge.providerFallback")}
              </p>
            </div>
          )}
        </div>
      </div>
  );
}
