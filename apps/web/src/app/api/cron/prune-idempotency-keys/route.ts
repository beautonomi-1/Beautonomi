/**
 * GET /api/cron/prune-idempotency-keys
 *
 * §15.4-24 (audit 2026-04) — Deletes expired rows from
 * `public.request_idempotency_keys`. Pairs with the 24h retention window
 * enforced by the default `expires_at` on insert.
 *
 * Meant to run daily.
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
    const { data, error } = await (supabase.rpc as unknown as (
      name: string,
    ) => Promise<{ data: number | null; error: { message: string } | null }>)(
      "prune_expired_idempotency_keys",
    );

    if (error) {
      // Fallback: direct DELETE with service_role. `prune_expired_idempotency_keys`
      // was added in migration 506; on envs that haven't applied it yet we
      // still want the cron to succeed.
      const nowIso = new Date().toISOString();
      const { data: rows, error: delErr } = await supabase
        .from("request_idempotency_keys")
        .delete()
        .lt("expires_at", nowIso)
        .select("id");
      if (delErr) throw delErr;
      return successResponse({
        message: "Pruned expired idempotency keys (legacy path)",
        deleted_count: rows?.length ?? 0,
        fallback: true,
      });
    }

    return successResponse({
      message: "Pruned expired idempotency keys",
      deleted_count: Number(data ?? 0),
    });
  } catch (error) {
    return handleApiError(error, "Failed to prune idempotency keys");
  }
}
