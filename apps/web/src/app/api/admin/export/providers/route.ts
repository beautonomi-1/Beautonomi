import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { unauthorizedResponse } from "@/lib/auth/requireRole";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkAdminExportRateLimit } from "@/lib/rate-limit/admin-export";
import { ADMIN_SECTION_PROVIDERS_OPERATIONS } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";

/**
 * GET /api/admin/export/providers
 * 
 * Export providers as CSV (rate limited)
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireAdminSection(ADMIN_SECTION_PROVIDERS_OPERATIONS, request);
    if (!user) {
      return unauthorizedResponse("Authentication required");
    }

    const { allowed, retryAfter } = await checkAdminExportRateLimit(user.id, "export:providers");
    if (!allowed) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            code: "RATE_LIMIT_EXCEEDED",
          },
        },
        {
          status: 429,
          headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
        }
      );
    }

    const supabase = await getSupabaseServer(request);
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const verified = searchParams.get("verified");

    let query = supabase
      .from("providers")
      .select(`
        id,
        business_name,
        status,
        is_verified,
        created_at,
        owner:users!providers_user_id_fkey(id, email, full_name)
      `)
      .eq("tenant_id", tenantId);

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (verified !== null) {
      query = query.eq("is_verified", verified === "true");
    }

    const { data: providers, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching providers:", error);
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Failed to fetch providers",
            code: "FETCH_ERROR",
          },
        },
        { status: 500 }
      );
    }

    // Transform data for CSV (Supabase returns relations as arrays)
    type ProviderRow = {
      id: string;
      business_name?: string;
      status?: string;
      is_verified?: boolean;
      created_at?: string;
      owner?: { id?: string; email?: string; full_name?: string }[] | { id?: string; email?: string; full_name?: string };
    };
    const csvData = (providers || []).map((provider: ProviderRow) => {
      const o = Array.isArray(provider.owner) ? provider.owner[0] : provider.owner;
      return {
        "Provider ID": provider.id,
        "Business Name": provider.business_name ?? "",
        "Status": provider.status ?? "",
        "Is Verified": provider.is_verified ? "Yes" : "No",
        "Created At": provider.created_at ?? "",
        "Owner ID": o?.id ?? "",
        "Owner Email": o?.email ?? "",
        "Owner Name": o?.full_name ?? "",
      };
    });

    const csv = arrayToCSV(csvData);
    const filename = generateCSVFilename("providers-export");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/admin/export/providers:", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: "Failed to export providers",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 }
    );
  }
}

