import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireRoleInApi, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { z } from "zod";

/**
 * GET /api/admin/users/[id]
 * 
 * Get detailed user information
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRoleInApi(['superadmin'], request);

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    const { data: userData, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !userData) {
      return notFoundResponse("User not found");
    }

    // Get user stats based on role
    const stats: any = {};

    if ((userData as any).role === "customer") {
      const { count: bookingCount } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", id);

      // Get total spent
      const { data: bookings } = await supabase
        .from("bookings")
        .select("total_amount")
        .eq("customer_id", id)
        .in("status", ["completed", "confirmed"]);

      const totalSpent = bookings?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;

      // Get last booking date
      const { data: lastBooking } = await supabase
        .from("bookings")
        .select("scheduled_at")
        .eq("customer_id", id)
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      stats.total_bookings = bookingCount || 0;
      stats.total_spent = totalSpent;
      stats.last_booking_date = lastBooking?.scheduled_at || null;
    } else if ((userData as any).role === "provider_owner") {
      const { count: providerCount } = await supabase
        .from("providers")
        .select("*", { count: "exact", head: true })
        .eq("user_id", id);

      stats.provider_count = providerCount || 0;
    }

    return successResponse({
      ...(userData as Record<string, unknown>),
      stats,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch user");
  }
}

/**
 * PATCH /api/admin/users/[id]
 * 
 * Update user (suspend/reactivate)
 */
const updateUserSchema = z.object({
  deactivated_at: z.string().nullable().optional(),
  deactivation_reason: z.string().nullable().optional(),
  role: z.enum(["customer", "provider", "admin", "superadmin"]).optional(),
  email_notifications_enabled: z.boolean().optional(),
  sms_notifications_enabled: z.boolean().optional(),
  push_notifications_enabled: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['superadmin'], request);

    const { id } = await params;
    const body = await request.json();
    const validationResult = updateUserSchema.safeParse(body);

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

    const supabase = await getSupabaseServer(request);

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", id)
      .single();

    if (fetchError || !existingUser) {
      return notFoundResponse("User not found");
    }

    // Prevent superadmins from modifying other superadmins (except themselves)
    if (existingUser.role === "superadmin" && id !== user.id) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot modify another superadmin account",
            code: "PERMISSION_DENIED",
          },
        },
        { status: 403 }
      );
    }

    // Build update object
    const updateData: any = {};
    
    if (validationResult.data.deactivated_at !== undefined) {
      const at = validationResult.data.deactivated_at
        ? new Date(validationResult.data.deactivated_at).toISOString()
        : null;
      updateData.deactivated_at = at;
      updateData.deactivated_by = at ? 'admin' : null;
    }

    if (validationResult.data.deactivation_reason !== undefined) {
      updateData.deactivation_reason = validationResult.data.deactivation_reason;
    }
    
    if (validationResult.data.role !== undefined) {
      updateData.role = validationResult.data.role;
    }
    
    if (validationResult.data.email_notifications_enabled !== undefined) {
      updateData.email_notifications_enabled = validationResult.data.email_notifications_enabled;
    }
    
    if (validationResult.data.sms_notifications_enabled !== undefined) {
      updateData.sms_notifications_enabled = validationResult.data.sms_notifications_enabled;
    }
    
    if (validationResult.data.push_notifications_enabled !== undefined) {
      updateData.push_notifications_enabled = validationResult.data.push_notifications_enabled;
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating user:", updateError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to update user",
            code: "UPDATE_ERROR",
            details: updateError.message,
          },
        },
        { status: 500 }
      );
    }

    // If user is being deactivated, also deactivate auth user
    if (updateData.deactivated_at) {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: "876000h", // ~100 years (effectively permanent)
      });
    } else if (updateData.deactivated_at === null) {
      // If user is being reactivated, unban auth user
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: "0",
      });
    }

    return successResponse(updatedUser);
  } catch (error) {
    return handleApiError(error, "Failed to update user");
  }
}

/**
 * DELETE /api/admin/users/[id]
 * 
 * Permanently delete a user (superadmin only)
 * WARNING: This will permanently delete the user and all associated data
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireRoleInApi(['superadmin'], request);

    const { id } = await params;
    const supabase = await getSupabaseServer(request);

    // Check if user exists
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id, role, email")
      .eq("id", id)
      .single();

    if (fetchError || !existingUser) {
      return notFoundResponse("User not found");
    }

    // Prevent superadmins from deleting themselves
    if (id === user.id) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot delete your own account",
            code: "PERMISSION_DENIED",
          },
        },
        { status: 403 }
      );
    }

    // Prevent superadmins from deleting other superadmins
    if (existingUser.role === "superadmin") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Cannot delete another superadmin account",
            code: "PERMISSION_DENIED",
          },
        },
        { status: 403 }
      );
    }

    // Use admin client to delete auth user (this will cascade delete user record)
    const supabaseAdmin = getSupabaseAdmin();
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (deleteError) {
      console.error("Error deleting auth user:", deleteError);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to delete user",
            code: "DELETE_ERROR",
            details: deleteError.message,
          },
        },
        { status: 500 }
      );
    }

    return successResponse({
      id,
      deleted: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    return handleApiError(error, "Failed to delete user");
  }
}
