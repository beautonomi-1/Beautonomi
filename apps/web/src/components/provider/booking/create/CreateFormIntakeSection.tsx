"use client";

import { useEffect, useState } from "react";
import { getMissingRequiredProviderFormField } from "@beautonomi/utils";
import { useTranslation } from "@beautonomi/i18n";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { fetcher } from "@/lib/http/fetcher";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

type FormField = {
  id: string;
  name: string;
  field_type?: string;
  is_required?: boolean;
};

export type ProviderIntakeForm = {
  id: string;
  title: string;
  is_required?: boolean;
  is_active?: boolean;
  fields?: FormField[];
};

/** `form_id` → `field_id` → value, the same shape checkout and `POST /api/provider/bookings` use. */
export type IntakeFormResponses = Record<string, Record<string, unknown>>;

interface CreateFormIntakeSectionProps {
  responses: IntakeFormResponses;
  onChange: (next: IntakeFormResponses) => void;
  onValidationChange?: (valid: boolean) => void;
  onFormsLoaded?: (forms: ProviderIntakeForm[]) => void;
}

export function CreateFormIntakeSection({
  responses,
  onChange,
  onValidationChange,
  onFormsLoaded,
}: CreateFormIntakeSectionProps) {
  const { t } = useTranslation();
  const [forms, setForms] = useState<ProviderIntakeForm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data?: ProviderIntakeForm[] }>("/api/provider/forms");
        if (!cancelled) setForms((res?.data ?? []).filter((f) => f.is_active !== false));
      } catch {
        if (!cancelled) setForms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    onValidationChange?.(validateIntakeResponses(forms, responses));
  }, [forms, responses, onValidationChange]);

  useEffect(() => {
    if (!loading) onFormsLoaded?.(forms);
  }, [forms, loading, onFormsLoaded]);

  if (loading || forms.length === 0) return null;

  const setField = (formId: string, fieldId: string, value: unknown) => {
    onChange({
      ...responses,
      [formId]: { ...(responses[formId] ?? {}), [fieldId]: value },
    });
  };

  return (
    <div id="booking-create-section-intake">
      {forms.map((form) => (
        <BookingSectionCard key={form.id}>
          <BookingSectionLabel className="mb-3">
            {form.title}
            {form.is_required ? " *" : ""}
          </BookingSectionLabel>
          <div className="space-y-3">
            {(form.fields ?? []).map((field) => {
              const raw = responses[form.id]?.[field.id];
              const val = raw === undefined || raw === null ? "" : String(raw);
              const required = Boolean(field.is_required || form.is_required);
              const inputId = `intake-${form.id}-${field.id}`;
              return (
                <div key={field.id}>
                  <label htmlFor={inputId} className="text-xs font-medium text-gray-600 mb-1 block">
                    {field.name}
                    {required ? " *" : ""}
                  </label>
                  {field.field_type === "checkbox" ? (
                    <div className="flex items-center gap-2 min-h-[44px]">
                      <Checkbox
                        id={inputId}
                        checked={raw === true}
                        onCheckedChange={(checked) => setField(form.id, field.id, checked === true)}
                      />
                      <span className="text-sm text-gray-600">{t("web.booking.steps.forms.yes")}</span>
                    </div>
                  ) : (
                    <Input
                      id={inputId}
                      type={field.field_type === "date" ? "date" : "text"}
                      value={val}
                      placeholder={
                        field.field_type === "signature" ? t("web.booking.steps.typeNameToSign") : undefined
                      }
                      onChange={(e) => setField(form.id, field.id, e.target.value)}
                      className="rounded-xl min-h-[44px]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </BookingSectionCard>
      ))}
    </div>
  );
}

/** True when every required intake field is answered (same rule the bookings API enforces). */
export function validateIntakeResponses(
  forms: ProviderIntakeForm[],
  responses: IntakeFormResponses,
): boolean {
  const normalized = forms.map((form) => ({
    id: form.id,
    title: form.title,
    is_required: Boolean(form.is_required),
    fields: (form.fields ?? []).map((field) => ({
      id: field.id,
      name: field.name,
      field_type: field.field_type ?? "text",
      is_required: Boolean(field.is_required),
    })),
  }));
  return (
    getMissingRequiredProviderFormField(
      normalized,
      responses as Record<string, Record<string, string | number | boolean | null>>,
    ) === null
  );
}

/** Drops blank answers and empty forms so the API only sees what was actually filled in. */
export function sanitizeIntakeResponses(
  responses: IntakeFormResponses,
): IntakeFormResponses {
  const out: IntakeFormResponses = {};
  for (const [formId, fields] of Object.entries(responses)) {
    const inner: Record<string, unknown> = {};
    for (const [fieldId, value] of Object.entries(fields ?? {})) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      inner[fieldId] = value;
    }
    if (Object.keys(inner).length > 0) out[formId] = inner;
  }
  return out;
}
