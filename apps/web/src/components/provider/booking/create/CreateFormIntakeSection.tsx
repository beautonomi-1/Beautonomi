"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetcher } from "@/lib/http/fetcher";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

type FormField = {
  id: string;
  name: string;
  field_type?: string;
  is_required?: boolean;
};

type ProviderForm = {
  id: string;
  title: string;
  is_required?: boolean;
  fields?: FormField[];
};

export type IntakeFormResponses = Record<string, Record<string, unknown>>;

interface CreateFormIntakeSectionProps {
  responses: IntakeFormResponses;
  onChange: (next: IntakeFormResponses) => void;
  onValidationChange?: (valid: boolean) => void;
}

export function CreateFormIntakeSection({
  responses,
  onChange,
  onValidationChange,
}: CreateFormIntakeSectionProps) {
  const [forms, setForms] = useState<ProviderForm[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data?: ProviderForm[] }>("/api/provider/forms");
        if (!cancelled) setForms(res?.data ?? []);
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

  if (loading || forms.length === 0) return null;

  const setField = (formId: string, fieldName: string, value: unknown) => {
    onChange({
      ...responses,
      [formId]: { ...(responses[formId] ?? {}), [fieldName]: value },
    });
  };

  return (
    <>
      {forms.map((form) => (
        <BookingSectionCard key={form.id}>
          <BookingSectionLabel className="mb-3">
            {form.title}
            {form.is_required ? " *" : ""}
          </BookingSectionLabel>
          <div className="space-y-3">
            {(form.fields ?? []).map((field) => {
              const val = String(responses[form.id]?.[field.name] ?? "");
              const isLong = field.field_type === "textarea" || field.field_type === "long_text";
              return (
                <div key={field.id}>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">
                    {field.name}
                    {field.is_required ? " *" : ""}
                  </label>
                  {isLong ? (
                    <Textarea
                      value={val}
                      onChange={(e) => setField(form.id, field.name, e.target.value)}
                      rows={3}
                      className="rounded-xl"
                    />
                  ) : (
                    <Input
                      value={val}
                      onChange={(e) => setField(form.id, field.name, e.target.value)}
                      className="rounded-xl min-h-[44px]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </BookingSectionCard>
      ))}
    </>
  );
}

/** Returns true if all required intake fields are filled. */
export function validateIntakeResponses(
  forms: ProviderForm[],
  responses: IntakeFormResponses,
): boolean {
  for (const form of forms) {
    if (!form.is_required) continue;
    for (const field of form.fields ?? []) {
      if (!field.is_required) continue;
      const v = responses[form.id]?.[field.name];
      if (v == null || String(v).trim() === "") return false;
    }
  }
  return true;
}
