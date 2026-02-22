"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import type { Booking, BookingEvent, AdditionalCharge } from "@/types/beautonomi";
import { formatOTP } from "@/lib/otp/generator";

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
  const [booking, setBooking] = useState<Booking | null>(initialBooking || null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [isLoading, setIsLoading] = useState(!initialBooking);
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [showOTPInput, setShowOTPInput] = useState(false);

  useEffect(() => {
    if (!initialBooking) {
      loadBooking();
    }
    loadEvents();
    loadAdditionalCharges();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      loadBooking();
      loadEvents();
      loadAdditionalCharges();
    }, 10000);

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

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error("Please enter a valid 6-digit OTP");
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetcher.post<{ data: { booking: Booking }; error: null }>(
        `/api/me/bookings/${bookingId}/verify-arrival`,
        { otp }
      );
      setBooking(response.data.booking);
      setShowOTPInput(false);
      setOtp("");
      toast.success("Provider arrival verified successfully!");
      loadEvents();
    } catch (error) {
      if (error instanceof FetchError) {
        toast.error(error.message);
      } else {
        toast.error("Failed to verify OTP");
      }
    } finally {
      setIsVerifying(false);
    }
  };

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
        label: "Booking Accepted",
        completed: booking.status !== "pending",
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
  const pendingCharges = additionalCharges.filter(c => c.status === "pending" || c.status === "approved");

  return (
    <div className="flex flex-col bg-white text-gray-900 p-4">
      <h2 className="text-xl font-semibold mb-4">Order #{booking.booking_number}</h2>
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

      {/* OTP Verification Section */}
      {needsOTPVerification && (
        <div className="border-t pt-4 mt-4 bg-blue-50 p-4 rounded-lg">
          <div className="flex items-start gap-3 mb-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">Provider Arrived - Verification Required</h3>
              <p className="text-sm text-blue-700">
                Please enter the 6-digit code sent to your phone/email to confirm the provider's arrival.
              </p>
            </div>
          </div>
          {!showOTPInput ? (
            <Button onClick={() => setShowOTPInput(true)} className="w-full">
              Enter Verification Code
            </Button>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="otp" className="text-sm font-medium">
                  Verification Code
                </Label>
                <Input
                  id="otp"
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="mt-1 text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the 6-digit code: {formatOTP(otp) || "------"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleVerifyOTP}
                  disabled={isVerifying || otp.length !== 6}
                  className="flex-1"
                >
                  {isVerifying ? "Verifying..." : "Verify"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowOTPInput(false);
                    setOtp("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
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
                  size="sm"
                  className="w-full mt-2"
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
            <AvatarFallback>P</AvatarFallback>
          </Avatar>
          <div className="ml-3">
            <div className="font-medium">Provider</div>
            <div className="text-yellow-500">★★★★★</div>
          </div>
        </div>
        <Button variant="secondary">Message</Button>
      </div>
    </div>
  );
}
