"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, MessageCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import type { Booking, BookingEvent, AdditionalCharge } from "@/types/beautonomi";
import { formatOTP } from "@/lib/otp/generator";
import {
  ARRIVAL_PIN_CUSTOMER_HEADING,
  ARRIVAL_PIN_CUSTOMER_SUBTITLE,
  ARRIVAL_PIN_CUSTOMER_SUBTITLE_WITH_QR,
  ARRIVAL_QR_CUSTOMER_SUBTITLE_WITH_PIN,
  ARRIVAL_PIN_FALLBACK_LABEL,
  ARRIVAL_PIN_LENGTH_HINT,
  ARRIVAL_PIN_PLACEHOLDER,
  ARRIVAL_PIN_TOAST_CUSTOMER_INCOMPLETE,
  getCustomerEtaUiParts,
} from "@beautonomi/utils";
import { generateQRCodeDataURL, isQRCodeExpired, type QRCodeData } from "@/lib/qr/generator";
import { getSupabaseClient } from "@/lib/supabase/client";

function isCompleteArrivalOtpInput(raw: string): boolean {
  const c = raw.replace(/\D/g, "");
  return c.length === 4 || c.length === 6;
}

interface OrderDetailsDynamicProps {
  bookingId: string;
  booking?: Booking;
}

interface BookingStep {
  key: string;
  label: string;
  completed: boolean;
  current: boolean;
  timestamp?: string;
}

export default function OrderDetailsDynamic({ bookingId, booking: initialBooking }: OrderDetailsDynamicProps) {
  const router = useRouter();
  const [booking, setBooking] = useState<Booking | null>(initialBooking || null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [isLoading, setIsLoading] = useState(!initialBooking);
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showOTPInput, setShowOTPInput] = useState(false);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [pinSecondsLeft, setPinSecondsLeft] = useState<number | null>(null);
  const [arrivalQrUrl, setArrivalQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!initialBooking) {
      loadBooking();
    }
    loadEvents();
    loadAdditionalCharges();

    const interval = setInterval(() => {
      loadBooking();
      loadEvents();
      loadAdditionalCharges();
    }, 15000);

    return () => clearInterval(interval);
  }, [bookingId, initialBooking]);

  const loadBooking = async () => {
    try {
      const response = await fetcher.get<{ data: Booking; error: null }>(`/api/me/bookings/${bookingId}`);
      setBooking(response.data);
    } catch (error) {
      console.error("Error loading booking:", error);
      if (error instanceof FetchError) {
        toast.error(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const response = await fetcher.get<{ data: { events: BookingEvent[] }; error: null }>(`/api/me/bookings/${bookingId}/events`);
      setEvents(response.data.events || []);
    } catch (error) {
      console.error("Error loading events:", error);
    }
  };

  const loadAdditionalCharges = async () => {
    try {
      const response = await fetcher.get<{ data: { charges: AdditionalCharge[] }; error: null }>(
        `/api/me/bookings/${bookingId}/additional-charges`
      );
      setAdditionalCharges(response.data.charges || []);
    } catch (error) {
      console.error("Error loading additional charges:", error);
    }
  };

  /** Realtime booking updates (mirrors customer-app `booking-detail.tsx`) + 15s poll fallback above */
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !bookingId) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`checkout-order-detail-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${bookingId}`,
        },
        () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void loadBooking();
            void loadEvents();
            void loadAdditionalCharges();
          }, 400);
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [bookingId]);

  const handleVerifyOTP = async () => {
    const code = otp.replace(/\D/g, "");
    if (!isCompleteArrivalOtpInput(code)) {
      toast.error(ARRIVAL_PIN_TOAST_CUSTOMER_INCOMPLETE);
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetcher.post<{ data: { booking: Booking }; error: null }>(
        `/api/me/bookings/${bookingId}/verify-arrival`,
        { otp: code }
      );
      setBooking(response.data.booking);
      setShowOTPInput(false);
      setOtp("");
      toast.success("Provider arrival verified successfully!");
      loadBooking();
      loadEvents();
    } catch (error) {
      if (error instanceof FetchError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to verify");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendPin = async () => {
    if (isResending || (resendCooldownUntil != null && Date.now() < resendCooldownUntil)) return;
    setIsResending(true);
    try {
      await fetcher.post<{ data: { arrival_otp_expires_at?: string }; error: { message?: string; code?: string } }>(
        `/api/me/bookings/${bookingId}/resend-arrival-otp`,
        {}
      );
      setResendCooldownUntil(Date.now() + 90000);
      toast.success("New verification ready. Check the app and your notifications.");
      loadBooking();
    } catch (error) {
      if (error instanceof FetchError) {
        toast.error(error.message);
        if (error.status === 429) {
          setResendCooldownUntil(Date.now() + 90000);
        }
      } else {
        toast.error("Failed to resend");
      }
    } finally {
      setIsResending(false);
    }
  };

  // Countdown for PIN expiry
  const pinExpiresAt = booking?.arrival_otp_expires_at;
  useEffect(() => {
    if (!booking?.arrival_otp_verified && pinExpiresAt) {
      const tick = () => {
        const left = Math.max(0, Math.ceil((new Date(pinExpiresAt).getTime() - Date.now()) / 1000));
        setPinSecondsLeft(left);
      };
      tick();
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    } else {
      setPinSecondsLeft(null);
    }
  }, [booking?.arrival_otp_verified, pinExpiresAt]);

  /** Raw payload from API (included when QR exists, even if expired — matches mobile + GET /api/me/bookings/:id). */
  const arrivalQrRaw = (() => {
    if (!booking) return null;
    const row = booking as {
      qr_code_data?: unknown;
      qr_code_verified?: boolean;
    };
    if (row.qr_code_data == null || row.qr_code_verified) return null;
    return row.qr_code_data as QRCodeData;
  })();

  const qrExpired =
    !!booking &&
    !!arrivalQrRaw &&
    !!(booking as { qr_code_expires_at?: string | null }).qr_code_expires_at &&
    isQRCodeExpired(String((booking as { qr_code_expires_at?: string }).qr_code_expires_at));

  const qrPayloadForImage = qrExpired ? null : arrivalQrRaw;

  useEffect(() => {
    if (!qrPayloadForImage?.verification_code) {
      setArrivalQrUrl(null);
      return;
    }
    let cancelled = false;
    generateQRCodeDataURL(qrPayloadForImage)
      .then((url) => {
        if (!cancelled) setArrivalQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setArrivalQrUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrPayloadForImage]);

  const getSteps = (): BookingStep[] => {
    if (!booking) return [];

    const isAtHome = booking.location_type === "at_home";
    const currentStage = booking.current_stage || booking.status;

    // Define steps based on booking type
    const atHomeSteps: BookingStep[] = [
      {
        key: "confirmed",
        label: "Booking Accepted",
        completed: booking.status === "confirmed" || ["provider_on_way", "provider_arrived", "service_started", "service_completed"].includes(currentStage || ""),
        current: booking.status === "confirmed" && currentStage === "confirmed",
        timestamp: events.find(e => e.event_type === "confirmed")?.created_at,
      },
      {
        key: "provider_on_way",
        label: "Provider on the way",
        completed: ["provider_arrived", "service_started", "service_completed"].includes(currentStage || ""),
        current: currentStage === "provider_on_way",
        timestamp: events.find(e => e.event_type === "provider_on_way")?.created_at,
      },
      {
        key: "provider_arrived",
        label: "Provider arrived",
        completed: booking.arrival_otp_verified || ["service_started", "service_completed"].includes(currentStage || ""),
        current: currentStage === "provider_arrived" && !booking.arrival_otp_verified,
        timestamp: events.find(e => e.event_type === "provider_arrived")?.created_at,
      },
      {
        key: "service_started",
        label: "Service in-progress",
        completed: booking.status === "completed" || currentStage === "service_completed",
        current: booking.status === "in_progress" || currentStage === "service_started",
        timestamp: events.find(e => e.event_type === "service_started")?.created_at,
      },
      {
        key: "service_completed",
        label: "Service Complete",
        completed: booking.status === "completed",
        current: currentStage === "service_completed",
        timestamp: events.find(e => e.event_type === "service_completed")?.created_at || booking.completed_at,
      },
    ];

    const atSalonSteps: BookingStep[] = [
      {
        key: "confirmed",
        // "Booking Accepted" means the provider has confirmed. `pending` AND
        // `pending_payment` are both pre-acceptance states — neither should
        // mark this step as complete or current.
        label: "Booking Accepted",
        completed: booking.status !== "pending" && booking.status !== "pending_payment",
        current: booking.status === "confirmed",
        timestamp: events.find(e => e.event_type === "confirmed")?.created_at,
      },
      {
        key: "in_progress",
        label: "Service in-progress",
        completed: booking.status === "completed",
        current: booking.status === "in_progress",
        timestamp: events.find(e => e.event_type === "service_started")?.created_at,
      },
      {
        key: "completed",
        label: "Service Complete",
        completed: booking.status === "completed",
        current: booking.status === "completed",
        timestamp: booking.completed_at || events.find(e => e.event_type === "service_completed")?.created_at,
      },
    ];

    return isAtHome ? atHomeSteps : atSalonSteps;
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col bg-white text-gray-900 p-4">
        <div className="animate-pulse">Loading booking details...</div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex flex-col bg-white text-gray-900 p-4">
        <div className="text-red-600">Booking not found</div>
      </div>
    );
  }

  const steps = getSteps();
  const needsOTPVerification = booking.location_type === "at_home" && 
                               booking.current_stage === "provider_arrived" && 
                               !booking.arrival_otp_verified;
  const bothArrivalMethodsVisible =
    Boolean(needsOTPVerification && booking.arrival_otp && arrivalQrRaw);
  const pendingCharges = additionalCharges.filter(c => c.status === "pending" || c.status === "approved");
  /** `provider_en_route_at` is historical — only `current_stage === "provider_on_way"` means still en route. */
  const showETA =
    booking.location_type === "at_home" &&
    !["completed", "cancelled", "no_show"].includes(booking.status) &&
    booking.current_stage === "provider_on_way" &&
    booking.estimated_arrival;
  const etaParts = showETA ? getCustomerEtaUiParts(booking.estimated_arrival ?? null) : { show: false, timeLabel: null as string | null, minutesLabel: "" };

  return (
    <div className="flex flex-col bg-white text-gray-900 p-4">
      <h2 className="text-xl font-semibold mb-4">Order #{booking.booking_number}</h2>
      {showETA && etaParts.show && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="font-medium text-blue-900">Provider en route</p>
          <p className="text-blue-800 mt-0.5">
            Estimated arrival: {etaParts.timeLabel}
            {" · "}
            {etaParts.minutesLabel}
          </p>
          <p className="text-blue-700/90 mt-1 text-xs">We refresh this as your provider moves.</p>
        </div>
      )}
      <div className="flex space-x-4 mb-4 text-sm">
        <span className="text-muted font-normal">Tracking</span>
        <span className="text-gray-400 font-light">Receipt</span>
        <span className="text-gray-400 font-light">Details</span>
      </div>
      <div className="flex-grow">
        <div className="relative">
          <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-200"></div>
          {steps.map((step, _index) => (
            <div key={step.key} className="relative flex items-center mb-8">
              <div
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 ${
                  step.completed
                    ? "bg-green-500 border-green-500"
                    : step.current
                    ? "bg-blue-500 border-blue-500"
                    : "bg-white border-gray-300"
                }`}
              >
                {step.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-white" />
                ) : step.current ? (
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                ) : null}
              </div>
              <div className={`ml-4 flex-1 ${step.completed || step.current ? "text-gray-900 font-medium" : "text-gray-500 font-light"}`}>
                <div>{step.label}</div>
                {step.timestamp && (
                  <div className="text-xs text-gray-400 font-light mt-1">
                    {formatTimestamp(step.timestamp)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Customer-holds-PIN (+ optional QR): same verification as mobile; default platform has both enabled */}
      {needsOTPVerification && (
        <div className="border-t pt-4 mt-4 bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start gap-3 mb-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">{ARRIVAL_PIN_CUSTOMER_HEADING}</h3>
              <p className="text-sm text-blue-700">
                {bothArrivalMethodsVisible ? ARRIVAL_PIN_CUSTOMER_SUBTITLE_WITH_QR : ARRIVAL_PIN_CUSTOMER_SUBTITLE}
              </p>
            </div>
          </div>
          {booking.arrival_otp ? (
            <>
              <div className="text-center my-4">
                <span className="text-3xl font-bold tracking-[0.25em] text-blue-900">
                  {formatOTP(booking.arrival_otp)}
                </span>
              </div>
              {pinSecondsLeft != null && (
                <p className="text-sm text-blue-700 mb-3">
                  {pinSecondsLeft > 0
                    ? `Code expires in ${Math.floor(pinSecondsLeft / 60)}:${String(pinSecondsLeft % 60).padStart(2, "0")}`
                    : "Code expired — use the button below for a new code and QR."}
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleResendPin}
                  disabled={isResending || (resendCooldownUntil != null && Date.now() < resendCooldownUntil)}
                  variant="default"
                >
                  {isResending
                    ? "Sending…"
                    : resendCooldownUntil != null && Date.now() < resendCooldownUntil
                      ? "Resend (wait)"
                      : pinSecondsLeft === 0
                        ? "Get new code & QR"
                        : "Resend code"}
                </Button>
                {!showOTPInput ? (
                  <Button variant="outline" onClick={() => setShowOTPInput(true)}>
                    Having trouble? Enter code here
                  </Button>
                ) : (
                  <div className="w-full pt-3 mt-3 border-t border-blue-200 space-y-3">
                    <Label htmlFor="otp-fallback" className="text-sm font-medium">{ARRIVAL_PIN_FALLBACK_LABEL}</Label>
                    <p className="text-xs text-blue-800/90 mb-2">{ARRIVAL_PIN_LENGTH_HINT}</p>
                    <Input
                      id="otp-fallback"
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      placeholder={ARRIVAL_PIN_PLACEHOLDER}
                      className="text-center text-xl tracking-widest"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={handleVerifyOTP}
                        disabled={isVerifying || !isCompleteArrivalOtpInput(otp)}
                        className="flex-1"
                      >
                        {isVerifying ? "Verifying…" : "Verify"}
                      </Button>
                      <Button variant="outline" onClick={() => { setShowOTPInput(false); setOtp(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-blue-700">Check your phone or email for the code, or resend below.</p>
              <Button onClick={handleResendPin} disabled={isResending}>Resend code</Button>
              <Button variant="outline" onClick={() => setShowOTPInput(true)}>Enter code here</Button>
              {showOTPInput && (
                <div className="pt-3 space-y-3">
                  <p className="text-xs text-blue-800/90 mb-2">{ARRIVAL_PIN_LENGTH_HINT}</p>
                  <Input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder={ARRIVAL_PIN_PLACEHOLDER}
                    className="text-center text-xl tracking-widest"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleVerifyOTP} disabled={isVerifying || !isCompleteArrivalOtpInput(otp)}>
                      {isVerifying ? "Verifying…" : "Verify"}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowOTPInput(false); setOtp(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {needsOTPVerification && arrivalQrRaw && (
        <div className="border-t pt-4 mt-4 rounded-lg border border-purple-200 bg-purple-50/80 p-4">
          <h3 className="font-semibold text-purple-900 mb-1">Show this QR to your provider</h3>
          <p className="text-sm text-purple-800 mb-4">
            {bothArrivalMethodsVisible
              ? ARRIVAL_QR_CUSTOMER_SUBTITLE_WITH_PIN
              : "They will scan it or enter the code on their device to confirm they've arrived."}
          </p>
          {qrExpired ? (
            <div className="rounded-lg bg-white/90 border border-purple-100 p-4 text-center space-y-3">
              <p className="text-sm text-purple-800">
                This QR is no longer valid. Refresh to show a new code for your provider.
              </p>
              {booking.arrival_otp ? (
                <p className="text-xs text-purple-700">
                  Use the resend button in the blue verification section above — it refreshes your PIN and this QR.
                </p>
              ) : (
                <Button onClick={handleResendPin} disabled={isResending || (resendCooldownUntil != null && Date.now() < resendCooldownUntil)}>
                  {isResending ? "Refreshing…" : "Refresh QR & code"}
                </Button>
              )}
            </div>
          ) : arrivalQrUrl ? (
            <div className="flex flex-col items-center rounded-xl bg-white p-4 border border-purple-100">
              <img src={arrivalQrUrl} alt="Arrival verification QR code" className="h-[200px] w-[200px]" />
            </div>
          ) : (
            <p className="text-sm text-purple-700">Generating QR…</p>
          )}
          {!qrExpired && arrivalQrRaw.verification_code ? (
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full border-purple-200 text-purple-900"
              onClick={() => {
                void navigator.clipboard.writeText(arrivalQrRaw.verification_code);
                toast.success("Verification code copied");
              }}
            >
              Copy code:{" "}
              <span className="font-mono font-semibold">{arrivalQrRaw.verification_code}</span>
            </Button>
          ) : null}
        </div>
      )}

      {/* Additional Payment Requests */}
      {pendingCharges.length > 0 && (
        <div className="border-t pt-4 mt-4">
          <h3 className="font-semibold mb-3">Additional Payment Requests</h3>
          {pendingCharges.map((charge) => (
            <div key={charge.id} className="bg-yellow-50 p-3 rounded-lg mb-2">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-medium">{charge.description}</p>
                  <p className="text-sm text-gray-600">
                    {charge.currency} {charge.amount.toFixed(2)}
                  </p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    charge.status === "approved"
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {charge.status === "approved" ? "Approved" : "Pending Approval"}
                </span>
              </div>
              {charge.status === "pending" && (
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await fetcher.post(`/api/me/bookings/${bookingId}/approve-payment`, {
                          charge_id: charge.id,
                          approved: true,
                        });
                        toast.success("Payment request approved");
                        loadAdditionalCharges();
                      } catch (error) {
                        if (error instanceof FetchError) {
                          toast.error(error.message);
                        }
                      }
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await fetcher.post(`/api/me/bookings/${bookingId}/approve-payment`, {
                          charge_id: charge.id,
                          approved: false,
                        });
                        toast.success("Payment request rejected");
                        loadAdditionalCharges();
                      } catch (error) {
                        if (error instanceof FetchError) {
                          toast.error(error.message);
                        }
                      }
                    }}
                  >
                    Reject
                  </Button>
                </div>
              )}
              {charge.status === "approved" && (
                <Button
                  size="rounded"
                  variant="secondary"
                  className="w-full mt-3 h-10 text-sm font-semibold"
                  onClick={async () => {
                    try {
                      const res = await fetcher.post<{ data: any; error: null }>(`/api/me/bookings/${bookingId}/pay-additional`, {
                        charge_id: charge.id,
                      });

                      const paymentUrl = res?.data?.payment_url as string | undefined;
                      if (paymentUrl) {
                        toast.success("Redirecting to payment...");
                        window.location.href = paymentUrl;
                        return;
                      }

                      toast.success("Payment initiated");
                      loadAdditionalCharges();
                    } catch (error) {
                      if (error instanceof FetchError) {
                        toast.error(error.message);
                      }
                    }
                  }}
                >
                  Pay Now
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-4 mt-4">
        <div className="flex items-center">
          <Avatar className="h-12 w-12">
            <AvatarImage src="/placeholder.svg?height=40&width=40" alt="Provider" />
            <AvatarFallback>
              {booking.provider?.business_name?.charAt(0)?.toUpperCase() ?? "P"}
            </AvatarFallback>
          </Avatar>
          <div className="ml-3">
            <div className="font-medium">{booking.provider?.business_name ?? "Provider"}</div>
            <div className="text-yellow-500">★★★★★</div>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            const providerId = booking.provider?.id;
            if (providerId) {
              router.push(`/account-settings/messages?provider=${providerId}&bookingId=${bookingId}`);
            }
          }}
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Message
        </Button>
      </div>
    </div>
  );
}
