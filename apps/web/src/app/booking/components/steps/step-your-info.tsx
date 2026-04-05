"use client";

import { useState, useEffect } from "react";
import { User, Mail, FileText } from "lucide-react";
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
      newErrors.firstName = "First name is required";
    }

    if (!clientInfo.lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    if (!clientInfo.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!EMAIL_REGEX.test(clientInfo.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!clientInfo.phone.trim()) {
      newErrors.phone = "Phone number is required";
    } else if (!isCompleteE164(clientInfo.phone)) {
      newErrors.phone = "Please enter a valid phone number with country code";
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
          {t("booking.yourInfo")}
        </h2>
        <p className="text-gray-600">
          We'll use this to confirm your booking and send reminders
        </p>
      </div>

      <div className="space-y-4">
        {/* First Name */}
        <div>
          <Label htmlFor="firstName" className="flex items-center gap-2">
            <User className="w-4 h-4" />
            First Name *
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
            placeholder="John"
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
            Last Name *
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
            placeholder="Doe"
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
            {t("auth.email")} *
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
            placeholder="john.doe@example.com"
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
            label={`${t("auth.phone")} *`}
            value={clientInfo.phone}
            onChange={(e164) => {
              setClientInfo({ ...clientInfo, phone: e164 });
              if (errors.phone) {
                setErrors({ ...errors, phone: undefined });
              }
            }}
            className={errors.phone ? "[&_input]:border-red-500" : ""}
            placeholder="Phone number"
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
            {t("booking.specialRequests")} ({t("common.optional")})
          </Label>
          <Textarea
            id="specialRequests"
            value={clientInfo.specialRequests}
            onChange={(e) =>
              setClientInfo({ ...clientInfo, specialRequests: e.target.value })
            }
            rows={3}
            className="mt-1 touch-target"
            placeholder="Any allergies, preferences, or special instructions..."
          />
        </div>

        {/* House Call Specific Instructions - Only show for mobile bookings */}
        {bookingState.mode === "mobile" && (
          <div>
            <Label htmlFor="houseCallInstructions" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              House Call Instructions (Optional)
            </Label>
            <Textarea
              id="houseCallInstructions"
              value={clientInfo.houseCallInstructions || ""}
              onChange={(e) =>
                setClientInfo({ ...clientInfo, houseCallInstructions: e.target.value })
              }
              rows={3}
              className="mt-1 touch-target"
              placeholder="Equipment needed, accessibility requirements, pet information, or other house call specific instructions..."
            />
            <p className="text-xs text-gray-500 mt-1">
              This information helps your provider prepare for the visit
            </p>
          </div>
        )}
      </div>

      {/* Continue as Guest Option */}
      <div className="pt-4 border-t">
        <p className="text-sm text-gray-600 text-center">
          You can continue this booking as a guest. We only ask you to sign in at payment to secure your booking.
        </p>
        <p className="text-xs text-center text-gray-500 mt-2">
          Want to sign in now?{" "}
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
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
