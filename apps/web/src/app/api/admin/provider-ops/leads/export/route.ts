import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkRateLimit } from "@/lib/rate-limit";
import { unauthorizedResponse } from "@/lib/auth/requireRole";

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "");
}

function parseCategoryIds(searchParams: URLSearchParams): string[] {
  const raw = [
    ...searchParams.getAll("category_ids"),
    ...searchParams.getAll("category_id"),
  ];
  const seen = new Set<string>();
  for (const value of raw) {
    for (const part of value.split(",")) {
      const id = part.trim();
      if (id) seen.add(id);
    }
  }
  return [...seen];
}

/**
 * GET /api/admin/provider-ops/leads/export
 * Export leads as CSV. Supports same filters as the leads list.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { allowed, retryAfter } = checkRateLimit(user.id, "export:provider-leads");
    if (!allowed) {
      return NextResponse.json(
        { data: null, error: { message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`, code: "RATE_LIMIT_EXCEEDED" } },
        { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined }
      );
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const stage = searchParams.get("stage");
    const source = searchParams.get("source");
    const search = searchParams.get("search")?.trim();
    const country = searchParams.get("country");
    const province = searchParams.get("province")?.trim();
    const categoryIds = parseCategoryIds(searchParams);

    let categoryLeadIds: string[] | null = null;
    if (categoryIds.length > 0) {
      const { data: catRows } = await supabase
        .from("provider_lead_categories")
        .select("lead_id")
        .in("global_category_id", categoryIds);
      categoryLeadIds = [...new Set((catRows ?? []).map((r: { lead_id: string }) => r.lead_id))];
      if (categoryLeadIds.length === 0) {
        const filename = generateCSVFilename("provider-leads-export");
        return new NextResponse("", {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }
    }

    let query = supabase
      .from("provider_leads")
      .select(`
        *,
        provider_lead_categories (
          global_category_id,
          global_service_categories:global_category_id (name)
        )
      `)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (stage && stage !== "all") query = query.eq("commercial_stage", stage);
    if (source && source !== "all") query = query.eq("source", source);
    if (country) query = query.eq("country", country);
    if (categoryIds.length > 0 && categoryLeadIds) query = query.in("id", categoryLeadIds);
    if (province) {
      const safeProvince = escapeLike(province);
      query = query.or(
        `resolved_location->>province.ilike.%${safeProvince}%,resolved_location->>state.ilike.%${safeProvince}%,resolved_location->>region.ilike.%${safeProvince}%,suggested_location_text.ilike.%${safeProvince}%`
      );
    }
    if (search) {
      const safe = escapeLike(search);
      query = query.or(
        `business_name.ilike.%${safe}%,contact_person_name.ilike.%${safe}%,email.ilike.%${safe}%,phone_e164.ilike.%${safe}%`
      );
    }

    const { data: leads, error } = await query;
    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csvData = (leads || []).map((lead: any) => {
      const categories = (lead.provider_lead_categories || [])
        .map((c: { global_service_categories?: { name?: string } }) => c.global_service_categories?.name)
        .filter(Boolean)
        .join("; ");

      return {
        "ID": lead.id,
        "Business Name": lead.business_name ?? "",
        "Contact Person": lead.contact_person_name ?? "",
        "Email": lead.email ?? "",
        "Phone Country Code": lead.phone_country_code ?? "",
        "Phone National": lead.phone_national ?? "",
        "Phone E.164": lead.phone_e164 ?? "",
        "Location": lead.suggested_location_text ?? "",
        "Country": lead.country ?? "",
        "Location Confidence": lead.location_confidence ?? "",
        "Categories": categories,
        "Stage": lead.commercial_stage ?? "",
        "Source": lead.source ?? "",
        "Source Detail": lead.source_detail ?? "",
        "Description": lead.description ?? "",
        "Notes": lead.notes ?? "",
        "Tags": Array.isArray(lead.tags) ? lead.tags.join(", ") : "",
        "Assigned To": lead.assigned_to ?? "",
        "Matched Provider ID": lead.matched_provider_id ?? "",
        "Matched User ID": lead.matched_user_id ?? "",
        "Match Confidence": lead.match_confidence ?? "",
        "Lost Reason": lead.lost_reason ?? "",
        "Created At": lead.created_at ?? "",
        "Updated At": lead.updated_at ?? "",
      };
    });

    const csv = arrayToCSV(csvData);
    const filename = generateCSVFilename("provider-leads-export");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[leads/export] error:", error);
    return NextResponse.json(
      { data: null, error: { message: "Failed to export leads", code: "INTERNAL_ERROR" } },
      { status: 500 }
    );
  }
}
