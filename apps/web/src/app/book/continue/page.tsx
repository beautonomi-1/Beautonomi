"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, Banknote, Loader2 } from "lucide-react";

interface HoldData {
  hold_id: string;
  provider_id: string;
  staff_id: string | null;
  booking_services_snapshot: Array<{
    offering_id: string;
    staff_id: string | null;
    duration_minutes: number;
    price: number;
    currency: string;
    scheduled_start_at: string;
    scheduled_end_at: string;
  }>;
  start_at: string;
  end_at: string;
  location_type: string;
  location_id: string | null;
  address_snapshot: Record<string, unknown> | null;
  hold_status: string;
  expires_at: string;
}

function BookContinueContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const holdId = searchParams?.get("hold_id");
  const [status, setStatus] = useState<"loading" | "review" | "consuming" | "redirecting" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hold, setHold] = useState<HoldData | null>(null);
  const [allowPayInPerson, setAllowPayInPerson] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [paymentOption, setPaymentOption] = useState<"deposit" | "full">("deposit");

  useEffect(() => {
    if (!holdId) {
      setErrorMessage("Missing hold ID. Please start your booking again.");
      setStatus("error");
      return;
    }

    const loadHold = async () => {
      try {
        const res = await fetcher.get<HoldData>(`/api/public/booking-holds/${holdId}`);
        const data = (res as any)?.data ?? res;
        if (!data?.hold_id && !data?.booking_services_snapshot) {
          throw new Error("Invalid hold data");
        }
        const holdData: HoldData = {
          hold_id: data.hold_id ?? data.id ?? holdId,
          provider_id: data.provider_id,
          staff_id: data.staff_id,
          booking_services_snapshot: data.booking_services_snapshot ?? [],
          start_at: data.start_at,
          end_at: data.end_at,
          location_type: data.location_type ?? "at_salon",
          location_id: data.location_id,
          address_snapshot: data.address_snapshot,
          hold_status: data.hold_status,
          expires_at: data.expires_at,
        };
        setHold(holdData);

        // Fetch provider online booking settings for allow_pay_in_person
        try {
          const settingsRes = await fetcher
            .get<{ data: { allow_pay_in_person?: boolean } }>(
              `/api/public/provider-online-booking-settings?provider_id=${holdData.provider_id}`
            )
            .catch(() => ({ data: { allow_pay_in_person: false } }));
          setAllowPayInPerson((settingsRes as any)?.data?.allow_pay_in_person ?? false);
        } catch {
          setAllowPayInPerson(false);
        }

        setStatus("review");
      } catch (err) {
        const msg =
          err instanceof FetchError
            ? err.message
            : "This hold may have expired. Please start a new booking.";
        setErrorMessage(msg);
        setStatus("error");
      }
    };

    loadHold();
  }, [holdId]);

  const handleComplete = async () => {
    if (!holdId || !hold) return;
    setStatus("consuming");
    try {
      const res = await fetcher.post<{
        data?: {
          booking_id?: string;
          booking_number?: string;
          payment_url?: string | null;
        };
      }>(`/api/public/booking-holds/${holdId}/consume`, {
        payment_method: paymentMethod,
        payment_option: paymentOption,
      });

      const data = (res as any)?.data ?? res;
      const paymentUrl = data?.payment_url;
      const bookingId = data?.booking_id;
      const bookingNumber = data?.booking_number;

      if (paymentUrl) {
        setStatus("redirecting");
        window.location.href = paymentUrl;
        return;
      }

      const successUrl = bookingId
        ? `/checkout/success?booking_id=${bookingId}${bookingNumber ? `&booking_number=${bookingNumber}` : ""}`
        : "/checkout/success";
      router.replace(successUrl);
    } catch (err) {
      const msg =
        err instanceof FetchError
          ? err.message
          : "Failed to complete booking. Please try again.";
      setErrorMessage(msg);
      setStatus("error");
    }
  };

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold text-destructive">
            Booking could not be completed
          </h1>
          <p className="text-muted-foreground">{errorMessage}</p>
          <Button onClick={() => router.push("/search")} variant="outline">
            Back to search
          </Button>
        </div>
      </div>
    );
  }

  if (status === "loading" || status === "consuming" || status === "redirecting") {
    const message =
      status === "redirecting"
        ? "Redirecting to payment..."
        : status === "consuming"
        ? "Creating your booking..."
        : "Loading...";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <LoadingTimeout loadingMessage={message} />
      </div>
    );
  }

  if (status === "review" && hold) {
    const totalAmount = hold.booking_services_snapshot.reduce(
      (sum, s) => sum + (s.price || 0),
      0
    );
    const currency = hold.booking_services_snapshot[0]?.currency ?? "ZAR";
    const startDate = new Date(hold.start_at);
    const timeStr = startDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const dateStr = startDate.toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    return (
      <div className="min-h-screen bg-background py-8 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <h1 className="text-2xl font-semibold">Review your booking</h1>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            {hold.booking_services_snapshot.map((s, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>
                  Service {i + 1} · {s.duration_minutes} min
                </span>
                <span className="font-medium">
                  {formatCurrency(s.price, s.currency)}
                </span>
              </div>
            ))}
            <div className="border-t pt-3 flex justify-between font-medium">
              <span>Total</span>
              <span>{formatCurrency(totalAmount, currency)}</span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              <strong>When:</strong> {dateStr} at {timeStr}
            </p>
            <p>
              <strong>Where:</strong>{" "}
              {hold.location_type === "at_salon"
                ? "At salon"
                : hold.address_snapshot?.line1
                ? String(hold.address_snapshot.line1)
                : "At your location"}
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="font-medium">Payment</h2>
            <div className="flex gap-3">
              <Button
                variant={paymentMethod === "card" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setPaymentMethod("card")}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Pay now
              </Button>
              {allowPayInPerson && (
                <Button
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setPaymentMethod("cash")}
                >
                  <Banknote className="mr-2 h-4 w-4" />
                  Pay at venue
                </Button>
              )}
            </div>
            {paymentMethod === "card" && (
              <div className="flex gap-2">
                <Button
                  variant={paymentOption === "deposit" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentOption("deposit")}
                >
                  Deposit
                </Button>
                <Button
                  variant={paymentOption === "full" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPaymentOption("full")}
                >
                  Full amount
                </Button>
              </div>
            )}
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleComplete}
            disabled={(status as string) === "consuming"}
          >
            {(status as string) === "consuming" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Complete booking
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingTimeout loadingMessage="Loading..." />
    </div>
  );
}

export default function BookContinuePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingTimeout loadingMessage="Loading..." />
        </div>
      }
    >
      <BookContinueContent />
    </Suspense>
  );
}
