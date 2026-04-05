import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { sendToUser } from "@/lib/notifications/onesignal";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { fetchBookingInAdminTenant } from "@/lib/tenant/admin-booking-tenant";

const disputeSchema = z.object({
  reason: z.string().min(1, "Reason is required"),
  description: z.string().optional().nullable(),
  opened_by: z.enum(["customer", "provider"]),
});

/**
 * POST /api/admin/bookings/[id]/dispute
 * 
 * Open a dispute for a booking
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: "Database unavailable", code: "SERVER_ERROR" } },
        { status: 500 }
      );
    }
    const tenantId = await resolveAdminApiTenantId(request);
    const body = await request.json();

    // Validate request body
    const validationResult = disputeSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Validation failed",
            code: "VALIDATION_ERROR",
            details: validationResult.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
        { status: 400 }
      );
    }

    const loaded = await fetchBookingInAdminTenant(
      supabase,
      id,
      tenantId,
      "id, customer_id, provider_id, tenant_id"
    );
    if ("error" in loaded) {
      const st = loaded.error.status;
      return NextResponse.json(
        {
          data: null,
          error: {
            message: st === 403 ? "Booking belongs to another market" : "Booking not found",
            code: st === 403 ? "TENANT_MISMATCH" : "NOT_FOUND",
          },
        },
        { status: st }
      );
    }
    const booking = loaded.booking;

    // Check if dispute already exists
    const { data: existingDispute } = await supabase
      .from("booking_disputes")
      .select("id")
      .eq("booking_id", id)
      .eq("status", "open")
      .single();

    if (existingDispute) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "An open dispute already exists for this booking",
            code: "DISPUTE_EXISTS",
          },
        },
        { status: 409 }
      );
    }

    const { reason, description, opened_by } = validationResult.data;

    type BookingRow = { provider_id: string; customer_id?: string };
    type DisputeRow = { id: string };
    // Create dispute
    const { data: dispute, error } = await supabase
      .from("booking_disputes")
      .insert({
        booking_id: id,
        reason,
        description: description || null,
        opened_by,
        status: "open",
        opened_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !dispute) {
      console.error("Error creating dispute:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to create dispute",
            code: "CREATE_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // NOTE: We intentionally do NOT update bookings.status here, because the booking_status enum
    // does not include a "disputed" state in this codebase. Disputes are tracked in booking_disputes.

    await writeAuditLog({
      actor_user_id: user.id,
      actor_role: user.role ?? "superadmin",
      action: "admin.booking.dispute.open",
      entity_type: "booking_dispute",
      entity_id: (dispute as DisputeRow).id,
      metadata: { booking_id: id, reason, opened_by },
    });

    // Notify customer + provider owner (best-effort)
    try {
      const bookingData = booking as BookingRow;
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", bookingData.provider_id)
        .single();

      const payload = {
        title: "Dispute opened",
        message: "A dispute has been opened for a booking. Our team will review and follow up.",
        data: {
          type: "booking_dispute_opened",
          bookingId: id,
          disputeId: (dispute as DisputeRow).id,
        },
      };
      if (bookingData.customer_id) {
        await sendToUser(bookingData.customer_id, payload, ["push"], { appType: "customer" });
      }
      const providerUserId = (provider as { user_id?: string } | null)?.user_id;
      if (providerUserId) {
        await sendToUser(providerUserId, payload, ["push"], { appType: "provider" });
      }
    } catch (e) {
      console.warn("Failed to send dispute opened notifications:", e);
    }

    return NextResponse.json({
      data: dispute,
      error: null,
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/bookings/[id]/dispute:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to create dispute",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
