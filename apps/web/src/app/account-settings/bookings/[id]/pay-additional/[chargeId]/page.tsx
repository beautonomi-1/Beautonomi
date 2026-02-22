"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import Breadcrumb from "../../../../components/breadcrumb";
import BackButton from "../../../../components/back-button";
import AuthGuard from "@/components/auth/auth-guard";

interface AdditionalCharge {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  requested_at: string;
  paid_at?: string;
}

export default function PayAdditionalChargePage() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.id as string;
  const chargeId = params.chargeId as string;

  const [charge, setCharge] = useState<AdditionalCharge | null>(null);
  const [booking, setBooking] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCharge();
  }, [bookingId, chargeId]); // eslint-disable-line react-hooks/exhaustive-deps -- load on mount and when ids change

  const loadCharge = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load booking to get charge info
      const bookingResponse = await fetcher.get<{
        data: any;
        error: null;
      }>(`/api/me/bookings/${bookingId}`, { cache: "no-store" });

      const bookingData = bookingResponse.data;
      setBooking(bookingData);

      // Find the specific charge
      const foundCharge = bookingData.additional_charges?.find(
        (c: any) => c.id === chargeId
      );

      if (!foundCharge) {
        setError("Additional charge not found");
        return;
      }

      if (foundCharge.status === 'paid') {
        setError("This charge has already been paid");
        return;
      }

      if (foundCharge.status === 'rejected') {
        setError("This charge has been rejected");
        return;
      }

      setCharge(foundCharge);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load charge";
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
          authorization_url: string;
          access_code: string;
          reference: string;
        };
      }>(`/api/me/bookings/${bookingId}/additional-charges/${chargeId}/pay`, {
        amount: charge.amount,
        currency: charge.currency,
      });

      // Redirect to Paystack payment page
      if (response.data.authorization_url) {
        window.location.href = response.data.authorization_url;
      } else {
        throw new Error("Payment link not received");
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchError ? err.message : "Failed to initiate payment";
      toast.error(errorMessage);
      console.error("Error initiating payment:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <AuthGuard>
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading payment details..." />
        </div>
      </AuthGuard>
    );
  }

  if (error || !charge) {
    return (
      <AuthGuard>
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Charge not found"
            description={error || "The additional charge you're looking for doesn't exist or has already been paid"}
            action={{
              label: "Back to Booking",
              onClick: () => router.push(`/account-settings/bookings/${bookingId}`),
            }}
          />
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="w-full max-w-2xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
        <BackButton 
          href={`/account-settings/bookings/${bookingId}`} 
          label="Back to Booking" 
        />
        <Breadcrumb
          items={[
            { label: "Account", href: "/account-settings" },
            { label: "Bookings", href: "/account-settings/bookings" },
            { label: `Booking #${booking?.booking_number}`, href: `/account-settings/bookings/${bookingId}` },
            { label: "Pay Additional Charge" },
          ]}
        />

        <div className="mt-6">
          <h1 className="text-2xl md:text-3xl font-semibold mb-2 text-gray-900">
            Pay Additional Charge
          </h1>
          <p className="text-gray-600 mb-6">
            Complete payment for this additional charge from your booking
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
                  Requested on {new Date(charge.requested_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-4">
                <span className="text-lg font-medium text-gray-700">Amount Due</span>
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
                        Payment Pending
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        This charge is awaiting your payment. Please complete payment to proceed.
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
                        Payment Approved
                      </p>
                      <p className="text-xs text-blue-700 mt-1">
                        This charge has been approved. Please complete payment.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Button
                onClick={handlePayNow}
                disabled={isProcessing || charge.status === 'paid'}
                className="w-full bg-gradient-to-r from-[#FF0077] to-[#E6006A] hover:from-[#E6006A] hover:to-[#FF0077] text-white py-6 text-lg font-semibold"
              >
                {isProcessing ? (
                  "Processing..."
                ) : charge.status === 'paid' ? (
                  "Already Paid"
                ) : (
                  <>
                    <CreditCard className="w-5 h-5 mr-2" />
                    Pay {charge.currency} {charge.amount.toFixed(2)} Now
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-500 text-center mt-4">
                Secure payment powered by Paystack
              </p>
            </div>
          </div>

          {/* Booking Info */}
          {booking && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Booking:</span> #{booking.booking_number}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium">Provider:</span> {booking.provider?.business_name || "Provider"}
              </p>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
