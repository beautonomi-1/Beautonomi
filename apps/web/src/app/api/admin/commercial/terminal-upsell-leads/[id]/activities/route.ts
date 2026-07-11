import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_COMMERCIAL } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminSection(ADMIN_SECTION_COMMERCIAL, request);
    const { id } = await params;
    const tenantId = await resolveAdminApiTenantId(request);
    const supabase = getSupabaseAdmin();

    const { data: lead } = await supabase
      .from("terminal_upsell_leads")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!lead) return notFoundResponse("Upsell lead not found");

    const { data, error } = await supabase
      .from("terminal_upsell_lead_activities")
      .select(
        `
        *,
        performer:users!terminal_upsell_lead_activities_performed_by_fkey(id, full_name, email)
        `,
      )
      .eq("lead_id", id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return successResponse({ activities: data ?? [] });
  } catch (error) {
    return handleApiError(error, "Failed to load upsell lead activities");
  }
}
