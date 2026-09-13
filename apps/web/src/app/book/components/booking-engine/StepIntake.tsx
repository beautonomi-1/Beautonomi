"use client";

import { useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { BookingData, ClientIntake, ProviderFormResponses, CustomFieldValues } from "../../types/booking-engine";
import { getMissingRequiredProviderFormField } from "@beautonomi/utils";
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
import { isCompleteE164 } from "@/lib/phone";
import { PhoneInput } from "@/components/ui/phone-input";
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
  const { t } = useTranslation();
  const [validationError, setValidationError] = useState<string | null>(null);
  const c = data.client;
  const providerFormValues = data.provider_form_responses ?? {};
  const customFieldValues = data.custom_field_values ?? {};

  const trimmedEmail = c.email.trim();
  const validEmail = trimmedEmail !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const baseValid =
    c.firstName.trim() !== "" &&
    c.lastName.trim() !== "" &&
    validEmail &&
    isCompleteE164(c.phone);

  // Validate required provider form fields (field required if field.is_required || form.is_required)
  const providerFormsValid = getMissingRequiredProviderFormField(providerForms, providerFormValues) === null;

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
      setValidationError(t("web.book.engine.nameRequired"));
      return;
    }
    if (!validEmail) {
      setValidationError(t("validation.emailInvalid"));
      return;
    }
    const trimmedPhone = c.phone.trim();
    if (!isCompleteE164(trimmedPhone)) {
      setValidationError(t("web.book.engine.phoneWithCountryCode"));
      return;
    }
    if (!baseValid) {
      setValidationError(t("web.book.engine.fillNameEmailPhone"));
      return;
    }
    onChange({ phone: trimmedPhone });
    if (!providerFormsValid) {
      setValidationError(t("web.book.engine.completeProviderForms"));
      return;
    }
    if (!customValid) {
      setValidationError(t("web.book.engine.completeRequiredDetails"));
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
      <div className="text-start">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          {t("web.book.engine.yourDetails")}
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>{t("web.book.engine.detailsConfirmHint")}</p>
      </div>

      <div className="p-5 space-y-4 rounded-3xl" style={cardStyle}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="first-name" className="text-sm font-medium text-gray-700">{t("web.book.engine.firstName")}</Label>
            <Input
              id="first-name"
              placeholder={t("web.book.engine.firstName")}
              value={c.firstName}
              onChange={(e) => onChange({ firstName: e.target.value })}
              className="rounded-xl h-12 border-gray-200 bg-gray-50/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last-name" className="text-sm font-medium text-gray-700">{t("web.book.engine.lastName")}</Label>
            <Input
              id="last-name"
              placeholder={t("web.book.engine.lastName")}
              value={c.lastName}
              onChange={(e) => onChange({ lastName: e.target.value })}
              className="rounded-xl h-12 border-gray-200 bg-gray-50/50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-gray-700">{t("auth.email")}</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              placeholder={t("web.book.engine.emailPlaceholder")}
              value={c.email}
              onChange={(e) => onChange({ email: e.target.value })}
              className="rounded-xl h-12 border-gray-200 bg-gray-50/50 pe-10"
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
          <PhoneInput
            inputId="booking-engine-intake-phone"
            label={t("auth.phone")}
            value={c.phone}
            onChange={(e164) => onChange({ phone: e164 })}
            placeholder={t("auth.phone")}
            required
            className="[&_label]:text-sm [&_label]:font-medium [&_label]:text-gray-700"
          />
          {c.phone.trim() !== "" && (
            <p className="text-xs flex items-center gap-1" style={{ color: BOOKING_TEXT_SECONDARY }}>
              {isCompleteE164(c.phone) ? (
                <Check className="h-4 w-4" style={{ color: "#16a34a" }} aria-hidden />
              ) : (
                <X className="h-4 w-4" style={{ color: "#dc2626" }} aria-hidden />
              )}
              {isCompleteE164(c.phone) ? t("web.book.engine.phoneLooksGood") : t("web.book.engine.phoneCompleteCountryCode")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="special-requests" className="text-sm font-medium text-gray-700">
            {t("web.book.engine.specialRequestsOptional")}
          </Label>
          <textarea
            id="special-requests"
            placeholder={t("web.book.engine.allergiesPlaceholder")}
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
          <h3 className="text-lg font-medium text-start" style={{ color: BOOKING_TEXT_PRIMARY }}>
            {t("web.book.engine.additionalDetails")}
          </h3>
          <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
            {bookingCustomDefinitions.some((d) => d.is_required)
              ? t("web.book.engine.requiredFieldsHint")
              : t("web.book.engine.optionalBookingInfo")}
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
          <h3 className="text-lg font-medium text-start" style={{ color: BOOKING_TEXT_PRIMARY }}>
            {t("web.book.engine.providerFormsTitle")}
          </h3>
          <p className="text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
            {t("web.book.engine.providerFormsHint")}
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
                  {form.is_required && <span className="text-red-500 ms-1">*</span>}
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
                      {field.is_required && <span className="text-red-500 ms-1">*</span>}
                    </Label>
                    {field.field_type === "text" || field.field_type === "signature" ? (
                      <Input
                        value={String(providerFormValues[form.id]?.[field.id] ?? "")}
                        onChange={(e) => updateProviderFormValue(form.id, field.id, e.target.value)}
                        placeholder={field.field_type === "signature" ? t("web.book.engine.typeNameToSign") : undefined}
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
                        <span className="text-sm text-gray-600">{t("common.yes")}</span>
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
        {t("common.continue")}
      </button>
    </div>
  );
}
