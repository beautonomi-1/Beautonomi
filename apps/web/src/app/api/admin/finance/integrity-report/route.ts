import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { requireAdminSection } from "@/lib/supabase/api-helpers";
import { ADMIN_SECTION_FINANCE } from "@/lib/admin-sections";
import { resolveAdminApiTenantId } from "@/lib/tenant/admin-request-tenant";
import {
  buildFinanceIntegrityReport,
  integrityReportToCsv,
} from "@/lib/admin/finance-integrity-report";

/**
 * GET /api/admin/finance/integrity-report
 * Read-only money-path integrity sections (parameterized RPCs + scoped queries).
 * ?format=csv exports all section rows.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminSection(ADMIN_SECTION_FINANCE, request);
    const supabase = getSupabaseAdmin();
    const tenantId = await resolveAdminApiTenantId(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const format = searchParams.get("format")?.toLowerCase() ?? "json";

    const report = await buildFinanceIntegrityReport(supabase, tenantId, limit);

    if (format === "csv") {
      const csv = integrityReportToCsv(report);
      const tenantSuffix = tenantId ? `-${tenantId.slice(0, 8)}` : "";
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="finance-integrity${tenantSuffix}.csv"`,
        },
      });
    }

    return NextResponse.json({
      data: report,
      error: null,
    });
  } catch (error) {
    console.error("[admin/finance/integrity-report]", error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Failed to build integrity report",
          code: "INTERNAL_ERROR",
        },
      },
      { status: 500 },
    );
  }
}
