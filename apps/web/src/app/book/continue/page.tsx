"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, Banknote, Loader2, Tag, Heart } from "lucide-react";
import { CustomFieldsForm } from "@/components/custom-fields/CustomFieldsForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  metadata?: Record<string, unknown>;
  travel_fee?: number;
  travel_distance_km?: number;
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
  const [bookingCustomValues, setBookingCustomValues] = useState<Record<string, string | number | boolean | null>>({});
  const [clientInfo, setClientInfo] = useState<{ firstName: string; lastName: string; email: string; phone: string } | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [specialRequests, setSpecialRequests] = useState("");
  const [promotionCode, setPromotionCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState<number | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState(0);
  const [validatingPromo, setValidatingPromo] = useState(false);

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
          metadata: data.metadata,
          travel_fee: data.travel_fee != null ? Number(data.travel_fee) : undefined,
          travel_distance_km: data.travel_distance_km != null ? Number(data.travel_distance_km) : undefined,
        };
        setHold(holdData);

        try {
          const savedClient = sessionStorage.getItem("beautonomi_booking_client");
          const savedAddons = sessionStorage.getItem("beautonomi_booking_addons");
          const savedRequests = sessionStorage.getItem("beautonomi_booking_special_requests");
          if (savedClient) {
            const parsed = JSON.parse(savedClient) as { firstName?: string; lastName?: string; email?: string; phone?: string };
            setClientInfo({
              firstName: parsed.firstName ?? "",
              lastName: parsed.lastName ?? "",
              email: parsed.email ?? "",
              phone: parsed.phone ?? "",
            });
          }
          if (savedAddons) {
            const parsed = JSON.parse(savedAddons) as string[];
            setAddonIds(Array.isArray(parsed) ? parsed : []);
          }
          if (savedRequests != null) setSpecialRequests(savedRequests);
        } catch {
          // ignore
        }

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
      const payload: Record<string, unknown> = {
        payment_method: paymentMethod,
        payment_option: paymentOption,
        custom_field_values: Object.keys(bookingCustomValues).length > 0 ? bookingCustomValues : undefined,
        addons: addonIds.length > 0 ? addonIds : undefined,
        special_requests: specialRequests.trim() || undefined,
        tip_amount: tipAmount > 0 ? tipAmount : undefined,
        promotion_code: promotionCode.trim() || undefined,
      };
      if (clientInfo && (clientInfo.firstName || clientInfo.lastName || clientInfo.email || clientInfo.phone)) {
        payload.client_info = {
          firstName: clientInfo.firstName.trim() || "Guest",
          lastName: clientInfo.lastName.trim() || "User",
          email: clientInfo.email.trim() || undefined,
          phone: clientInfo.phone.trim() || undefined,
        };
      }
      const res = await fetcher.post<{
        data?: {
          booking_id?: string;
          booking_number?: string;
          payment_url?: string | null;
        };
      }>(`/api/public/booking-holds/${holdId}/consume`, payload);

      const data = (res as any)?.data ?? res;
      const paymentUrl = data?.payment_url;
      const bookingId = data?.booking_id;
      const bookingNumber = data?.booking_number;

      if (paymentUrl) {
        setStatus("redirecting");
        window.location.href = paymentUrl;
        return;
      }

      try {
        sessionStorage.removeItem("beautonomi_booking_client");
        sessionStorage.removeItem("beautonomi_booking_addons");
        sessionStorage.removeItem("beautonomi_booking_special_requests");
      } catch {}
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

  const handleValidatePromo = async () => {
    if (!promotionCode.trim() || !hold) return;
    setPromoError(null);
    setValidatingPromo(true);
    try {
      const servicesTotal = hold.booking_services_snapshot.reduce((sum, s) => sum + (s.price || 0), 0);
      const amount = servicesTotal + (hold.travel_fee ?? 0);
      const res = await fetcher.get<{ valid?: boolean; discount_value?: number; message?: string }>(
        `/api/public/promo-codes/validate?code=${encodeURIComponent(promotionCode.trim())}&amount=${amount}`
      );
      const data = res as any;
      if (data?.valid && data?.discount_value != null) {
        setPromoDiscount(Number(data.discount_value));
      } else {
        setPromoDiscount(null);
        setPromoError(data?.message ?? "Invalid or expired code");
      }
    } catch {
      setPromoDiscount(null);
      setPromoError("Could not validate code");
    } finally {
      setValidatingPromo(false);
    }
  };

  if (status === "review" && hold) {
    const servicesTotal = hold.booking_services_snapshot.reduce(
      (sum, s) => sum + (s.price || 0),
      0
    );
    const travelFee = hold.travel_fee ?? 0;
    const promoDiscountAmount = promoDiscount ?? 0;
    const subtotalAfterPromo = Math.max(0, servicesTotal + travelFee - promoDiscountAmount);
    const totalAmount = subtotalAfterPromo + tipAmount;
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
            {travelFee > 0 && (
              <div className="flex justify-between text-sm">
                <span>Travel fee{hold.travel_distance_km != null ? ` (${hold.travel_distance_km.toFixed(1)} km)` : ""}</span>
                <span className="font-medium">{formatCurrency(travelFee, currency)}</span>
              </div>
            )}
            {promoDiscountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Promo discount</span>
                <span>-{formatCurrency(promoDiscountAmount, currency)}</span>
              </div>
            )}
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Tip (optional)</span>
                <span className="font-medium">{formatCurrency(tipAmount, currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Final total may include add-ons and tax at checkout.</p>
              <div className="flex justify-between font-medium pt-1">
                <span>Total</span>
                <span>{formatCurrency(totalAmount, currency)}</span>
              </div>
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

          {(clientInfo || addonIds.length > 0 || specialRequests) && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h2 className="font-medium">Your details</h2>
              {clientInfo && (clientInfo.firstName || clientInfo.lastName || clientInfo.email || clientInfo.phone) && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(clientInfo.firstName || clientInfo.lastName) && (
                    <p><span className="text-muted-foreground">Name:</span> {[clientInfo.firstName, clientInfo.lastName].filter(Boolean).join(" ")}</p>
                  )}
                  {clientInfo.email && <p><span className="text-muted-foreground">Email:</span> {clientInfo.email}</p>}
                  {clientInfo.phone && <p><span className="text-muted-foreground">Phone:</span> {clientInfo.phone}</p>}
                </div>
              )}
              {specialRequests && <p className="text-sm text-muted-foreground">Notes: {specialRequests}</p>}
              {addonIds.length > 0 && <p className="text-sm text-muted-foreground">Add-ons: {addonIds.length} selected</p>}
            </div>
          )}

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" /> Promo code
            </h2>
            <div className="flex gap-2">
              <Input
                placeholder="Enter code"
                value={promotionCode}
                onChange={(e) => { setPromotionCode(e.target.value.toUpperCase()); setPromoError(null); }}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleValidatePromo} disabled={!promotionCode.trim() || validatingPromo}>
                {validatingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
            {promoError && <p className="text-sm text-destructive">{promoError}</p>}
            {promoDiscount != null && promoDiscount > 0 && <p className="text-sm text-green-600">Discount applied.</p>}
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="font-medium flex items-center gap-2">
              <Heart className="h-4 w-4" /> Add a tip (optional)
            </h2>
            <div className="flex flex-wrap gap-2">
              {[0, 50, 100, 150, 200].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={tipAmount === n ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTipAmount(n)}
                >
                  {n === 0 ? "None" : formatCurrency(n, currency)}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="tip-custom" className="text-sm">Custom</Label>
              <Input
                id="tip-custom"
                type="number"
                min={0}
                step={10}
                placeholder="0"
                value={tipAmount > 0 && ![50, 100, 150, 200].includes(tipAmount) ? tipAmount : ""}
                onChange={(e) => setTipAmount(Math.max(0, Number(e.target.value) || 0))}
                className="w-24"
              />
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="font-medium">Additional details</h2>
            <p className="text-sm text-muted-foreground">
              Optional information for this booking (e.g. notes, preferences).
            </p>
            <CustomFieldsForm
              entityType="booking"
              initialValues={bookingCustomValues}
              onChange={setBookingCustomValues}
              showSaveButton={false}
            />
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
