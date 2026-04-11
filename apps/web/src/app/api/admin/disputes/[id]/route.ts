import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { requireAdminSection, successResponse, errorResponse, handleApiError, notFoundResponse } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { writeAuditLog } from "@/lib/audit/audit";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";
import { z } from "zod";

const updateDisputeSchema = z.object({
  status: z.enum(["open", "resolved", "closed"]).optional(),
  resolution: z.enum(["refund_full", "refund_partial", "deny"]).optional().nullable(),
  refund_amount: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * GET /api/admin/disputes/[id]
 * 
 * Get a single dispute by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);

    const { data: dispute, error } = await supabase
      .from("booking_disputes")
      .select(`
        id,
        booking_id,
        reason,
        description,
        opened_by,
        status,
        opened_at,
        resolved_at,
        resolution,
        refund_amount,
        notes,
        created_at,
        updated_at,
        booking:bookings!inner(
          id,
          booking_number,
          status,
          total_amount,
          customer_id,
          provider_id,
          tenant_id,
          customer:users!bookings_customer_id_fkey(id, full_name, email),
          provider:providers!bookings_provider_id_fkey(id, business_name)
        )
      `)
      .eq("id", id)
      .eq("booking.tenant_id", tenantId)
      .single();

    if (error || !dispute) {
      return notFoundResponse("Dispute not found");
    }

    return successResponse(dispute);
  } catch (error) {
    return handleApiError(error, "Failed to fetch dispute");
  }
}

/**
 * PATCH /api/admin/disputes/[id]
 * 
 * Update a dispute (resolve, close, add notes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const supabase = getSupabaseAdmin();
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    // Validate request body
    const validationResult = updateDisputeSchema.safeParse(body);
    if (!validationResult.success) {
      return errorResponse(
        "Validation failed",
        "VALIDATION_ERROR",
        400
      );
    }

    // Verify dispute exists
    const { data: existingDispute } = await supabase
      .from("booking_disputes")
      .select("id, booking_id, status, resolved_at")
      .eq("id", id)
      .single();

    if (!existingDispute) {
      return notFoundResponse("Dispute not found");
    }

    type DisputeRef = { booking_id: string };
    const bookingCheck = await fetchBookingInAdminTenant(
      supabase,
      (existingDispute as DisputeRef).booking_id,
      tenantId,
      "id"
    );
    if ("error" in bookingCheck) {
      return notFoundResponse("Dispute not found");
    }

    const updateData: Record<string, unknown> = {};
    if (validationResult.data.status !== undefined) {
      updateData.status = validationResult.data.status;
      if (validationResult.data.status === "resolved" && !existingDispute.resolved_at) {
        updateData.resolved_at = new Date().toISOString();
      }
    }
    if (validationResult.data.resolution !== undefined) {
      updateData.resolution = validationResult.data.resolution;
    }
    if (validationResult.data.refund_amount !== undefined) {
      updateData.refund_amount = validationResult.data.refund_amount;
    }
    if (validationResult.data.notes !== undefined) {
      updateData.notes = validationResult.data.notes;
    }

    const { data: updatedDispute, error } = await supabase
      .from("booking_disputes")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.dispute.update",
      entity_type: "booking_dispute",
      entity_id: id,
      metadata: updateData,
    });

    return successResponse(updatedDispute);
  } catch (error) {
    return handleApiError(error, "Failed to update dispute");
  }
}
