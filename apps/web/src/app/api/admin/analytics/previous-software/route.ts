import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";

/**
 * GET /api/admin/analytics/previous-software
 * 
 * Get analytics on previous salon software used by providers
 * Superadmin only - provides competitor analysis data
 */
export async function GET(_request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"]);
    const supabase = await getSupabaseServer();
    if (!supabase) {
      return handleApiError(new Error("Server error"), "Database connection failed");
    }

    // Get all providers with previous software data
    const { data: providers, error } = await supabase
      .from("providers")
      .select("id, business_name, previous_software, previous_software_other, created_at, status")
      .not("previous_software", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    // Aggregate data
    const softwareCounts: Record<string, number> = {};
    const softwareDetails: Record<string, any[]> = {};
    const totalWithSoftware = providers?.length || 0;

    (providers as any[])?.forEach((provider: any) => {
      const software = provider.previous_software === "other" 
        ? provider.previous_software_other || "Other"
        : provider.previous_software;
      
      if (!softwareCounts[software]) {
        softwareCounts[software] = 0;
        softwareDetails[software] = [];
      }
      
      softwareCounts[software]++;
      softwareDetails[software].push({
        id: provider.id,
        business_name: provider.business_name,
        created_at: provider.created_at,
        status: provider.status,
        custom_name: provider.previous_software === "other" ? provider.previous_software_other : null,
      });
    });

    // Get total providers for percentage calculation
    const { count: totalProviders } = await supabase
      .from("providers")
      .select("*", { count: "exact", head: true });

    // Sort by count (descending)
    const sortedSoftware = Object.entries(softwareCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalProviders ? ((count / totalProviders) * 100).toFixed(1) : "0",
        providers: softwareDetails[name],
      }))
      .sort((a, b) => b.count - a.count);

    return successResponse({
      summary: {
        total_providers: totalProviders || 0,
        providers_with_previous_software: totalWithSoftware,
        providers_without_previous_software: (totalProviders || 0) - totalWithSoftware,
        response_rate: totalProviders 
          ? ((totalWithSoftware / totalProviders) * 100).toFixed(1) 
          : "0",
      },
      by_software: sortedSoftware,
      raw_data: providers,
    });
  } catch (error) {
    return handleApiError(error, "Failed to fetch previous software analytics");
  }
}
