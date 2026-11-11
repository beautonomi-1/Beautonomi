import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";
import { hasPermission } from "@/lib/auth/permissions";
import { redactBookingCustomerContacts } from "@/lib/provider/redact-booking-customer-contact";

/**
 * GET /api/provider/automations/[id]/executions
 * 
 * Get execution history for an automation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const permissionCheck = await requirePermission("manage_marketing", request);
    if (!permissionCheck.authorized) return permissionCheck.response!;
    const { user } = permissionCheck;
    const canViewClients =
      user.role === "superadmin" ||
      (await hasPermission(user.id, "view_clients", undefined, request));
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify automation belongs to provider
    const { data: automation } = await supabase
      .from("marketing_automations")
      .select("id")
      .eq("id", id)
      .eq("provider_id", providerId)
      .single();

    if (!automation) {
      return notFoundResponse("Automation not found");
    }

    // Get execution history
    const { data: executions, error } = await supabase
      .from("automation_executions")
      .select(`
        *,
        customer:users!automation_executions_customer_id_fkey(id, full_name, email, phone)
      `)
      .eq("automation_id", id)
      .order("executed_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    return successResponse(redactBookingCustomerContacts(executions || [], canViewClients));
  } catch (error) {
    return handleApiError(error, "Failed to fetch execution history");
  }
}
