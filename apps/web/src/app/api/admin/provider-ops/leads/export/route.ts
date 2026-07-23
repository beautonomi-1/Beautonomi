import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_PROVIDER_OPS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import { arrayToCSV, csvWithBom, generateCSVFilename } from "@/lib/utils/csv";
import { checkAdminExportRateLimit } from "@/lib/rate-limit/admin-export";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import {
  applyAssignedToFilter,
  applyActiveLeadFilter,
  applyContactFilter,
  escapeLike,
  LEADS_EXPORT_SELECT,
  parseCategoryIds,
  parseContactFilter,
  parseDeletedFilter,
} from "@/lib/provider-ops/lead-query-filters";
import { formatReferrerDisplayName } from "@/lib/provider-ops/resolve-referrer";
import { chunkIds, fetchAllPaged } from "@/lib/provider-ops/postgrest-unbounded";

const CATEGORY_PREFILTER_PAGE_SIZE = 1000;
const ID_CHUNK_SIZE = 200;

/**
 * GET /api/admin/provider-ops/leads/export
 * Export leads as CSV. Supports same filters as the leads list.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDER_OPS, request);
    if (!user) return unauthorizedResponse("Authentication required");

    const { allowed, retryAfter } = await checkAdminExportRateLimit(user.id, "export:provider-leads");
    if (!allowed) {
      return NextResponse.json(
        { data: null, error: { message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`, code: "RATE_LIMIT_EXCEEDED" } },
        { status: 429, headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined },
      );
    }

    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const stage = searchParams.get("stage");
    const source = searchParams.get("source");
    const search = searchParams.get("search")?.trim();
    const assignedTo = searchParams.get("assigned_to");
    const country = searchParams.get("country");
    const province = searchParams.get("province")?.trim();
    const categoryIds = parseCategoryIds(searchParams);
    const deletedMode = parseDeletedFilter(searchParams);
    const contactFilter = parseContactFilter(searchParams);

    let categoryLeadIds: string[] | null = null;
    if (categoryIds.length > 0) {
      const catRows = await fetchAllPaged(async (from, to) => {
        return supabase
          .from("provider_lead_categories")
          .select("lead_id")
          .in("global_category_id", categoryIds)
          .range(from, to);
      }, CATEGORY_PREFILTER_PAGE_SIZE * 50);

      categoryLeadIds = [...new Set(catRows.map((r: { lead_id: string }) => r.lead_id))];
      if (categoryLeadIds.length === 0) {
        const filename = generateCSVFilename("provider-leads-export");
        return new NextResponse(csvWithBom(""), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }
    }

    const applyFilters = (query: any): any => {
      let q = applyActiveLeadFilter(query, deletedMode);
      if (stage && stage !== "all") q = q.eq("commercial_stage", stage);
      if (source && source !== "all") q = q.eq("source", source);
      q = applyAssignedToFilter(q, assignedTo);
      if (country) q = q.eq("country", country);
      if (province) {
        const safeProvince = escapeLike(province);
        q = q.or(
          `resolved_location->>province.ilike.%${safeProvince}%,resolved_location->>state.ilike.%${safeProvince}%,resolved_location->>region.ilike.%${safeProvince}%,suggested_location_text.ilike.%${safeProvince}%`,
        );
      }
      if (search) {
        const safe = escapeLike(search);
        q = q.or(
          `business_name.ilike.%${safe}%,contact_person_name.ilike.%${safe}%,email.ilike.%${safe}%,phone_e164.ilike.%${safe}%`,
        );
      }
      return applyContactFilter(q, contactFilter);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let leads: any[] = [];

    if (categoryLeadIds && categoryLeadIds.length > 0) {
      for (const idChunk of chunkIds(categoryLeadIds, ID_CHUNK_SIZE)) {
        const chunkLeads = await fetchAllPaged(async (from, to) => {
          let query = supabase
            .from("provider_leads")
            .select(LEADS_EXPORT_SELECT)
            .eq("tenant_id", tenantId)
            .in("id", idChunk)
            .order("created_at", { ascending: false });
          query = applyFilters(query);
          return query.range(from, to);
        });
        leads.push(...chunkLeads);
      }
      leads.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    } else {
      leads = await fetchAllPaged(async (from, to) => {
        let query = supabase
          .from("provider_leads")
          .select(LEADS_EXPORT_SELECT)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });
        query = applyFilters(query);
        return query.range(from, to);
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const csvData = leads.map((lead: any) => {
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
        "Referrer": formatReferrerDisplayName(lead) ?? "",
        "Description": lead.description ?? "",
        "Notes": lead.notes ?? "",
        "Tags": Array.isArray(lead.tags) ? lead.tags.join(", ") : "",
        "Assigned To":
          (lead.assigned_user?.full_name && String(lead.assigned_user.full_name).trim()) ||
          (lead.assigned_user?.email && String(lead.assigned_user.email).trim()) ||
          lead.assigned_to ||
          "",
        "Matched Provider ID": lead.matched_provider_id ?? "",
        "Matched User ID": lead.matched_user_id ?? "",
        "Match Confidence": lead.match_confidence ?? "",
        "Lost Reason": lead.lost_reason ?? "",
        "Created At": lead.created_at ?? "",
        "Updated At": lead.updated_at ?? "",
      };
    });

    const csv = csvWithBom(arrayToCSV(csvData));
    const filename = generateCSVFilename("provider-leads-export");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[leads/export] error:", error);
    return NextResponse.json(
      { data: null, error: { message: "Failed to export leads", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
  }
}
