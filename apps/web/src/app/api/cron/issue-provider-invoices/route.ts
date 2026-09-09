import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { generateProviderInvoice } from "@/lib/invoices/generate-provider-invoice";
import { notifyProviderInvoiceIssued } from "@/lib/notifications/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "issue-provider-invoices";

/** First and last day of the calendar month preceding `today`, as YYYY-MM-DD. */
function previousMonthPeriod(today: Date): { start: string; end: string } {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * GET /api/cron/issue-provider-invoices
 *
 * Issues last month's platform-fee invoice to every active provider on the 1st.
 * Before this existed a superadmin had to generate each invoice by hand, so in
 * practice providers were never billed.
 *
 * Safe to re-run: `generateProviderInvoice` skips providers that already have a
 * scheduled invoice for the period, and the partial unique index on
 * (provider_id, invoice_type, period_start, period_end) is the backstop.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob(request));
}

async function runJob(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const url = new URL(request.url);

  // Overrides exist so an operator can re-run a missed month without waiting a
  // year for the schedule to come round again.
  const period = previousMonthPeriod(new Date());
  const periodStart = url.searchParams.get("period_start") || period.start;
  const periodEnd = url.searchParams.get("period_end") || period.end;
  const dryRun = url.searchParams.get("dry_run") === "true";

  const { data: providers, error } = await supabase
    .from("providers")
    .select("id")
    .eq("status", "active")
    .limit(2000);

  if (error) {
    console.error(`[${JOB_NAME}] failed to load providers`, error.message);
    return NextResponse.json({ error: "Failed to load providers" }, { status: 500 });
  }

  let issued = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of providers ?? []) {
    const providerId = (row as { id: string }).id;
    try {
      if (dryRun) {
        skipped++;
        continue;
      }

      const { invoice, skipped: skipReason } = await generateProviderInvoice(supabase, {
        providerId,
        periodStart,
        periodEnd,
        invoiceType: "platform_fee",
        generatedBy: "scheduled",
        skipIfEmpty: true,
      });

      if (skipReason || !invoice) {
        skipped++;
        continue;
      }

      // Issue immediately — a draft nobody reviews is the failure mode this job
      // exists to remove.
      const nowIso = new Date().toISOString();
      const { error: sendError } = await supabase
        .from("provider_invoices")
        .update({ status: "sent", sent_at: nowIso, updated_at: nowIso })
        .eq("id", invoice.id as string)
        .eq("status", "draft");

      if (sendError) throw sendError;

      await notifyProviderInvoiceIssued(providerId, {
        invoice_number: String(invoice.invoice_number ?? ""),
        total_amount: Number(invoice.total_amount ?? 0),
        due_date: String(invoice.due_date ?? ""),
        period_start: periodStart,
        period_end: periodEnd,
      });

      issued++;
    } catch (e) {
      failed++;
      console.error(`[${JOB_NAME}] provider ${providerId}`, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({
    ok: true,
    period: { start: periodStart, end: periodEnd },
    dry_run: dryRun,
    providers: providers?.length ?? 0,
    issued,
    skipped,
    failed,
  });
}
