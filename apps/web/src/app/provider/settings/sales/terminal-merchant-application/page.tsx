"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { FetchError } from "@/lib/http/fetcher";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import LoadingTimeout from "@/components/ui/loading-timeout";
import {
  DOC_TYPE_LABELS,
  TERMINAL_MERCHANT_WIZARD_STEPS,
  requiredDocTypesForEntity,
  type TerminalMerchantApplication,
  type TerminalMerchantDocType,
  type TerminalMerchantEntityType,
} from "@/lib/terminal-merchant/types";

type ApplicationResponse = {
  application: TerminalMerchantApplication;
  prefill: Record<string, unknown>;
  documents: Array<{
    id: string;
    doc_type: TerminalMerchantDocType;
    status: string;
    rejection_reason?: string | null;
  }>;
  linked_orders: Array<{ id: string; commercial_model?: string }>;
};

type CollectionLocation = { id: string; name: string };

type ValidationIssue = { section: string; message: string };

function buildSectionPayload(
  stepId: string,
  form: Partial<TerminalMerchantApplication>,
  accountNumber: string,
): Record<string, unknown> {
  switch (stepId) {
    case "personal":
      return {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        otp_phone: form.otp_phone,
        id_type: form.id_type,
        id_number: form.id_number,
      };
    case "business":
      return {
        entity_type: form.entity_type,
        legal_name: form.legal_name,
        trading_name: form.trading_name,
        registration_number: form.registration_number,
        vat_number: form.vat_number,
      };
    case "address":
      return {
        physical_line1: form.physical_line1,
        physical_suburb: form.physical_suburb,
        physical_city: form.physical_city,
        physical_province: form.physical_province,
        physical_postal_code: form.physical_postal_code,
        physical_country: form.physical_country,
        postal_same_as_physical: form.postal_same_as_physical,
        postal_line1: form.postal_line1,
        postal_suburb: form.postal_suburb,
        postal_city: form.postal_city,
        postal_province: form.postal_province,
        postal_postal_code: form.postal_postal_code,
        postal_country: form.postal_country,
      };
    case "banking": {
      const payload: Record<string, unknown> = {
        bank_code: form.bank_code,
        bank_name: form.bank_name,
        account_type: form.account_type,
        account_holder: form.account_holder,
      };
      if (accountNumber) payload.account_number = accountNumber;
      return payload;
    }
    case "fulfillment":
      return {
        fulfillment_method: form.fulfillment_method ?? "delivery",
        delivery_line1: form.delivery_line1,
        delivery_suburb: form.delivery_suburb,
        delivery_city: form.delivery_city,
        delivery_province: form.delivery_province,
        delivery_postal_code: form.delivery_postal_code,
        delivery_country: form.delivery_country,
        collection_location_id: form.collection_location_id,
      };
    default:
      return {};
  }
}

function StatusTracker({ app }: { app: TerminalMerchantApplication }) {
  const messages: Record<string, string> = {
    submitted: "We received your application and will review it shortly.",
    in_review: "Our team is reviewing your details.",
    info_required: app.info_required_reason ?? "We need a few updates — please fix the sections below.",
    sent_to_acquirer: "Your details were sent to our terminal partner.",
    awaiting_term_sheet: `Watch ${app.otp_phone ?? "your phone"} for an SMS from our terminal partner to accept your term sheet.`,
    approved: "Approved! Your terminal will be dispatched soon.",
    declined: "Your application could not be approved. Contact support if you have questions.",
  };
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <p className="text-sm font-semibold text-indigo-900">{app.application_no}</p>
      <p className="mt-1 text-sm text-indigo-800">
        {messages[app.status] ?? "Complete your application to get your card machine."}
      </p>
    </div>
  );
}

export default function TerminalMerchantApplicationPage() {
  const searchParams = useSearchParams();
  const orderIdParam = searchParams.get("order");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApplicationResponse | null>(null);
  const [collectionLocations, setCollectionLocations] = useState<CollectionLocation[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState<Partial<TerminalMerchantApplication>>({});
  const [accountNumber, setAccountNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const app = data?.application;
  const prefill = data?.prefill ?? {};
  const documents = data?.documents ?? [];
  const identityVerified = prefill.identity_verified === true;
  const editable = app && ["draft", "info_required"].includes(app.status);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let res = await fetcher.get<{ data: ApplicationResponse }>(
        "/api/provider/terminal-merchant-application?create=false",
      );
      if (!res.data?.application) {
        res = await fetcher.post<{ data: ApplicationResponse }>(
          "/api/provider/terminal-merchant-application",
          {},
        );
      }
      setData(res.data ?? null);
      const locRes = await fetcher
        .get<{ data: { locations: CollectionLocation[] } }>("/api/provider/terminal-collection-locations")
        .catch(() => null);
      setCollectionLocations(locRes?.data?.locations ?? []);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to load application");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!app) return;
    setForm((prev) => ({
      ...prev,
      ...app,
      first_name: app.first_name ?? (prefill.first_name as string) ?? "",
      last_name: app.last_name ?? (prefill.last_name as string) ?? "",
      email: app.email ?? (prefill.email as string) ?? "",
      phone: app.phone ?? (prefill.phone as string) ?? "",
      otp_phone: app.otp_phone ?? (prefill.otp_phone as string) ?? "",
      id_type: app.id_type ?? (prefill.id_type as TerminalMerchantApplication["id_type"]) ?? "national_id",
      id_number: app.id_number ?? (prefill.id_number as string) ?? "",
      entity_type: app.entity_type ?? "sole_proprietor",
      legal_name: app.legal_name ?? (prefill.legal_name as string) ?? "",
      trading_name: app.trading_name ?? (prefill.trading_name as string) ?? "",
      physical_line1: app.physical_line1 ?? (prefill.physical_line1 as string) ?? "",
      physical_city: app.physical_city ?? (prefill.physical_city as string) ?? "",
      bank_name: app.bank_name ?? (prefill.bank_name as string) ?? "",
      account_holder: app.account_holder ?? (prefill.account_holder as string) ?? "",
      account_type: app.account_type ?? "cheque_current",
      fulfillment_method: app.fulfillment_method ?? "delivery",
      delivery_line1: app.delivery_line1 ?? app.physical_line1 ?? (prefill.physical_line1 as string) ?? "",
      delivery_city: app.delivery_city ?? app.physical_city ?? (prefill.physical_city as string) ?? "",
    }));
  }, [app?.id]);

  useEffect(() => {
    if (!app || app.status !== "info_required") return;
    const sections = app.info_required_sections ?? [];
    if (sections.length === 0) return;
    const idx = TERMINAL_MERCHANT_WIZARD_STEPS.findIndex((s) => sections.includes(s.id));
    if (idx >= 0) setStepIndex(idx);
  }, [app?.id, app?.status, app?.info_required_sections]);

  const acquisitionBanner = useMemo(() => {
    const order = data?.linked_orders?.find((o) => o.id === orderIdParam) ?? data?.linked_orders?.[0];
    if (orderIdParam || order?.commercial_model === "once_off_purchase") {
      return "For your purchased terminal — one more step before we can ship it.";
    }
    if (order?.commercial_model === "subscription_bundle") {
      return "Included with your plan — complete this to receive your machine.";
    }
    return "Complete this application to receive your card machine.";
  }, [data?.linked_orders, orderIdParam]);

  async function patchSection(section: string, payload: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetcher.patch("/api/provider/terminal-merchant-application", { section, ...payload });
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Save failed");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocument(docType: TerminalMerchantDocType, file: File) {
    setUploadingDoc(docType);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });
      await fetcher.post("/api/provider/terminal-merchant-application/documents", {
        doc_type: docType,
        content_base64: base64,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
      });
      toast.success("Document uploaded");
      await load();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Upload failed");
    } finally {
      setUploadingDoc(null);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetcher.post("/api/provider/terminal-merchant-application/submit", {});
      toast.success("Application submitted — we will review it shortly.");
      await load();
    } catch (err) {
      if (err instanceof FetchError && err.details && typeof err.details === "object") {
        const issues = (err.details as { issues?: ValidationIssue[] }).issues ?? [];
        if (issues.length > 0) {
          const idx = TERMINAL_MERCHANT_WIZARD_STEPS.findIndex((s) => s.id === issues[0]?.section);
          if (idx >= 0) setStepIndex(idx);
          toast.error(issues.map((i) => i.message).join(" · "));
          return;
        }
      }
      toast.error(err instanceof FetchError ? err.message : "Could not submit application");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !data) {
    return <LoadingTimeout loadingMessage="Loading application…" />;
  }

  if (!app) {
    return (
      <SettingsDetailLayout title="Card machine application" backHref="/provider/settings/sales/card-machines">
        <SectionCard>
          <p className="text-sm text-gray-600">Application unavailable. Please try again.</p>
          <Button className="mt-4" onClick={() => void load()}>
            Retry
          </Button>
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  if (!editable) {
    return (
      <SettingsDetailLayout
        title="Card machine application"
        description="Track your Beautonomi card machine onboarding."
        backHref="/provider/settings/sales/card-machines"
      >
        <StatusTracker app={app} />
        <div className="mt-4">
          <Button variant="outline" asChild>
            <Link href="/provider/settings/sales/card-machines">Back to card machines</Link>
          </Button>
        </div>
      </SettingsDetailLayout>
    );
  }

  const step = TERMINAL_MERCHANT_WIZARD_STEPS[stepIndex];
  const requiredDocs = requiredDocTypesForEntity(form.entity_type as TerminalMerchantEntityType);
  const flaggedSections = new Set(app.info_required_sections ?? []);

  return (
    <SettingsDetailLayout
      title="Card machine application"
      description={acquisitionBanner}
      backHref="/provider/settings/sales/card-machines"
    >
      <div className="mb-4 text-sm text-gray-500">
        Step {stepIndex + 1} of {TERMINAL_MERCHANT_WIZARD_STEPS.length}: {step.title}
        {flaggedSections.has(step.id) ? (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Needs update
          </span>
        ) : null}
      </div>

      <SectionCard>
        {step.id === "personal" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["first_name", "First name"],
                ["last_name", "Last name"],
                ["email", "Email"],
                ["phone", "Phone"],
                ["otp_phone", "Term sheet SMS phone"],
                ["id_number", "ID number"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className={key === "email" ? "sm:col-span-2" : ""}>
                <Label>{label}</Label>
                <Input
                  className="mt-1"
                  value={String(form[key] ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <Label>ID type</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["national_id", "passport", "foreign_id"] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={form.id_type === t ? "default" : "outline"}
                    onClick={() => setForm((f) => ({ ...f, id_type: t }))}
                  >
                    {t.replace(/_/g, " ")}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step.id === "business" && (
          <div className="space-y-3">
            <div>
              <Label>Business type</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["sole_proprietor", "Sole proprietor"],
                    ["private_company", "Private company"],
                    ["close_corporation", "Close corporation"],
                    ["partnership", "Partnership"],
                    ["trust", "Trust"],
                    ["npo", "NPO"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={form.entity_type === value ? "default" : "outline"}
                    className="justify-start"
                    onClick={() => setForm((f) => ({ ...f, entity_type: value }))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            {(
              [
                ["legal_name", "Legal name"],
                ["trading_name", "Trading name"],
                ["registration_number", "Registration number"],
                ["vat_number", "VAT number"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  className="mt-1"
                  value={String(form[key] ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}

        {step.id === "address" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["physical_line1", "Physical address"],
                ["physical_suburb", "Suburb"],
                ["physical_city", "City"],
                ["physical_province", "Province"],
                ["physical_postal_code", "Postal code"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className={key === "physical_line1" ? "sm:col-span-2" : ""}>
                <Label>{label}</Label>
                <Input
                  className="mt-1"
                  value={String(form[key] ?? "")}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
              <Label>Postal same as physical</Label>
              <Switch
                checked={form.postal_same_as_physical !== false}
                onCheckedChange={(v) => setForm((f) => ({ ...f, postal_same_as_physical: v }))}
              />
            </div>
          </div>
        )}

        {step.id === "banking" && (
          <div className="space-y-3">
            <div>
              <Label>Bank name</Label>
              <Input
                className="mt-1"
                value={String(form.bank_name ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Account type</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["cheque_current", "Cheque / current"],
                    ["savings", "Savings"],
                    ["transmission", "Transmission"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={form.account_type === value ? "default" : "outline"}
                    onClick={() => setForm((f) => ({ ...f, account_type: value }))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Account holder</Label>
              <Input
                className="mt-1"
                value={String(form.account_holder ?? "")}
                onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))}
              />
            </div>
            <div>
              <Label>Account number</Label>
              <Input
                className="mt-1"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
              {form.account_number_last4 ? (
                <p className="mt-1 text-xs text-gray-500">Saved ending ••••{form.account_number_last4}</p>
              ) : null}
            </div>
          </div>
        )}

        {step.id === "documents" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              South African law requires us to confirm who you are before we can give you a card machine.
            </p>
            {requiredDocs.map((docType) => {
              const doc = documents.find((d) => d.doc_type === docType);
              const meta = DOC_TYPE_LABELS[docType];
              if (docType === "id_document" && identityVerified && !doc) {
                return (
                  <div key={docType} className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <p className="font-medium text-green-800">{meta.title} — Already verified</p>
                  </div>
                );
              }
              return (
                <div key={docType} className="rounded-lg border p-3">
                  <p className="font-medium">{meta.title}</p>
                  <p className="text-sm text-gray-600">{meta.hint}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {doc ? doc.status : "Not added"}
                    {doc?.rejection_reason ? ` — ${doc.rejection_reason}` : ""}
                  </p>
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-gray-50">
                    {uploadingDoc === docType ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileUp className="h-4 w-4" />
                    )}
                    Upload file
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      disabled={uploadingDoc === docType}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadDocument(docType, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {step.id === "fulfillment" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={form.fulfillment_method !== "collection" ? "default" : "outline"}
                onClick={() => setForm((f) => ({ ...f, fulfillment_method: "delivery" }))}
              >
                Deliver to my address
              </Button>
              <Button
                type="button"
                variant={form.fulfillment_method === "collection" ? "default" : "outline"}
                onClick={() => setForm((f) => ({ ...f, fulfillment_method: "collection" }))}
              >
                Collect from pickup point
              </Button>
            </div>
            {form.fulfillment_method === "collection" ? (
              collectionLocations.length === 0 ? (
                <p className="text-sm text-amber-700">No pickup locations configured — choose delivery or contact support.</p>
              ) : (
                <div className="grid gap-2">
                  {collectionLocations.map((loc) => (
                    <Button
                      key={loc.id}
                      type="button"
                      variant={form.collection_location_id === loc.id ? "default" : "outline"}
                      className="justify-start"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          collection_location_id: loc.id,
                          fulfillment_method: "collection",
                        }))
                      }
                    >
                      {loc.name}
                    </Button>
                  ))}
                </div>
              )
            ) : (
              <>
                <div>
                  <Label>Delivery address</Label>
                  <Input
                    className="mt-1"
                    value={String(form.delivery_line1 ?? form.physical_line1 ?? "")}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, delivery_line1: e.target.value, fulfillment_method: "delivery" }))
                    }
                  />
                </div>
                <div>
                  <Label>Delivery city</Label>
                  <Input
                    className="mt-1"
                    value={String(form.delivery_city ?? form.physical_city ?? "")}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, delivery_city: e.target.value, fulfillment_method: "delivery" }))
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}

        {step.id === "review" && (
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              After review, a term sheet will be sent to <strong>{form.otp_phone ?? "your phone"}</strong> by our
              terminal partner. Accept it via SMS on that number.
            </p>
            <p className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              When you submit, our team reviews your documents before dispatch.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {stepIndex > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStepIndex((i) => i - 1)} disabled={saving}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          ) : null}
          {stepIndex < TERMINAL_MERCHANT_WIZARD_STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                const payload = buildSectionPayload(step.id, form, accountNumber);
                await patchSection(step.id, payload);
                setStepIndex((i) => i + 1);
              }}
            >
              {saving ? "Saving…" : "Save & continue"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? "Submitting…" : "Submit application"}
            </Button>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
