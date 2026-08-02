"use client";

import { useState } from "react";
import { Camera, MapPin } from "lucide-react";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { isArrivalQrPayloadString } from "@/lib/arrival-qr-payload";
import { ArrivalQrScanDialog } from "@/components/provider/ArrivalQrScanDialog";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";
import { Input } from "@/components/ui/input";
import { OverrideArrivalDialog } from "./OverrideArrivalDialog";

interface BookingAtHomeJourneySectionProps {
  bookingId: string;
  status: string;
  currentStage?: string | null;
  arrivalOtpVerified?: boolean;
  qrCodeVerified?: boolean;
  arrivalOtpPending?: boolean;
  qrArrivalPending?: boolean;
  onUpdated?: () => void;
}

export function BookingAtHomeJourneySection({
  bookingId,
  status,
  currentStage,
  arrivalOtpVerified,
  qrCodeVerified,
  arrivalOtpPending,
  qrArrivalPending,
  onUpdated,
}: BookingAtHomeJourneySectionProps) {
  const [pin, setPin] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [qrJsonPaste, setQrJsonPaste] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const verified = arrivalOtpVerified || qrCodeVerified;

  const postVerify = async (body: Record<string, string>) => {
    await fetcher.post(`/api/provider/bookings/${bookingId}/verify-arrival`, body);
    toast.success("Arrival verified");
    setPin("");
    setQrCode("");
    setQrJsonPaste("");
    onUpdated?.();
    return true;
  };

  const verifyPin = async () => {
    const code = pin.replace(/\D/g, "");
    if (![4, 6].includes(code.length)) {
      toast.error("Enter a 4- or 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      await postVerify({ otp: code });
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const verifyQrCode = async () => {
    const code = qrCode.replace(/\s/g, "").toUpperCase();
    if (code.length < 6) {
      toast.error("Enter the customer's QR code");
      return;
    }
    setVerifying(true);
    try {
      await postVerify({ qr_code: code });
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "QR verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const verifyQrPayload = async (payload: string) => {
    setVerifying(true);
    try {
      if (isArrivalQrPayloadString(payload)) {
        await postVerify({ qr_data: payload });
        return true;
      }
      toast.error("Invalid QR payload");
      return false;
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "QR verification failed");
      return false;
    } finally {
      setVerifying(false);
    }
  };

  const resendOtp = async () => {
    setResending(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/resend-arrival-otp`, {});
      toast.success("New code sent to customer");
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to resend");
    } finally {
      setResending(false);
    }
  };

  const overrideVerification = async (reasonText: string) => {
    setOverriding(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/override-arrival-verification`, {
        reason_code: "other",
        reason_text: reasonText,
      });
      toast.success("Arrival verified manually");
      setOverrideOpen(false);
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to override");
    } finally {
      setOverriding(false);
    }
  };

  return (
    <BookingSectionCard>
      <div data-testid="at-home-journey-section">
      <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
        <MapPin className="h-4 w-4" />
        At-home journey
      </BookingSectionLabel>
      <p className="text-sm text-gray-600">
        Stage: {currentStage ?? status}
        {verified ? " · Verified" : ""}
      </p>

      {!verified && (arrivalOtpPending || qrArrivalPending) ? (
        <div className="mt-3 space-y-3">
          {arrivalOtpPending ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Customer PIN</label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="4–6 digits"
                className="rounded-xl min-h-[44px] max-w-[160px] tracking-widest"
              />
              <div className="flex flex-wrap gap-2">
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  disabled={verifying || ![4, 6].includes(pin.replace(/\D/g, "").length)}
                  onClick={() => void verifyPin()}
                >
                  {verifying ? "Verifying…" : "Verify PIN"}
                </BookingActionButton>
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  disabled={resending}
                  onClick={() => void resendOtp()}
                >
                  {resending ? "Sending…" : "Resend code"}
                </BookingActionButton>
              </div>
            </div>
          ) : null}

          {qrArrivalPending ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">QR / scan code</label>
              <Input
                value={qrCode}
                onChange={(e) =>
                  setQrCode(e.target.value.replace(/\s/g, "").toUpperCase().slice(0, 12))
                }
                placeholder="e.g. AB12CD34"
                className="rounded-xl min-h-[44px] font-mono uppercase"
              />
              <div className="flex flex-wrap gap-2">
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  disabled={verifying || qrCode.length < 6}
                  onClick={() => void verifyQrCode()}
                >
                  {verifying ? "Verifying…" : "Verify QR"}
                </BookingActionButton>
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  onClick={() => setScanOpen(true)}
                  data-testid="at-home-scan-camera"
                >
                  <Camera className="mr-1 h-4 w-4" />
                  Scan with camera
                </BookingActionButton>
              </div>
              <div className="space-y-1 pt-1">
                <label className="text-xs font-medium text-gray-700">Or paste QR JSON</label>
                <Input
                  value={qrJsonPaste}
                  onChange={(e) => setQrJsonPaste(e.target.value)}
                  placeholder='{"booking_id":"…","token":"…"}'
                  className="rounded-xl min-h-[44px] text-xs font-mono"
                />
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  disabled={verifying || !qrJsonPaste.trim()}
                  onClick={() => void verifyQrPayload(qrJsonPaste.trim())}
                >
                  Verify pasted QR
                </BookingActionButton>
              </div>
            </div>
          ) : null}

          <BookingActionButton
            size="sm"
            fullWidth={false}
            variant="outline"
            disabled={overriding}
            onClick={() => setOverrideOpen(true)}
          >
            Customer can&apos;t verify?
          </BookingActionButton>
        </div>
      ) : null}

      <ArrivalQrScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onValidScan={(payload) => verifyQrPayload(payload)}
      />

      <OverrideArrivalDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        saving={overriding}
        onConfirm={(reason) => void overrideVerification(reason)}
      />
      </div>
    </BookingSectionCard>
  );
}
