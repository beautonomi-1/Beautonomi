/**
 * GET /api/cron/provider-stall-check
 *
 * Cron wrapper that runs the provider onboarding stall check across all active tenants.
 * Classifies stalled/dropped onboarding drafts and optionally sends SMS nudges.
 * Runs hourly via Vercel cron.
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { verifyCronRequest } from "@/lib/cron-auth";

export async function GET(request: NextRequest) {
  try {
    const auth = verifyCronRequest(request);
    if (!auth.valid) {
      return new Response(auth.error || "Unauthorized", { status: 401 });
    }

    const supabase = getSupabaseAdmin();

    // Get all active tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from("tenants")
      .select("id")
      .eq("is_active", true);

    if (tenantErr) {
      console.error("provider-stall-check: failed to fetch tenants", tenantErr);
      throw tenantErr;
    }

    if (!tenants?.length) {
      return successResponse({ message: "No active tenants", processed: 0 });
    }

    const secret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || "";
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const results: Array<{ tenant_id: string; stalled: number; dropped: number; on_track: number; sms_sent: number }> = [];
    const errors: string[] = [];

    for (const tenant of tenants) {
      try {
        const res = await fetch(
          `${baseUrl}/api/admin/provider-ops/run-stall-check?tenant_id=${tenant.id}`,
          {
            method: "POST",
            headers: {
              "x-cron-secret": secret,
              "Content-Type": "application/json",
            },
          }
        );

        if (res.ok) {
          const json = await res.json();
          const data = json?.data ?? json;
          results.push({
            tenant_id: tenant.id,
            stalled: data?.stalled ?? 0,
            dropped: data?.dropped ?? 0,
            on_track: data?.on_track ?? 0,
            sms_sent: data?.sms_sent ?? 0,
          });
        } else {
          const errText = await res.text().catch(() => "unknown");
          errors.push(`tenant ${tenant.id}: ${res.status} ${errText}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`tenant ${tenant.id}: ${msg}`);
      }
    }

    return successResponse({
      message: "Provider stall check completed",
      tenants_processed: results.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return handleApiError(error, "Cron: provider-stall-check failed");
  }
}
