import { requireProviderOpsSales } from "@/lib/provider-ops/ops-route-auth";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireAdminSection,
  successResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { findLeadDuplicates } from "@/lib/provider-ops/lead-dedup";

export async function GET(request: NextRequest) {
  try {
    await requireProviderOpsSales(request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const email = searchParams.get("email")?.toLowerCase()?.trim();
    const phone = searchParams.get("phone")?.trim();
    const excludeLeadId = searchParams.get("exclude_lead_id");

    if (!email && !phone) {
      return successResponse({ matches: [] });
    }

    const matches = await findLeadDuplicates(supabase, tenantId, {
      email,
      phone,
      excludeLeadId,
    });

    return successResponse({ matches });
  } catch (error) {
    return handleApiError(error, "Failed to check duplicates");
  }
}
