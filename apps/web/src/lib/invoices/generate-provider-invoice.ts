import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "date-fns";
import { percentOf, sumMoney } from "@beautonomi/utils";
import { formatDateYmd, resolveTz } from "@/lib/dates/provider-tz";
import { insertWithInvoiceNumber } from "@/lib/invoices/insert-with-invoice-number";
import {
  buildProviderInvoiceLineItems,
  PROVIDER_FEE_LEDGER_TYPES,
  type InvoiceLedgerRow,
} from "@/lib/invoices/build-provider-invoice-line-items";
import { isNonPayableInvoiceType } from "@/lib/invoices/provider-invoice-status";

export type ProviderInvoiceType =
  | "platform_fee"
  | "commission"
  | "subscription"
  | "transaction_fee"
  | "other";

export interface GenerateProviderInvoiceInput {
  providerId: string;
  periodStart: string;
  periodEnd: string;
  invoiceType?: ProviderInvoiceType;
  createdBy?: string | null;
  /** `admin` for an operator-triggered run, `scheduled` for the monthly cron. */
  generatedBy?: "admin" | "scheduled" | "manual";
  /**
   * Scheduled runs must not open a R0.00 invoice for a provider who had no
   * activity in the period — it is noise the provider has to dismiss.
   */
  skipIfEmpty?: boolean;
}

export interface GenerateProviderInvoiceResult {
  invoice: Record<string, unknown> | null;
  /** Set when nothing was billable and `skipIfEmpty` suppressed the invoice. */
  skipped?: "no_billable_activity" | "already_exists" | "already_collected";
}

export class ProviderInvoiceGenerationError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "VALIDATION_ERROR",
  ) {
    super(message);
    this.name = "ProviderInvoiceGenerationError";
  }
}

/**
 * Builds a platform invoice for one provider and billing period.
 *
 * Shared by the superadmin `POST /api/provider/invoices/generate` route and the
 * monthly issuance cron so both charge identical amounts — the fee stamped on
 * each completed booking, falling back to the provider's configured rate.
 */
export async function generateProviderInvoice(
  supabase: SupabaseClient,
  input: GenerateProviderInvoiceInput,
): Promise<GenerateProviderInvoiceResult> {
  const {
    providerId,
    periodStart,
    periodEnd,
    invoiceType = "platform_fee",
    createdBy = null,
    generatedBy = "admin",
    skipIfEmpty = false,
  } = input;

  if (!providerId || !periodStart || !periodEnd) {
    throw new ProviderInvoiceGenerationError(
      "Provider ID, period start, and period end are required",
      "VALIDATION_ERROR",
    );
  }

  const { data: providerData, error: providerError } = await supabase
    .from("providers")
    .select("id, business_name, billing_email, billing_address, timezone, currency")
    .eq("id", providerId)
    .single();

  if (providerError || !providerData) {
    throw new ProviderInvoiceGenerationError("Provider not found", "NOT_FOUND");
  }

  if (isNonPayableInvoiceType(invoiceType)) {
    return { invoice: null, skipped: "already_collected" };
  }

  // A scheduled run is retried on failure and re-run on redeploys; the partial
  // unique index rejects the duplicate, but checking first keeps the log clean.
  if (generatedBy === "scheduled") {
    const { data: existing } = await supabase
      .from("provider_invoices")
      .select("id")
      .eq("provider_id", providerId)
      .eq("invoice_type", invoiceType)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .eq("generated_by", "scheduled")
      .maybeSingle();
    if (existing) {
      return { invoice: existing as Record<string, unknown>, skipped: "already_exists" };
    }
  }

  if (invoiceType === "subscription") {
    return { invoice: null, skipped: "already_collected" };
  }

  const currency = (providerData as { currency?: string | null }).currency ?? "ZAR";

  // F2-42: lines come from the period's ledger rows; totals are computed from
  // the lines (never from a hard-coded zero subtotal).
  const periodEndExclusive = formatDateYmd(addDays(new Date(`${periodEnd}T12:00:00.000Z`), 1), "UTC");
  const { data: ledgerData, error: ledgerError } = await supabase
    .from("finance_transactions")
    .select("id, transaction_type, amount, booking_id, created_at, description, metadata")
    .eq("provider_id", providerId)
    .in(
      "transaction_type",
      invoiceType === "transaction_fee" ? [...PROVIDER_FEE_LEDGER_TYPES] : ["adjustment", "platform_fee", "commission", "other"],
    )
    .gte("created_at", `${periodStart}T00:00:00.000Z`)
    .lt("created_at", `${periodEndExclusive}T00:00:00.000Z`)
    .order("created_at", { ascending: true });
  if (ledgerError) throw ledgerError;
  const ledgerRows = (ledgerData ?? []) as InvoiceLedgerRow[];

  const bookingIds = [...new Set(ledgerRows.map((r) => r.booking_id).filter((id): id is string => !!id))];
  const paymentProvidersByBooking: Record<string, string[]> = {};
  const bookingRefs: Record<string, string> = {};
  if (bookingIds.length > 0) {
    const { data: payments } = await supabase
      .from("booking_payments")
      .select("booking_id, payment_provider")
      .in("booking_id", bookingIds)
      .eq("status", "completed");
    for (const p of (payments ?? []) as Array<{ booking_id?: string; payment_provider?: string | null }>) {
      if (!p.booking_id) continue;
      (paymentProvidersByBooking[p.booking_id] ??= []).push(String(p.payment_provider ?? ""));
    }
    const { data: bookingRows } = await supabase
      .from("bookings")
      .select("id, booking_number")
      .in("id", bookingIds);
    for (const b of (bookingRows ?? []) as Array<{ id?: string; booking_number?: string | null }>) {
      if (b.id && b.booking_number) bookingRefs[b.id] = b.booking_number;
    }
  }

  const { lineItems, subtotal } = buildProviderInvoiceLineItems({
    invoiceType,
    ledgerRows,
    paymentProvidersByBooking,
    bookingRefs,
    currency,
  });

  if (skipIfEmpty && subtotal <= 0) {
    return { invoice: null, skipped: "no_billable_activity" };
  }

  // Tax rate from platform_settings.settings.taxes.default_tax_rate (JSONB)
  const { data: settingsRow } = await supabase
    .from("platform_settings")
    .select("settings")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const taxes = ((settingsRow as { settings?: Record<string, any> } | null)?.settings)?.taxes as
    | Record<string, any>
    | undefined;
  const taxRate = (taxes?.default_tax_rate as number) ?? 0;
  const taxAmount = percentOf(subtotal, taxRate);
  const totalAmount = sumMoney(subtotal, taxAmount);

  const invoiceTz = resolveTz((providerData as { timezone?: string | null }).timezone);
  const issueDate = formatDateYmd(new Date(), invoiceTz);
  const year = parseInt(issueDate.slice(0, 4), 10);
  // 30 calendar days from issue date in provider timezone
  const dueDate = formatDateYmd(addDays(new Date(`${issueDate}T12:00:00.000Z`), 30), invoiceTz);

  const invoice = await insertWithInvoiceNumber(supabase, year, {
    provider_id: providerId,
    invoice_type: invoiceType,
    period_start: periodStart,
    period_end: periodEnd,
    issue_date: issueDate,
    due_date: dueDate,
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    // Pinned at issue time — see migration 881.
    currency,
    status: "draft",
    description: `Invoice for ${invoiceType} from ${periodStart} to ${periodEnd}`,
    line_items: lineItems,
    created_by: createdBy,
    generated_by: generatedBy,
  });

  if (lineItems.length > 0) {
    const { error: lineItemsError } = await supabase
      .from("provider_invoice_line_items")
      .insert(lineItems.map((item) => ({ invoice_id: invoice.id, ...item })));

    // The invoice itself carries `line_items` as JSONB, so the breakdown is not
    // lost — only the normalised reporting rows are.
    if (lineItemsError) {
      await supabase.from("provider_invoices").delete().eq("id", invoice.id as string);
      throw lineItemsError;
    }
  }

  const { data: completeInvoice, error: fetchError } = await supabase
    .from("provider_invoices")
    .select("*, line_items:provider_invoice_line_items(*)")
    .eq("id", invoice.id)
    .single();

  if (fetchError) throw fetchError;

  return { invoice: completeInvoice as Record<string, unknown> };
}
