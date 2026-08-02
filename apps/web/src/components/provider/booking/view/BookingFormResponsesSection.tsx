"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

type ProviderForm = {
  id: string;
  title?: string;
  form_type?: string;
  fields?: Array<{ id: string; name?: string }>;
};

interface BookingFormResponsesSectionProps {
  bookingId: string;
  responses?: Record<string, Record<string, unknown>> | null;
  onUpdated?: () => void;
}

export function BookingFormResponsesSection({
  bookingId,
  responses,
  onUpdated,
}: BookingFormResponsesSectionProps) {
  const [forms, setForms] = useState<ProviderForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingFormId, setUploadingFormId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetcher.get<{ data?: ProviderForm[] }>("/api/provider/forms");
        if (!cancelled) setForms(Array.isArray(res?.data) ? res.data : []);
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

  if (!responses || Object.keys(responses).length === 0) return null;

  const getFieldName = (formId: string, fieldId: string) =>
    forms.find((f) => f.id === formId)?.fields?.find((f) => f.id === fieldId)?.name ?? fieldId.slice(0, 8);

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-3">Form responses</BookingSectionLabel>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      ) : (
        <div className="space-y-4">
          {Object.entries(responses).map(([formId, fields]) => {
            const formMeta = forms.find((f) => f.id === formId);
            const formTitle = formMeta?.title ?? `Form ${formId.slice(0, 8)}`;
            const formType = formMeta?.form_type ?? "";
            const isConsentOrWaiver = formType === "consent" || formType === "waiver";
            const consentUrl =
              typeof fields === "object" && fields !== null
                ? (fields._consent_document_url as string | undefined)
                : undefined;
            const visibleEntries =
              typeof fields === "object" && fields !== null
                ? Object.entries(fields).filter(([k]) => k !== "_consent_document_url")
                : [];

            return (
              <div key={formId} className="rounded-xl border bg-gray-50/80 p-3">
                <p className="text-sm font-semibold text-gray-800 mb-2">{formTitle}</p>
                {visibleEntries.length > 0 ? (
                  <dl className="space-y-1.5">
                    {visibleEntries.map(([fieldKey, value]) => (
                      <div key={fieldKey} className="flex justify-between gap-2 text-sm">
                        <dt className="text-gray-600">{getFieldName(formId, fieldKey)}</dt>
                        <dd className="text-gray-900 font-medium text-right break-all">
                          {value === null || value === undefined ? "—" : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-xs text-gray-500">No field responses recorded.</p>
                )}
                {isConsentOrWaiver ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {consentUrl ? (
                      <a
                        href={consentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-primary underline"
                      >
                        View consent document
                      </a>
                    ) : null}
                    <label className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900 touch-manipulation min-h-[44px]">
                      <input
                        type="file"
                        accept=".pdf,image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={!!uploadingFormId}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setUploadingFormId(formId);
                          try {
                            const body = new FormData();
                            body.set("form_id", formId);
                            body.set("file", f);
                            await fetcher.post(`/api/provider/bookings/${bookingId}/consent-document`, body);
                            toast.success("Document uploaded");
                            onUpdated?.();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Upload failed");
                          } finally {
                            setUploadingFormId(null);
                            e.target.value = "";
                          }
                        }}
                      />
                      {consentUrl ? "Replace document" : "Upload consent document"}
                    </label>
                    {uploadingFormId === formId ? (
                      <span className="text-xs text-gray-500">Uploading…</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </BookingSectionCard>
  );
}
