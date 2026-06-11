import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection, errorResponse, successResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchProviderInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { validateAdminPayoutReadiness } from "@/lib/admin/validate-provider-payout-readiness";
import { extractRequestMeta, writeAuditLog } from "@/lib/audit/audit";

const bodySchema = z.object({
  payout_ids: z.array(z.string().uuid()).min(1).max(200),
  run_label: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  dry_run: z.boolean().optional(),
});

type PayoutRow = {
  id: string;
  status: string;
  provider_id: string;
  amount: number;
  currency?: string | null;
  payout_account_details?: { bank_account_id?: string | null } | null;
};

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const admin = getSupabaseAdmin();
    if (!admin) return errorResponse("Admin client unavailable", "SERVER_ERROR", 500);

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return errorResponse("Invalid bulk approve payload", "VALIDATION_ERROR", 400);

    const tenantId = await resolveAdminApiTenantId(request);
    const { payout_ids, run_label, notes, dry_run } = parsed.data;
    const requestMeta = extractRequestMeta(request);
    const uniqueIds = [...new Set(payout_ids)];
    const runId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `run-${Date.now()}`;

    const { data: rows, error } = await admin
      .from("payouts")
      .select("id, status, provider_id, amount, currency, payout_account_details")
      .in("id", uniqueIds);
    if (error) throw error;

    const byId = new Map((rows || []).map((r: PayoutRow) => [r.id, r]));
    const approved: string[] = [];
    const skipped: Array<{ id: string; reason: string; code?: string }> = [];

    for (const id of uniqueIds) {
      const payout = byId.get(id);
      if (!payout) {
        skipped.push({ id, reason: "Payout not found", code: "NOT_FOUND" });
        continue;
      }

      const providerCheck = await fetchProviderInAdminTenant(admin, payout.provider_id, tenantId, "id");
      if ("error" in providerCheck) {
        skipped.push({ id, reason: "Payout belongs to another market", code: "TENANT_MISMATCH" });
        continue;
      }
      if (payout.status !== "pending") {
        skipped.push({ id, reason: `Payout is ${payout.status}, not pending`, code: "INVALID_STATE" });
        continue;
      }

      const readiness = await validateAdminPayoutReadiness({
        supabase: admin,
        providerId: payout.provider_id,
        tenantId,
        requestedAccountId: payout.payout_account_details?.bank_account_id ?? null,
        requireAccount: true,
      });
      if (readiness.ok === false) {
        skipped.push({ id, reason: readiness.message, code: readiness.code });
        continue;
      }

      if (dry_run) {
        approved.push(id);
        continue;
      }

      const { data: updatedPayout, error: updateError } = await admin
        .from("payouts")
        .update({
          status: "processing",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          admin_notes: [notes, run_label ? `Bulk run: ${run_label}` : null, `Run ID: ${runId}`]
            .filter(Boolean)
            .join("\n"),
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("id, status, provider_id, amount, currency, approved_by, approved_at, admin_notes")
        .maybeSingle();
      if (updateError || !updatedPayout) {
        skipped.push({
          id,
          reason: updateError?.message ?? "Payout was no longer pending",
          code: updateError?.code ?? "STATE_CHANGED",
        });
        continue;
      }
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role ?? "superadmin",
        action: "admin.payout.bulk_approve.item",
        entity_type: "payout",
        entity_id: id,
        module: "finance",
        risk_level: "high",
        retention_tier: "financial",
        before_json: payout,
        after_json: updatedPayout as Record<string, unknown>,
        ip_address: requestMeta.ip_address,
        user_agent: requestMeta.user_agent,
        metadata: {
          run_id: runId,
          run_label: run_label || null,
          provider_id: payout.provider_id,
          amount: payout.amount,
          currency: payout.currency,
        },
      });

      try {
        const { sendToUser } = await import("@/lib/notifications/onesignal");
        const { formatCurrency } = await import("@/lib/utils");
        const { LAST_RESORT_CURRENCY } = await import("@/lib/regions/last-resort-currency");
        const { data: providerRow } = await admin
          .from("providers")
          .select("user_id")
          .eq("id", payout.provider_id)
          .single();
        const providerUserId = (providerRow as { user_id?: string } | null)?.user_id;
        if (providerUserId) {
          const payoutCurrency = payout.currency?.trim() || LAST_RESORT_CURRENCY;
          const amountFormatted = formatCurrency(Number(payout.amount), payoutCurrency);
          await sendToUser(
            providerUserId,
            {
              title: "Payout Approved",
              message: `Your payout request of ${amountFormatted} has been approved and is being processed.`,
              data: { type: "payout_approved", payout_id: id },
              url: "/provider/finance",
            },
            ["push"],
            { appType: "provider" },
          );
          await admin.from("notifications").insert({
            user_id: providerUserId,
            type: "system",
            title: "Payout Approved",
            message: `Your payout request of ${amountFormatted} has been approved and is being processed.`,
            data: { payout_id: id, amount: payout.amount },
            action_url: "/provider/payouts",
          });
        }
      } catch (notifError) {
        console.error("Error sending bulk-approve notification:", notifError);
      }

      approved.push(id);
    }

    if (!dry_run && approved.length > 0) {
      await writeAuditLog({
        actor_user_id: user.id,
        actor_role: user.role ?? "superadmin",
        action: "admin.payout.bulk_approve",
        entity_type: "payout_run",
        entity_id: runId,
        metadata: {
          run_id: runId,
          run_label: run_label || null,
          notes: notes || null,
          approved_count: approved.length,
          skipped_count: skipped.length,
          payout_ids: approved,
          skipped,
        },
        module: "finance",
        risk_level: "high",
        retention_tier: "financial",
        ip_address: requestMeta.ip_address,
        user_agent: requestMeta.user_agent,
      });
    }

    return successResponse({
      run_id: runId,
      dry_run: Boolean(dry_run),
      approved_count: approved.length,
      skipped_count: skipped.length,
      approved_ids: approved,
      skipped,
    });
  } catch (error) {
    console.error("Error bulk approving payouts:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to bulk approve payouts",
      "INTERNAL_ERROR",
      500,
    );
  }
}
