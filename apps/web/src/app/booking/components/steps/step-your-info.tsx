"use client";

import { useState, useEffect } from "react";
import { User, Mail, FileText, Info } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@beautonomi/i18n";
import { BookingState } from "../booking-flow";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";

interface StepYourInfoProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function StepYourInfo({
  bookingState,
  updateBookingState,
  onNext: _onNext,
}: StepYourInfoProps) {
  const [clientInfo, setClientInfo] = useState(
    bookingState.clientInfo || {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      specialRequests: "",
    }
  );
  const { t } = useTranslation();
  const [cancellationSummary, setCancellationSummary] = useState<string | null>(null);
  const yourInfo = "web.booking.steps.yourInfo";

  useEffect(() => {
    const loadPolicy = async () => {
      if (!bookingState.providerId) return;
      try {
        const locationType = bookingState.mode === "salon" ? "at_salon" : "at_home";
        let response = await fetcher.get<{ data: Array<{ policy_text?: string }> }>(
          `/api/public/cancellation-policy?provider_id=${bookingState.providerId}&location_type=${locationType}`,
        );
        if (!response.data?.length) {
          response = await fetcher.get<{ data: Array<{ policy_text?: string }> }>(
            `/api/public/cancellation-policy?provider_id=${bookingState.providerId}`,
          );
        }
        const text = response.data?.[0]?.policy_text?.trim();
        setCancellationSummary(text || null);
      } catch {
        setCancellationSummary(null);
      }
    };
    void loadPolicy();
  }, [bookingState.providerId, bookingState.mode]);

  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }>({});

  // Keep parent bookingState in sync so the sticky Continue bar's canProceed() sees the same data.
  useEffect(() => {
    updateBookingState({ clientInfo });
    // updateBookingState is recreated each parent render; omitting avoids effect loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientInfo]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!clientInfo.firstName.trim()) {
      newErrors.firstName = t(`${yourInfo}.firstNameRequired`);
    }

    if (!clientInfo.lastName.trim()) {
      newErrors.lastName = t(`${yourInfo}.lastNameRequired`);
    }

    if (!clientInfo.email.trim()) {
      newErrors.email = t(`${yourInfo}.emailRequired`);
    } else if (!EMAIL_REGEX.test(clientInfo.email)) {
      newErrors.email = t(`${yourInfo}.invalidEmail`);
    }

    if (!clientInfo.phone.trim()) {
      newErrors.phone = t(`${yourInfo}.phoneRequired`);
    } else if (!isCompleteE164(clientInfo.phone)) {
      newErrors.phone = t(`${yourInfo}.invalidPhone`);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const _handleNext = () => {
    if (validate()) {
      updateBookingState({ clientInfo });
      _onNext();
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          {t(`${yourInfo}.title`)}
        </h2>
        <p className="text-gray-600">
          {t(`${yourInfo}.confirmHint`)}
        </p>
      </div>

      {cancellationSummary ? (
        <div
          className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
          role="region"
          aria-label={t(`${yourInfo}.cancellationPolicy`)}
        >
          <div className="flex gap-2">
            <Info className="h-5 w-5 shrink-0 text-amber-700 mt-0.5" aria-hidden />
            <div>
              <p className="font-semibold text-amber-950 mb-1">{t(`${yourInfo}.cancellationPolicy`)}</p>
              <p className="text-amber-900/95 leading-relaxed">{cancellationSummary}</p>
              <p className="text-xs text-amber-800/90 mt-2">
                {t(`${yourInfo}.cancellationConfirmAgain`)}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* First Name */}
        <div>
          <Label htmlFor="firstName" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            {t(`${yourInfo}.firstNameLabel`)}
          </Label>
          <Input
            id="firstName"
            value={clientInfo.firstName}
            onChange={(e) => {
              setClientInfo({ ...clientInfo, firstName: e.target.value });
              if (errors.firstName) {
                setErrors({ ...errors, firstName: undefined });
              }
            }}
            className={`mt-1 touch-target ${errors.firstName ? "border-red-500" : ""}`}
            placeholder={t("web.booking.steps.firstNamePlaceholder")}
            required
          />
          {errors.firstName && (
            <p className="text-sm text-red-500 mt-1">{errors.firstName}</p>
          )}
        </div>

        {/* Last Name */}
        <div>
          <Label htmlFor="lastName" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            {t(`${yourInfo}.lastNameLabel`)}
          </Label>
          <Input
            id="lastName"
            value={clientInfo.lastName}
            onChange={(e) => {
              setClientInfo({ ...clientInfo, lastName: e.target.value });
              if (errors.lastName) {
                setErrors({ ...errors, lastName: undefined });
              }
            }}
            className={`mt-1 touch-target ${errors.lastName ? "border-red-500" : ""}`}
            placeholder={t("web.booking.steps.lastNamePlaceholder")}
            required
          />
          {errors.lastName && (
            <p className="text-sm text-red-500 mt-1">{errors.lastName}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <Label htmlFor="email" className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            {t(`${yourInfo}.emailLabel`)}
          </Label>
          <Input
            id="email"
            type="email"
            value={clientInfo.email}
            onChange={(e) => {
              setClientInfo({ ...clientInfo, email: e.target.value });
              if (errors.email) {
                setErrors({ ...errors, email: undefined });
              }
            }}
            className={`mt-1 touch-target ${errors.email ? "border-red-500" : ""}`}
            placeholder={t(`${yourInfo}.emailPlaceholder`)}
            required
          />
          {errors.email && (
            <p className="text-sm text-red-500 mt-1">{errors.email}</p>
          )}
        </div>

        {/* Phone */}
        <div>
          <PhoneInput
            inputId="booking-step-your-info-phone"
            label={t(`${yourInfo}.phoneLabel`)}
            value={clientInfo.phone}
            onChange={(e164) => {
              setClientInfo({ ...clientInfo, phone: e164 });
              if (errors.phone) {
                setErrors({ ...errors, phone: undefined });
              }
            }}
            className={errors.phone ? "[&_input]:border-red-500" : ""}
            placeholder={t(`${yourInfo}.phonePlaceholder`)}
            required
          />
          {errors.phone && (
            <p className="text-sm text-red-500 mt-1">{errors.phone}</p>
          )}
        </div>

        {/* Special Requests */}
        <div>
          <Label htmlFor="specialRequests" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {t(`${yourInfo}.specialRequests`)}
          </Label>
          <Textarea
            id="specialRequests"
            value={clientInfo.specialRequests}
            onChange={(e) =>
              setClientInfo({ ...clientInfo, specialRequests: e.target.value })
            }
            rows={3}
            className="mt-1 touch-target"
            placeholder={t("web.booking.steps.specialRequestsPlaceholder")}
          />
        </div>

        {/* House Call Specific Instructions - Only show for mobile bookings */}
        {bookingState.mode === "mobile" && (
          <div>
            <Label htmlFor="houseCallInstructions" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {t(`${yourInfo}.houseCallInstructions`)}
            </Label>
            <Textarea
              id="houseCallInstructions"
              value={clientInfo.houseCallInstructions || ""}
              onChange={(e) =>
                setClientInfo({ ...clientInfo, houseCallInstructions: e.target.value })
              }
              rows={3}
              className="mt-1 touch-target"
              placeholder={t("web.booking.steps.houseCallInstructionsPlaceholder")}
            />
            <p className="text-xs text-gray-500 mt-1">
              {t(`${yourInfo}.houseCallHint`)}
            </p>
          </div>
        )}
      </div>

      {/* Continue as Guest Option */}
      <div className="pt-4 border-t">
        <p className="text-sm text-gray-600 text-center">
          {t(`${yourInfo}.guestContinue`)}
        </p>
        <p className="text-xs text-center text-gray-500 mt-2">
          {t(`${yourInfo}.wantToSignIn`)}{" "}
          <button
            onClick={() => {
              const redirect =
                typeof window !== "undefined"
                  ? `${window.location.pathname}${window.location.search}`
                  : "/";
              window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
            }}
            className="text-primary underline font-medium"
          >
            {t(`${yourInfo}.signIn`)}
          </button>
        </p>
      </div>
    </div>
  );
}
