import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/cron-auth";
import { runLockedCronRoute } from "@/lib/cron/locked-cron-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const JOB_NAME = "issue-provider-invoices";

/**
 * GET /api/cron/issue-provider-invoices
 *
 * No-op: customer-paid platform fees are retained at checkout and must not be
 * invoiced to providers. Kept on the schedule so deployments do not 404.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error ?? "Unauthorized" }, { status: 401 });
  }
  return runLockedCronRoute(JOB_NAME, () => runJob());
}

async function runJob() {
  console.info(
    `[${JOB_NAME}] skipped: customer-paid platform fees are recorded at checkout`,
  );
  return NextResponse.json({
    skipped: true,
    reason: "customer_paid_platform_fee_model",
    message:
      "Scheduled platform-fee invoicing is disabled. Customer-paid fees are recorded at checkout.",
  });
}