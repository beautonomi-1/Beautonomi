import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRole, unauthorizedResponse } from "@/lib/auth/requireRole";
import { arrayToCSV, generateCSVFilename } from "@/lib/utils/csv";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/admin/export/providers
 * 
 * Export providers as CSV (rate limited)
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRole(["superadmin"]);
    if (!auth) {
      return unauthorizedResponse("Authentication required");
    }

    const { allowed, retryAfter } = checkRateLimit(auth.user.id, "export:providers");
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

    const supabase = await getSupabaseServer();
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
      `);

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

    // Transform data for CSV
    const csvData = (providers || []).map((provider: any) => ({
      "Provider ID": provider.id,
      "Business Name": provider.business_name,
      "Status": provider.status,
      "Is Verified": provider.is_verified ? "Yes" : "No",
      "Created At": provider.created_at,
      "Owner ID": provider.owner?.id || "",
      "Owner Email": provider.owner?.email || "",
      "Owner Name": provider.owner?.full_name || "",
    }));

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

