import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, getProviderIdForUser, successResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * POST /api/provider/bookings/bulk
 * 
 * Perform bulk operations on multiple bookings
 */
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);

    const supabase = await getSupabaseServer(request);
    const supabaseAdmin = await getSupabaseAdmin();
    const body = await request.json();
    const { action, booking_ids } = body;

    if (!action || !Array.isArray(booking_ids) || booking_ids.length === 0) {
      return errorResponse("action and booking_ids are required", "VALIDATION_ERROR", 400);
    }

    // Get provider ID
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) {
      return errorResponse("Provider not found", "NOT_FOUND", 404);
    }

    // Verify all bookings belong to provider
    const { data: bookings, error: checkError } = await supabaseAdmin
      .from("bookings")
      .select("id, status, version, customer_id, loyalty_points_earned, booking_number")
      .eq("provider_id", providerId)
      .in("id", booking_ids);

    if (checkError || !bookings || bookings.length !== booking_ids.length) {
      return errorResponse("Some bookings not found or don't belong to provider", "NOT_FOUND", 404);
    }

    // Determine new status based on action
    const statusMap: Record<string, string> = {
      confirm: "confirmed",
      cancel: "cancelled",
      complete: "completed",
      no_show: "no_show",
      delete: "deleted",
    };

    const newStatus = statusMap[action.toLowerCase()];
    if (!newStatus && action.toLowerCase() !== "delete") {
      return errorResponse(`Invalid action: ${action}`, "VALIDATION_ERROR", 400);
    }

    const results = {
      success: [] as string[],
      failed: [] as Array<{ id: string; reason: string }>,
    };

    // Process each booking
    for (const booking of bookings) {
      try {
        if (action.toLowerCase() === "delete") {
          // Soft delete by updating status
          const { error: deleteError } = await supabaseAdmin
            .from("bookings")
            .update({
              status: "cancelled",
              cancelled_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", booking.id);

          if (deleteError) {
            results.failed.push({ id: booking.id, reason: deleteError.message });
            continue;
          }
        } else {
          // Update status
          const updateData: any = {
            status: newStatus,
            updated_at: new Date().toISOString(),
          };

          if (newStatus === "completed") {
            updateData.completed_at = new Date().toISOString();
          } else if (newStatus === "cancelled") {
            updateData.cancelled_at = new Date().toISOString();
          }

          // Increment version
          const currentVersion = (booking as any).version || 0;
          updateData.version = currentVersion + 1;

          const { error: updateError } = await supabaseAdmin
            .from("bookings")
            .update(updateData)
            .eq("id", booking.id);

          if (updateError) {
            results.failed.push({ id: booking.id, reason: updateError.message });
            continue;
          }

          // Handle loyalty points for status changes
          const customerId = (booking as any).customer_id;
          
          if (newStatus === "completed" && customerId) {
            // Award loyalty points for completed booking
            const subtotal = (booking as any).subtotal || 0;
            
            if (subtotal > 0) {
              try {
                const { calculateLoyaltyPoints } = await import("@/lib/loyalty/calculate-points");
                const { data: existingTransaction } = await supabaseAdmin
                  .from("loyalty_point_transactions")
                  .select("id")
                  .eq("reference_id", booking.id)
                  .eq("reference_type", "booking")
                  .eq("transaction_type", "earned")
                  .maybeSingle();

                if (!existingTransaction) {
                  const currency = (booking as any).currency || "ZAR";
                  const pointsEarned = await calculateLoyaltyPoints(subtotal, supabaseAdmin, currency);

                  if (pointsEarned > 0) {
                    // Create loyalty transaction for customer
                    const { error: loyaltyError } = await supabaseAdmin
                      .from("loyalty_point_transactions")
                      .insert({
                        user_id: customerId,
                        transaction_type: "earned",
                        points: pointsEarned,
                        description: `Points earned for completed booking ${(booking as any).booking_number || booking.id}`,
                        reference_id: booking.id,
                        reference_type: "booking",
                        expires_at: null,
                      });

                    if (!loyaltyError) {
                      // Update booking with loyalty_points_earned
                      await supabaseAdmin
                        .from("bookings")
                        .update({ loyalty_points_earned: pointsEarned })
                        .eq("id", booking.id);
                        
                      console.log(`Awarded ${pointsEarned} loyalty points to customer for completed booking ${booking.id}`);
                    }
                  }
                }
              } catch (loyaltyError) {
                console.error(`Failed to award loyalty points for booking ${booking.id}:`, loyaltyError);
              }
            }
          } else if (newStatus === "cancelled") {
            // Reverse loyalty points if booking was cancelled and points were earned
            const loyaltyPointsEarned = (booking as any).loyalty_points_earned || 0;
            
            if (loyaltyPointsEarned > 0 && customerId) {
              try {
                // Check if points were already earned (transaction exists)
                const { data: existingTransaction } = await supabaseAdmin
                  .from("loyalty_point_transactions")
                  .select("id, points")
                  .eq("reference_id", booking.id)
                  .eq("reference_type", "booking")
                  .eq("transaction_type", "earned")
                  .maybeSingle();

                if (existingTransaction) {
                  // Create a reversal transaction to deduct the points
                  await supabaseAdmin
                    .from("loyalty_point_transactions")
                    .insert({
                      user_id: customerId,
                      transaction_type: "redeemed",
                      points: loyaltyPointsEarned,
                      description: `Points reversed for cancelled booking ${(booking as any).booking_number || booking.id}`,
                      reference_id: booking.id,
                      reference_type: "booking",
                      expires_at: null,
                    });

                  console.log(`Reversed ${loyaltyPointsEarned} loyalty points for cancelled booking ${booking.id}`);
                }
              } catch (loyaltyError) {
                // Log but don't fail the cancellation if loyalty reversal fails
                console.error(`Failed to reverse loyalty points for booking ${booking.id}:`, loyaltyError);
              }
            }
          }
        }

        // Create audit log entry
        try {
          const { data: userData } = await supabase
            .from("users")
            .select("full_name, email")
            .eq("id", user.id)
            .single();

          await supabaseAdmin
            .from("booking_audit_log")
            .insert({
              booking_id: booking.id,
              event_type: action.toLowerCase() === "delete" ? "deleted" : "status_changed",
              event_data: {
                previous_status: (booking as any).status,
                new_status: action.toLowerCase() === "delete" ? "cancelled" : newStatus,
                field: "status",
                old_value: (booking as any).status,
                new_value: action.toLowerCase() === "delete" ? "cancelled" : newStatus,
                bulk_operation: true,
                total_affected: booking_ids.length,
              },
              created_by: user.id,
              created_by_name: userData?.full_name || userData?.email || "System",
            });
        } catch (auditError) {
          // Log but don't fail the operation
          console.error("Failed to create audit log entry:", auditError);
        }

        results.success.push(booking.id);
      } catch (error: any) {
        results.failed.push({ id: booking.id, reason: error.message || "Unknown error" });
      }
    }

    return successResponse({
      success_count: results.success.length,
      failed_count: results.failed.length,
      results,
    });
  } catch (error) {
    return handleApiError(error, "Failed to perform bulk operation");
  }
}
