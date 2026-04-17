"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CustomFieldsForm,
  type CustomFieldDefinition,
} from "@/components/custom-fields/CustomFieldsForm";
import type { BookingState } from "../booking-flow";

/**
 * B11: provider intake / consent / waiver forms + booking-level custom fields
 * collected inline in the canonical `/booking` flow, mirroring the existing
 * `/book/continue` review screen. Runs between `yourInfo` and `payment` so
 * values are available in the POST /api/public/bookings body.
 */

export interface ProviderFormField {
  id: string;
  name: string;
  field_type: string;
  is_required: boolean;
  sort_order: number;
}

export interface ProviderFormDefinition {
  id: string;
  title: string;
  description: string | null;
  form_type: string;
  is_required: boolean;
  is_active: boolean;
  fields: ProviderFormField[];
}

interface StepFormsProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
  /**
   * Hoist loaded provider forms + custom-field definitions up to the flow so
   * `effectiveStepOrder` can drop this step automatically when nothing is
   * configured — otherwise a refresh lands on an empty screen. Counts are raw
   * lengths, not "has required" (loading is async and skipping a step mid-flow
   * would confuse Back).
   */
  onLoaded?: (info: {
    providerFormsCount: number;
    customFieldDefinitionsCount: number;
  }) => void;
  /**
   * Reports whether every required field (booking custom fields + provider
   * form fields) currently has a non-empty value, so the parent can drive
   * the sticky action bar's Continue button without re-implementing field
   * validation here.
   */
  onCompletionChange?: (complete: boolean) => void;
}

export default function StepForms({
  bookingState,
  updateBookingState,
  onNext,
  onLoaded,
  onCompletionChange,
}: StepFormsProps) {
  const providerId = bookingState.providerId;
  const [providerForms, setProviderForms] = useState<ProviderFormDefinition[]>(
    [],
  );
  const [customDefs, setCustomDefs] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const autoSkippedRef = useRef(false);

  const providerFormValues = bookingState.providerFormResponses ?? {};
  const customFieldValues = bookingState.customFieldValues ?? {};

  const updateProviderFormValue = (
    formId: string,
    fieldId: string,
    value: string | number | boolean | null,
  ) => {
    const next = {
      ...(bookingState.providerFormResponses ?? {}),
      [formId]: {
        ...((bookingState.providerFormResponses ?? {})[formId] ?? {}),
        [fieldId]: value,
      },
    };
    updateBookingState({ providerFormResponses: next });
  };

  const updateCustomValues = (
    values: Record<string, string | number | boolean | null>,
  ) => {
    updateBookingState({ customFieldValues: values });
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!providerId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [formsRes, defsRes] = await Promise.all([
          fetcher
            .get<
              | { data?: { forms?: ProviderFormDefinition[] } }
              | { forms?: ProviderFormDefinition[] }
            >(`/api/public/provider-forms?provider_id=${providerId}`)
            .catch(() => ({}) as any),
          fetcher
            .get<{ data?: { definitions?: CustomFieldDefinition[] } }>(
              "/api/custom-fields/definitions?entity_type=booking",
            )
            .catch(() => ({}) as any),
        ]);
        if (cancelled) return;
        const formsData = (formsRes as any)?.data ?? formsRes;
        const forms: ProviderFormDefinition[] = Array.isArray(formsData?.forms)
          ? formsData.forms
          : [];
        const defs: CustomFieldDefinition[] =
          (defsRes as any)?.data?.definitions ?? [];
        setProviderForms(forms);
        setCustomDefs(defs);
        onLoaded?.({
          providerFormsCount: forms.length,
          customFieldDefinitionsCount: defs.length,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

  // Auto-advance once if there is genuinely nothing to show. Guarded by a ref
  // so that returning via Back doesn't cause an infinite skip/return loop.
  useEffect(() => {
    if (loading) return;
    if (autoSkippedRef.current) return;
    if (providerForms.length === 0 && customDefs.length === 0) {
      autoSkippedRef.current = true;
      onNext();
    }
  }, [loading, providerForms.length, customDefs.length, onNext]);

  const hasRequiredUnfilled = useMemo(() => {
    // Track completeness across both collections. `useMemo` keeps onChange
    // effect below stable: we fire only when `complete` flips.
    for (const def of customDefs) {
      if (!def.is_required) continue;
      const v = customFieldValues[def.name];
      if (v === undefined || v === null || String(v).trim() === "") return true;
    }
    for (const form of providerForms) {
      for (const field of form.fields || []) {
        if (!(field.is_required || form.is_required)) continue;
        const v = providerFormValues[form.id]?.[field.id];
        if (field.field_type === "checkbox") {
          if (!v) return true;
        } else if (v === undefined || v === null || String(v).trim() === "") {
          return true;
        }
      }
    }
    return false;
  }, [customDefs, providerForms, providerFormValues, customFieldValues]);

  useEffect(() => {
    onCompletionChange?.(!hasRequiredUnfilled);
  }, [hasRequiredUnfilled, onCompletionChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading forms…
      </div>
    );
  }

  if (providerForms.length === 0 && customDefs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {customDefs.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
          <h2 className="font-semibold text-gray-900">Additional details</h2>
          <p className="text-sm text-gray-500">
            {customDefs.some((d) => d.is_required)
              ? "Please complete all required fields (marked with *)."
              : "Optional information for this booking."}
          </p>
          <CustomFieldsForm
            entityType="booking"
            initialValues={customFieldValues}
            onChange={updateCustomValues}
            showSaveButton={false}
          />
        </div>
      )}

      {providerForms.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Provider forms
          </h2>
          <p className="text-sm text-gray-500">
            Please complete the following forms as required by the provider.
          </p>
          {providerForms.map((form) => (
            <div
              key={form.id}
              className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-3"
            >
              <div>
                <h3 className="font-medium text-sm text-gray-900">
                  {form.title}
                  {form.is_required && (
                    <span className="text-red-600 ml-1">*</span>
                  )}
                </h3>
                {form.description && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {form.description}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                {(form.fields || []).map((field) => {
                  const raw = providerFormValues[form.id]?.[field.id];
                  const strValue =
                    raw === undefined || raw === null ? "" : String(raw);
                  const isCheckbox = field.field_type === "checkbox";
                  return (
                    <div key={field.id} className="space-y-1">
                      <Label className="text-sm text-gray-800">
                        {field.name}
                        {(field.is_required || form.is_required) && (
                          <span className="text-red-600 ml-1">*</span>
                        )}
                      </Label>
                      {isCheckbox ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Checkbox
                            checked={Boolean(raw)}
                            onCheckedChange={(checked) =>
                              updateProviderFormValue(
                                form.id,
                                field.id,
                                checked === true,
                              )
                            }
                          />
                          <span className="text-sm text-gray-600">Yes</span>
                        </div>
                      ) : field.field_type === "date" ? (
                        <Input
                          type="date"
                          value={strValue}
                          onChange={(e) =>
                            updateProviderFormValue(
                              form.id,
                              field.id,
                              e.target.value,
                            )
                          }
                        />
                      ) : field.field_type === "signature" ? (
                        <Input
                          value={strValue}
                          placeholder="Type your name to sign"
                          onChange={(e) =>
                            updateProviderFormValue(
                              form.id,
                              field.id,
                              e.target.value,
                            )
                          }
                        />
                      ) : (
                        <Input
                          value={strValue}
                          onChange={(e) =>
                            updateProviderFormValue(
                              form.id,
                              field.id,
                              e.target.value,
                            )
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasRequiredUnfilled && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Some required fields are not complete. You won&rsquo;t be able to
          continue until every required field (marked with *) has a value.
        </p>
      )}
    </div>
  );
}
