"use client";

import { useState } from "react";
import { Camera, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
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
  clientPhone?: string | null;
  contactAttemptCount?: number;
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
  clientPhone,
  contactAttemptCount = 0,
  onUpdated,
}: BookingAtHomeJourneySectionProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [qrJsonPaste, setQrJsonPaste] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [reachBusy, setReachBusy] = useState(false);

  const verified = arrivalOtpVerified || qrCodeVerified;

  const logAttempt = async (channel: "call" | "whatsapp" | "other", href?: string) => {
    setReachBusy(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/contact-attempt`, {
        channel,
        note: channel === "other" ? t("web.provider.bookings.detail.atHome.couldntReach") : undefined,
      });
      toast.success(t("web.provider.bookings.detail.atHome.attemptLogged"));
      onUpdated?.();
      if (href) window.open(href, "_blank", "noopener,noreferrer");
    } catch {
      toast.error(t("web.provider.bookings.detail.atHome.couldNotLogAttempt"));
    } finally {
      setReachBusy(false);
    }
  };

  const postVerify = async (body: Record<string, string>) => {
    await fetcher.post(`/api/provider/bookings/${bookingId}/verify-arrival`, body);
    toast.success(t("web.provider.bookings.detail.atHome.arrivalVerified"));
    setPin("");
    setQrCode("");
    setQrJsonPaste("");
    onUpdated?.();
    return true;
  };

  const verifyPin = async () => {
    const code = pin.replace(/\D/g, "");
    if (![4, 6].includes(code.length)) {
      toast.error(t("web.provider.bookings.detail.atHome.enterPin"));
      return;
    }
    setVerifying(true);
    try {
      await postVerify({ otp: code });
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.bookings.detail.atHome.verificationFailed"));
    } finally {
      setVerifying(false);
    }
  };

  const verifyQrCode = async () => {
    const code = qrCode.replace(/\s/g, "").toUpperCase();
    if (code.length < 6) {
      toast.error(t("web.provider.bookings.detail.atHome.enterQr"));
      return;
    }
    setVerifying(true);
    try {
      await postVerify({ qr_code: code });
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.bookings.detail.atHome.qrVerificationFailed"));
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
      toast.error(t("web.provider.bookings.detail.atHome.invalidQrPayload"));
      return false;
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.bookings.detail.atHome.qrVerificationFailed"));
      return false;
    } finally {
      setVerifying(false);
    }
  };

  const resendOtp = async () => {
    setResending(true);
    try {
      await fetcher.post(`/api/provider/bookings/${bookingId}/resend-arrival-otp`, {});
      toast.success(t("web.provider.bookings.detail.atHome.newCodeSent"));
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.bookings.detail.atHome.resendFailed"));
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
      toast.success(t("web.provider.bookings.detail.atHome.arrivalVerifiedManually"));
      setOverrideOpen(false);
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.bookings.detail.atHome.overrideFailed"));
    } finally {
      setOverriding(false);
    }
  };

  return (
    <BookingSectionCard>
      <div data-testid="at-home-journey-section">
      <BookingSectionLabel className="mb-2 flex items-center gap-1.5">
        <MapPin className="h-4 w-4" />
        {t("web.provider.bookings.detail.atHome.journeyTitle")}
      </BookingSectionLabel>
      <p className="text-sm text-gray-600">
        {t("web.provider.bookings.detail.atHome.stage", { stage: currentStage ?? status })}
        {verified ? t("web.provider.bookings.detail.atHome.verifiedSuffix") : ""}
      </p>

      {!verified && (arrivalOtpPending || qrArrivalPending) ? (
        <div className="mt-3 space-y-3">
          {arrivalOtpPending ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">
                {t("web.provider.bookings.detail.atHome.customerPin")}
              </label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("web.provider.bookings.detail.atHome.pinPlaceholder")}
                className="rounded-xl min-h-[44px] max-w-[160px] tracking-widest"
              />
              <div className="flex flex-wrap gap-2">
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  disabled={verifying || ![4, 6].includes(pin.replace(/\D/g, "").length)}
                  onClick={() => void verifyPin()}
                >
                  {verifying
                    ? t("web.provider.bookings.detail.atHome.verifying")
                    : t("web.provider.bookings.detail.atHome.verifyPin")}
                </BookingActionButton>
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  disabled={resending}
                  onClick={() => void resendOtp()}
                >
                  {resending
                    ? t("web.provider.bookings.detail.atHome.sending")
                    : t("web.provider.bookings.detail.atHome.resendCode")}
                </BookingActionButton>
              </div>
            </div>
          ) : null}

          {qrArrivalPending ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">
                {t("web.provider.bookings.detail.atHome.qrScanCode")}
              </label>
              <Input
                value={qrCode}
                onChange={(e) =>
                  setQrCode(e.target.value.replace(/\s/g, "").toUpperCase().slice(0, 12))
                }
                placeholder={t("web.provider.bookings.detail.atHome.qrCodePlaceholder")}
                className="rounded-xl min-h-[44px] font-mono uppercase"
              />
              <div className="flex flex-wrap gap-2">
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  disabled={verifying || qrCode.length < 6}
                  onClick={() => void verifyQrCode()}
                >
                  {verifying
                    ? t("web.provider.bookings.detail.atHome.verifying")
                    : t("web.provider.bookings.detail.atHome.verifyQr")}
                </BookingActionButton>
                <BookingActionButton
                  size="sm"
                  fullWidth={false}
                  variant="outline"
                  onClick={() => setScanOpen(true)}
                  data-testid="at-home-scan-camera"
                >
                  <Camera className="me-1 h-4 w-4" />
                  {t("web.provider.bookings.detail.atHome.scanWithCamera")}
                </BookingActionButton>
              </div>
              <div className="space-y-1 pt-1">
                <label className="text-xs font-medium text-gray-700">
                  {t("web.provider.bookings.detail.atHome.pasteJsonLabel")}
                </label>
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
                  {t("web.provider.bookings.detail.atHome.verifyPastedQr")}
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
            {t("web.provider.bookings.detail.atHome.customerCantVerify")}
          </BookingActionButton>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-800">
          {t("web.provider.bookings.detail.atHome.couldntReach")}
        </p>
        <p className="text-[11px] text-gray-600">
          {t("web.provider.bookings.detail.atHome.logAttemptHint")}{" "}
          {contactAttemptCount > 0
            ? t("web.provider.bookings.detail.atHome.attemptsLogged", { count: contactAttemptCount })
            : t("web.provider.bookings.detail.atHome.noAttempts")}
        </p>
        <div className="flex flex-wrap gap-2">
          {clientPhone ? (
            <>
              <BookingActionButton
                size="sm"
                fullWidth={false}
                variant="outline"
                disabled={reachBusy}
                onClick={() =>
                  void logAttempt("call", `tel:${clientPhone.replace(/\s/g, "")}`)
                }
              >
                {t("web.provider.bookings.detail.atHome.call")}
              </BookingActionButton>
              <BookingActionButton
                size="sm"
                fullWidth={false}
                variant="outline"
                disabled={reachBusy}
                onClick={() =>
                  void logAttempt(
                    "whatsapp",
                    `https://wa.me/${clientPhone.replace(/\D/g, "")}`,
                  )
                }
              >
                {t("web.provider.bookings.detail.atHome.whatsapp")}
              </BookingActionButton>
            </>
          ) : (
            <BookingActionButton
              size="sm"
              fullWidth={false}
              variant="outline"
              disabled={reachBusy}
              onClick={() => void logAttempt("other")}
            >
              {t("web.provider.bookings.detail.atHome.logAttempt")}
            </BookingActionButton>
          )}
        </div>
      </div>

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
