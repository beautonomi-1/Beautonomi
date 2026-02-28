"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { BookingData, ClientIntake, ProviderFormResponses, CustomFieldValues } from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_EDGE,
  BOOKING_BORDER,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_BUTTON,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";
import {
  normalizePhoneToE164,
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_COUNTRY_OPTIONS,
  getFlagEmoji,
} from "@/lib/phone";
import { Check, X } from "lucide-react";

// Lazy-load to avoid pulling Radix Select into initial bundle and prevent HMR/React module conflicts
const CustomFieldsForm = dynamic(
  () => import("@/components/custom-fields/CustomFieldsForm").then((m) => ({ default: m.CustomFieldsForm })),
  { ssr: false }
);

const cardStyle = {
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(16px) saturate(180%)",
  WebkitBackdropFilter: "blur(16px) saturate(180%)",
  border: `1px solid ${BOOKING_EDGE}`,
  borderRadius: "32px",
  boxShadow: BOOKING_SHADOW_CARD,
};

interface ProviderFormField {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  sort_order: number;
}

interface ProviderForm {
  id: string;
  title: string;
  description: string | null;
  form_type: string;
  is_required: boolean;
  is_active: boolean;
  fields: ProviderFormField[];
}

interface BookingCustomDefinition {
  id: string;
  name: string;
  label: string;
  field_type: string;
  is_required: boolean;
}

interface StepIntakeProps {
  data: BookingData;
  providerForms: ProviderForm[];
  bookingCustomDefinitions: BookingCustomDefinition[];
  onChange: (client: Partial<ClientIntake>) => void;
  onProviderFormResponsesChange: (responses: ProviderFormResponses) => void;
  onCustomFieldValuesChange: (values: CustomFieldValues) => void;
  onNext: () => void;
}

export function StepIntake({
  data,
  providerForms,
  bookingCustomDefinitions,
  onChange,
  onProviderFormResponsesChange,
  onCustomFieldValuesChange,
  onNext,
}: StepIntakeProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [phoneCountryCode, setPhoneCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const c = data.client;
  const providerFormValues = data.provider_form_responses ?? {};
  const customFieldValues = data.custom_field_values ?? {};

  const trimmedEmail = c.email.trim();
  const validEmail = trimmedEmail !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const normalizedPhone = normalizePhoneToE164(c.phone, phoneCountryCode);

  const baseValid =
    c.firstName.trim() !== "" &&
    c.lastName.trim() !== "" &&
    validEmail &&
    !!normalizedPhone;

  // Validate required provider form fields
  let providerFormsValid = true;
  for (const form of providerForms) {
    if (!form.is_required) continue;
    for (const field of form.fields || []) {
      if (!field.is_required) continue;
      const val = providerFormValues[form.id]?.[field.id];
      if (val === undefined || val === null || String(val).trim() === "") {
        providerFormsValid = false;
        break;
      }
    }
    if (!providerFormsValid) break;
  }

  // Validate required booking custom fields (by name)
  const requiredCustomNames = bookingCustomDefinitions.filter((d) => d.is_required).map((d) => d.name);
  const customValid = requiredCustomNames.every(
    (name) =>
      customFieldValues[name] !== undefined &&
      customFieldValues[name] !== null &&
      String(customFieldValues[name]).trim() !== ""
  );

  const canNext = baseValid && providerFormsValid && customValid;

  const handleNext = () => {
    setValidationError(null);
    if (!c.firstName.trim() || !c.lastName.trim()) {
      setValidationError("Please enter your first and last name.");
      return;
    }
    if (!validEmail) {
      setValidationError("Please enter a valid email address.");
      return;
    }
    const e164 = normalizePhoneToE164(c.phone, phoneCountryCode);
    if (!e164) {
      setValidationError("Please enter a valid phone number with country code (e.g. 082 123 4567 for South Africa).");
      return;
    }
    if (!baseValid) {
      setValidationError("Please fill in your name, email, and phone.");
      return;
    }
    // Store E.164 so downstream and Supabase get consistent format (with or without leading 0)
    onChange({ phone: e164 });
    if (!providerFormsValid) {
      setValidationError("Please complete all required provider forms.");
      return;
    }
    if (!customValid) {
      setValidationError("Please fill in all required additional details (marked with *).");
      return;
    }
    onNext();
  };

  const updateProviderFormValue = (formId: string, fieldId: string, value: string | number | boolean | null) => {
    onProviderFormResponsesChange({
      ...providerFormValues,
      [formId]: {
        ...(providerFormValues[formId] ?? {}),
        [fieldId]: value,
      },
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-left">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          Your details
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>We’ll use this to confirm your booking</p>
      </div>

      <div className="p-5 space-y-4 rounded-3xl" style={cardStyle}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="first-name" className="text-sm font-medium text-gray-700">First name</Label>
            <Input
              id="first-name"
              placeholder="First name"
              value={c.firstName}
              onChange={(e) => onChange({ firstName: e.target.value })}
              className="rounded-xl h-12 border-gray-200 bg-gray-50/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last-name" className="text-sm font-medium text-gray-700">Last name</Label>
            <Input
              id="last-name"
              placeholder="Last name"
              value={c.lastName}
              onChange={(e) => onChange({ lastName: e.target.value })}
              className="rounded-xl h-12 border-gray-200 bg-gray-50/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={c.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className="rounded-xl h-12 border-gray-200 bg-gray-50/50 pr-10"
              autoComplete="email"
            />
            {c.email.trim() !== "" && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {validEmail ? (
                  <Check className="h-5 w-5" style={{ color: "#16a34a" }} aria-hidden />
                ) : (
                  <X className="h-5 w-5" style={{ color: "#dc2626" }} aria-hidden />
                )}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium text-gray-700">Phone (with country code)</Label>
          <div className="flex gap-2">
            <select
              id="phone-country"
              aria-label="Country code"
              value={phoneCountryCode}
              onChange={(e) => setPhoneCountryCode(e.target.value)}
              className="rounded-xl h-12 pl-2 pr-8 border bg-gray-50/50 text-sm font-medium min-w-[110px] focus:outline-none focus:ring-2"
              style={{ borderColor: BOOKING_BORDER, outlineColor: BOOKING_ACCENT }}
            >
              {PHONE_COUNTRY_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {getFlagEmoji(opt.iso2)} {opt.dial}
                </option>
              ))}
            </select>
            <div className="relative flex-1">
              <Input
                id="phone"
                type="tel"
                placeholder={phoneCountryCode === "27" ? "82 123 4567" : "Phone number"}
                value={c.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
                className="rounded-xl h-12 border-gray-200 bg-gray-50/50 flex-1 pr-10"
                autoComplete="tel-national"
              />
              {c.phone.trim() !== "" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {normalizedPhone ? (
                    <Check className="h-5 w-5" style={{ color: "#16a34a" }} aria-hidden />
                  ) : (
                    <X className="h-5 w-5" style={{ color: "#dc2626" }} aria-hidden />
                  )}
                </span>
              )}
            </div>
          </div>
          <p className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>
            Include country code or use 0 for local (e.g. 082 for South Africa).
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="special-requests" className="text-sm font-medium text-gray-700">
            Special requests <span className="text-gray-400 font-normal">(optional)</span>
          </Label>
          <textarea
            id="special-requests"
            placeholder="Allergies, preferences, access notes..."
            value={c.specialRequests}
            onChange={(e) => onChange({ specialRequests: e.target.value })}
            rows={Math.min(6, Math.max(3, (c.specialRequests.match(/\n/g)?.length ?? 0) + 3))}
            className="w-full rounded-xl border px-4 py-3 text-sm min-h-[88px] resize-y focus:outline-none focus:ring-2"
            style={{
              borderColor: BOOKING_BORDER,
              backgroundColor: "rgba(255,255,255,0.8)",
              outlineColor: BOOKING_ACCENT,
            }}
          />
        </div>
      </div>

      {/* Platform booking custom fields */}
      {bookingCustomDefinitions.length > 0 && (
        <div className="p-5 space-y-3 rounded-3xl" style={cardStyle}>
          <h3 className="text-lg font-medium text-left" style={{ color: BOOKING_TEXT_PRIMARY }}>
            Additional details
          </h3>
          <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
            {bookingCustomDefinitions.some((d) => d.is_required)
              ? "Please complete all required fields (marked with *)."
              : "Optional information for this booking."}
          </p>
          <CustomFieldsForm
            entityType="booking"
            initialValues={customFieldValues}
            onChange={onCustomFieldValuesChange}
            showSaveButton={false}
            compact={false}
          />
        </div>
      )}

      {/* Provider intake / extra forms */}
      {providerForms.length > 0 && (
        <div className="p-5 space-y-4 rounded-3xl" style={cardStyle}>
          <h3 className="text-lg font-medium text-left" style={{ color: BOOKING_TEXT_PRIMARY }}>
            Forms from your provider
          </h3>
          <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
            Please complete the following as required by the provider.
          </p>
          {providerForms.map((form) => (
            <div
              key={form.id}
              className="rounded-2xl border p-4 space-y-3"
              style={{ borderColor: BOOKING_BORDER, backgroundColor: "rgba(0,0,0,0.02)" }}
            >
              <div>
                <h4 className="font-medium text-sm text-gray-800">
                  {form.title}
                  {form.is_required && <span className="text-red-500 ml-1">*</span>}
                </h4>
                {form.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{form.description}</p>
                )}
              </div>
              <div className="space-y-2">
                {(form.fields || []).map((field) => (
                  <div key={field.id} className="space-y-1">
                    <Label className="text-sm font-medium text-gray-700">
                      {field.name}
                      {field.is_required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    {field.field_type === "text" || field.field_type === "signature" ? (
                      <Input
                        value={String(providerFormValues[form.id]?.[field.id] ?? "")}
                        onChange={(e) => updateProviderFormValue(form.id, field.id, e.target.value)}
                        placeholder={field.field_type === "signature" ? "Type your name to sign" : undefined}
                        className="rounded-xl mt-1 border-gray-200 bg-white"
                      />
                    ) : field.field_type === "checkbox" ? (
                      <div className="flex items-center gap-2 mt-1">
                        <Checkbox
                          checked={Boolean(providerFormValues[form.id]?.[field.id])}
                          onCheckedChange={(checked) =>
                            updateProviderFormValue(form.id, field.id, checked === true)
                          }
                        />
                        <span className="text-sm text-gray-600">Yes</span>
                      </div>
                    ) : field.field_type === "date" ? (
                      <Input
                        type="date"
                        value={String(providerFormValues[form.id]?.[field.id] ?? "")}
                        onChange={(e) => updateProviderFormValue(form.id, field.id, e.target.value)}
                        className="rounded-xl mt-1 border-gray-200 bg-white"
                      />
                    ) : (
                      <Input
                        value={String(providerFormValues[form.id]?.[field.id] ?? "")}
                        onChange={(e) => updateProviderFormValue(form.id, field.id, e.target.value)}
                        className="rounded-xl mt-1 border-gray-200 bg-white"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {validationError && (
        <p className="text-sm text-red-600 font-medium">{validationError}</p>
      )}

      <button
        type="button"
        onClick={handleNext}
        disabled={!canNext}
        className={cn(
          "w-full rounded-2xl h-12 font-semibold text-white transition-all touch-manipulation disabled:opacity-50 disabled:active:scale-100",
          MIN_TAP,
          BOOKING_ACTIVE_SCALE
        )}
        style={{
          backgroundColor: BOOKING_ACCENT,
          borderRadius: BOOKING_RADIUS_BUTTON,
          boxShadow: BOOKING_SHADOW_CARD,
        }}
      >
        Continue
      </button>
    </div>
  );
}
