import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "date-fns";
import { percentOf, sumMoney } from "@beautonomi/utils";
import { formatDateYmd, resolveTz } from "@/lib/dates/provider-tz";
import { insertWithInvoiceNumber } from "@/lib/invoices/insert-with-invoice-number";

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

interface LineItem {
  line_item_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, unknown>;
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

  const lineItems: LineItem[] = [];
  let subtotal = 0;

  if (invoiceType === "platform_fee" || invoiceType === "commission") {
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        "id, total_amount, platform_fee_amount, platform_fee_percentage, service_fee_amount, service_fee_percentage, completed_at, ref_number",
      )
      .eq("provider_id", providerId)
      .eq("status", "completed")
      .gte("completed_at", periodStart)
      .lte("completed_at", periodEnd)
      .order("completed_at", { ascending: true });

    if (bookingsError) throw bookingsError;

    const { data: providerFee } = await supabase
      .from("providers")
      .select("provider_fee_config_id")
      .eq("id", providerId)
      .single();

    let commissionRate = 0;
    const feeConfigId = (providerFee as { provider_fee_config_id?: string | null } | null)
      ?.provider_fee_config_id;
    if (feeConfigId) {
      const { data: feeConfig } = await supabase
        .from("platform_fee_config")
        .select("fee_percentage, fee_type")
        .eq("id", feeConfigId)
        .single();

      const cfg = feeConfig as { fee_type?: string; fee_percentage?: number } | null;
      if (cfg?.fee_type === "percentage" && cfg.fee_percentage) {
        commissionRate = cfg.fee_percentage / 100;
      }
    }

    for (const row of bookings ?? []) {
      const booking = row as Record<string, any>;
      const storedPlatformFee = Number(booking.platform_fee_amount ?? booking.service_fee_amount ?? 0);
      const storedFeePercentage = Number(
        booking.platform_fee_percentage ?? booking.service_fee_percentage ?? 0,
      );
      let invoiceAmount = 0;
      if (invoiceType === "platform_fee") {
        if (storedPlatformFee <= 0) {
          continue;
        }
        invoiceAmount = storedPlatformFee;
      } else {
        if (commissionRate <= 0) {
          continue;
        }
        invoiceAmount = percentOf(Number(booking.total_amount || 0), commissionRate * 100);
      }
      subtotal += invoiceAmount;

      lineItems.push({
        line_item_type: invoiceType === "commission" ? "commission" : "platform_fee",
        description: `${invoiceType === "commission" ? "Commission" : "Platform fee"} for booking ${
          booking.ref_number || String(booking.id).substring(0, 8)
        }`,
        quantity: 1,
        unit_price: invoiceAmount,
        total_price: invoiceAmount,
        reference_type: "booking",
        reference_id: booking.id,
        metadata: {
          booking_total: booking.total_amount,
          commission_rate: commissionRate,
          stored_platform_fee: storedPlatformFee,
          stored_platform_fee_percentage: storedFeePercentage,
          completed_at: booking.completed_at,
          booking_ref: booking.ref_number,
        },
      });
    }
  }

  if (invoiceType === "subscription") {
    return { invoice: null, skipped: "already_collected" };
  }

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
    currency: (providerData as { currency?: string | null }).currency ?? "ZAR",
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
