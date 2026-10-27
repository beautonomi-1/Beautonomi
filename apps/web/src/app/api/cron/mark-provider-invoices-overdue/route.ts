import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";
import { notifyProviderInvoiceOverdue } from "@/lib/notifications/notification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAME = "mark-provider-invoices-overdue";

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob());
}

async function runJob() {
  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: rows, error } = await supabase
    .from("provider_invoices")
    .select(
      "id, provider_id, invoice_number, total_amount, amount_due, due_date, status, overdue_notified_at",
    )
    .in("status", ["sent", "partially_paid"])
    .lt("due_date", today)
    .gt("amount_due", 0)
    .is("overdue_notified_at", null)
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let marked = 0;
  let notified = 0;

  for (const inv of rows ?? []) {
    const row = inv as {
      id: string;
      provider_id: string;
      invoice_number?: string;
      total_amount?: number;
      amount_due?: number;
      due_date?: string;
    };

    const { error: updErr } = await supabase
      .from("provider_invoices")
      .update({
        status: "overdue",
        overdue_notified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .in("status", ["sent", "partially_paid"]);

    if (updErr) continue;
    marked += 1;

    try {
      await notifyProviderInvoiceOverdue(row.provider_id, {
        invoice_number: String(row.invoice_number ?? ""),
        total_amount: Number(row.total_amount ?? 0),
        due_date: String(row.due_date ?? ""),
        amount_due: Number(row.amount_due ?? 0),
      });
      notified += 1;
    } catch (e) {
      console.error(`[${JOB_NAME}] notify failed`, row.id, e);
    }
  }

  return NextResponse.json({ ok: true, marked, notified, scanned: rows?.length ?? 0 });
}
