import { NextRequest } from "next/server";
import {
  requireAdminSection,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { writeAuditLog, extractRequestMeta } from "@/lib/audit/audit";
import { ledgerRepairProposalSchema } from "@/lib/finance/ledger-repair";

/**
 * POST /api/admin/finance/ledger-repair/propose
 * admin_finance or superadmin. Body: { kind, payload, note? } (see ledgerRepairProposalSchema).
 * Creates a `proposed` row; a different superadmin must approve before anything posts.
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const parsed = ledgerRepairProposalSchema.safeParse(await request.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return errorResponse(
        first ? `${first.path.join(".")}: ${first.message}` : "Invalid proposal",
        "VALIDATION_ERROR",
        400,
        { issues: parsed.error.issues },
      );
    }

    const { kind, payload, note } = parsed.data;

    if (kind === "missing_online_charge_ledger") {
      // Booking must exist in this tenant, and the payment (if given) must belong to it.
      const { data: booking } = await supabase
        .from("bookings")
        .select("id, tenant_id")
        .eq("id", payload.bookingId)
        .maybeSingle();
      if (!booking) return errorResponse("Booking not found", "NOT_FOUND", 404);
      const bookingTenant = (booking as { tenant_id?: string | null }).tenant_id;
      if (bookingTenant && String(bookingTenant) !== tenantId) {
        return errorResponse("Booking not in admin tenant scope", "FORBIDDEN", 403);
      }
      if (payload.bookingPaymentId) {
        const { data: bp } = await supabase
          .from("booking_payments")
          .select("id, booking_id, status")
          .eq("id", payload.bookingPaymentId)
          .maybeSingle();
        const bpRow = bp as { booking_id?: string; status?: string } | null;
        if (!bpRow || String(bpRow.booking_id) !== payload.bookingId) {
          return errorResponse("booking_payment does not belong to booking", "VALIDATION_ERROR", 400);
        }
        if (bpRow.status !== "completed") {
          return errorResponse("Only completed booking_payments can be repaired", "INVALID_STATE", 409);
        }
        const { data: open } = await supabase
          .from("ledger_repair_proposals")
          .select("id, status")
          .eq("kind", "missing_online_charge_ledger")
          .in("status", ["proposed", "approved"])
          .eq("payload->>bookingPaymentId", payload.bookingPaymentId)
          .maybeSingle();
        if (open) {
          return errorResponse(
            `An open proposal (${(open as { id: string }).id}) already exists for this payment`,
            "DUPLICATE_PROPOSAL",
            409,
          );
        }
      }
    }

    const { data: inserted, error } = await supabase
      .from("ledger_repair_proposals")
      .insert({
        tenant_id: tenantId,
        kind,
        payload,
        proposed_by: user.id,
        status: "proposed",
        note: note?.trim() || null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        return errorResponse("An open proposal already exists for this payment", "DUPLICATE_PROPOSAL", 409);
      }
      throw error;
    }

    const reqMeta = extractRequestMeta(request);
    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role,
      action: "finance.ledger_repair.propose",
      entity_type: "ledger_repair_proposal",
      entity_id: (inserted as { id: string }).id,
      module: "finance",
      risk_level: "high",
      retention_tier: "financial",
      status: "succeeded",
      metadata: { kind, payload, note: note ?? null },
      ip_address: reqMeta.ip_address,
      user_agent: reqMeta.user_agent,
    });

    return successResponse({ proposal: inserted }, 201);
  } catch (error) {
    return handleApiError(error, "Failed to create ledger repair proposal");
  }
}
