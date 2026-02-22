import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, getProviderIdForUser, successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/provider/automations/[id]/executions
 * 
 * Get execution history for an automation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { user } = await requireRoleInApi(['provider_owner', 'provider_staff', 'superadmin'], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    
    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    // Verify automation belongs to provider
    const { data: automation } = await supabase
      .from("marketing_automations")
      .select("id")
      .eq("id", params.id)
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
      .eq("automation_id", params.id)
      .order("executed_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    return successResponse(executions || []);
  } catch (error) {
    return handleApiError(error, "Failed to fetch execution history");
  }
}
