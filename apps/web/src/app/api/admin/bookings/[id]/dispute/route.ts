import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit/audit";
import { sendToUsers } from "@/lib/notifications/onesignal";

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
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { id } = await params;
    const supabase = await getSupabaseServer();
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

    // Verify booking exists
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, customer_id, provider_id")
      .eq("id", id)
      .single();

    if (!booking) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Booking not found",
            code: "NOT_FOUND",
          },
        },
        { status: 404 }
      );
    }

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

    // Create dispute
    const { data: dispute, error } = await (supabase
      .from("booking_disputes") as any)
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
      actor_user_id: auth.user.id,
      actor_role: (auth.user as any).role || "superadmin",
      action: "admin.booking.dispute.open",
      entity_type: "booking_dispute",
      entity_id: (dispute as any).id,
      metadata: { booking_id: id, reason, opened_by },
    });

    // Notify customer + provider owner (best-effort)
    try {
      const bookingData = booking as any;
      const { data: provider } = await supabase
        .from("providers")
        .select("user_id")
        .eq("id", bookingData.provider_id)
        .single();

      const recipients = [
        bookingData.customer_id,
        (provider as any)?.user_id,
      ].filter(Boolean);

      if (recipients.length > 0) {
        await sendToUsers(recipients, {
          title: "Dispute opened",
          message: "A dispute has been opened for a booking. Our team will review and follow up.",
          data: {
            type: "booking_dispute_opened",
            bookingId: id,
            disputeId: (dispute as any).id,
          },
        });
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
