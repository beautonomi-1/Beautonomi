import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getStaffPermissions, isProviderOwner } from "@/lib/auth/permissions";

/**
 * GET /api/provider/permissions
 * 
 * Get current user's permissions
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff'], request);
    const _supabase = await getSupabaseServer(request);

    // Check if user is provider owner
    const isOwner = await isProviderOwner(user.id);
    
    if (isOwner) {
      // Owner has all permissions
      return successResponse({
        isOwner: true,
        permissions: {
          view_calendar: true,
          create_appointments: true,
          edit_appointments: true,
          cancel_appointments: true,
          delete_appointments: true,
          view_sales: true,
          create_sales: true,
          process_payments: true,
          view_reports: true,
          view_services: true,
          edit_services: true,
          view_products: true,
          edit_products: true,
          view_team: true,
          manage_team: true,
          view_settings: true,
          edit_settings: true,
          view_clients: true,
          edit_clients: true,
          view_reviews: true,
          edit_reviews: true,
          view_messages: true,
          send_messages: true,
          rate_clients: true,
          view_client_ratings: true,
        }
      });
    }

    // Get staff permissions
    const permissions = await getStaffPermissions(user.id);
    
    return successResponse({
      isOwner: false,
      permissions
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch permissions");
  }
}
