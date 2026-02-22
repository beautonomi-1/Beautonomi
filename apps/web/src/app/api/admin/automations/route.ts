import { NextRequest } from "next/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * GET /api/admin/automations
 * 
 * Get all automations across all providers (admin view)
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['superadmin']);

    const supabaseAdmin = getSupabaseAdmin();
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "all";
    const type = searchParams.get("type") || "all";

    // Build query
    let query = supabaseAdmin
      .from("marketing_automations")
      .select(`
        *,
        provider:providers!marketing_automations_provider_id_fkey(
          id,
          business_name
        )
      `)
      .eq("is_template", false)
      .order("created_at", { ascending: false })
      .limit(1000);

    // Apply filters
    if (status === "active") {
      query = query.eq("is_active", true);
    } else if (status === "inactive") {
      query = query.eq("is_active", false);
    }

    if (type !== "all") {
      // Map UI types to trigger types
      const triggerTypeMap: Record<string, string[]> = {
        reminder: ["appointment_reminder"],
        update: ["appointment_rescheduled", "appointment_no_show"],
        booking: [
          "booking_completed",
          "client_inactive",
          "new_lead",
          "package_expiring",
          "seasonal_promotion",
        ],
        milestone: [
          "client_birthday",
          "client_anniversary",
          "visit_milestone",
          "referral_received",
          "holiday",
        ],
      };

      const triggerTypes = triggerTypeMap[type] || [];
      if (triggerTypes.length > 0) {
        query = query.in("trigger_type", triggerTypes);
      }
    }

    const { data: automations, error } = await query;

    if (error) {
      throw error;
    }

    // Get execution counts and last executed dates
    const automationIds = automations?.map((a) => a.id) || [];
    const { data: executions } = await supabaseAdmin
      .from("automation_executions")
      .select("automation_id, executed_at")
      .in("automation_id", automationIds)
      .order("executed_at", { ascending: false });

    // Aggregate execution data
    const executionMap = new Map<string, { count: number; lastExecuted: string | null }>();
    executions?.forEach((exec) => {
      const existing = executionMap.get(exec.automation_id) || {
        count: 0,
        lastExecuted: null,
      };
      executionMap.set(exec.automation_id, {
        count: existing.count + 1,
        lastExecuted: existing.lastExecuted || exec.executed_at,
      });
    });

    // Format response
    const formatted = (automations || [])
      .filter((auto) => {
        if (!search) return true;
        const searchLower = search.toLowerCase();
        return (
          auto.name?.toLowerCase().includes(searchLower) ||
          (auto.provider as any)?.business_name?.toLowerCase().includes(searchLower)
        );
      })
      .map((auto) => {
        const execData = executionMap.get(auto.id) || {
          count: 0,
          lastExecuted: null,
        };
        return {
          id: auto.id,
          name: auto.name,
          provider_id: auto.provider_id,
          provider_name: (auto.provider as any)?.business_name || "Unknown",
          trigger_type: auto.trigger_type,
          action_type: auto.action_type,
          is_active: auto.is_active,
          is_template: auto.is_template,
          created_at: auto.created_at,
          execution_count: execData.count,
          last_executed_at: execData.lastExecuted,
        };
      });

    return successResponse(formatted);
  } catch (error) {
    return handleApiError(error, "Failed to fetch automations");
  }
}
