import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError, errorResponse } from "@/lib/supabase/api-helpers";
import type { Booking } from "@/types/beautonomi";
import { awardPointsForBooking, checkProviderMilestones } from "@/lib/services/provider-gamification";

/**
 * POST /api/provider/bookings/[id]/complete-service
 * 
 * Mark service as completed.
 * Awards both provider reward points and customer loyalty points (only on completion).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const { id } = await params;

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Get booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (bookingError || !booking) {
      return notFoundResponse("Booking not found");
    }

    const bookingData = booking as any;

    // Check if service is in progress
    if (bookingData.status !== "in_progress" && bookingData.current_stage !== "service_started") {
      return errorResponse("Service must be started before completing", "INVALID_STATUS", 400);
    }

    // Create booking event
    const { error: eventError } = await supabase
      .from("booking_events")
      .insert({
        booking_id: id,
        event_type: "service_completed",
        event_data: {
          completed_at: new Date().toISOString(),
        },
        created_by: user.id,
      });

    if (eventError) {
      console.error("Error creating booking event:", eventError);
    }

    // Update booking
    const { error: updateError } = await supabase
      .from("bookings")
      .update({
        status: "completed",
        current_stage: "service_completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    // Fetch updated booking
    const { data: updatedBooking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    // Award provider reward points and customer loyalty points (non-blocking, only on completion)
    if (updatedBooking) {
      awardPointsForBooking(providerId, id).catch(err => 
        console.error('Failed to award provider points for booking:', err)
      );
      checkProviderMilestones(providerId).catch(err => 
        console.error('Failed to check milestones:', err)
      );

      // Award customer loyalty points for completed booking (using loyalty_rules)
      const customerId = (updatedBooking as any).customer_id;
      const subtotal = (updatedBooking as any).subtotal || 0;
      if (subtotal > 0 && customerId) {
        (async () => {
          try {
            const supabaseAdmin = await getSupabaseAdmin();
            const { calculateLoyaltyPoints } = await import("@/lib/loyalty/calculate-points");
            const { data: existing } = await supabaseAdmin
              .from("loyalty_point_transactions")
              .select("id")
              .eq("reference_id", id)
              .eq("reference_type", "booking")
              .eq("transaction_type", "earned")
              .maybeSingle();
            if (!existing) {
              const currency = (updatedBooking as any).currency || "ZAR";
              const pointsEarned = await calculateLoyaltyPoints(subtotal, supabaseAdmin, currency);
              if (pointsEarned > 0) {
                await supabaseAdmin.from("loyalty_point_transactions").insert({
                  user_id: customerId,
                  transaction_type: "earned",
                  points: pointsEarned,
                  description: `Points earned for completed booking ${(updatedBooking as any).booking_number || id}`,
                  reference_id: id,
                  reference_type: "booking",
                  expires_at: null,
                });
                await supabaseAdmin.from("bookings").update({ loyalty_points_earned: pointsEarned }).eq("id", id);
              }
            }
          } catch (err) {
            console.error('Failed to award customer loyalty points on completion:', err);
          }
        })();
      }
    }

    return successResponse({
      booking: updatedBooking as Booking,
      message: "Service completed successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to complete service");
  }
}
