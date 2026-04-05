import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/me/tax-documents
 * 
 * Get current user's tax documents by year
 */
export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(['customer', 'provider_owner', 'provider_staff', 'superadmin'], request);
    const _supabase = await getSupabaseServer(request);

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");

    // Tax documents are system-generated. Until a tax_documents table is in place,
    // return structured placeholders so the UI can display the expected year list.
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

    const documents = years.map((y) => ({
      // Stable ID so frontend list rendering has a unique key
      id: `tax-doc-${y}-annual`,
      year: y,
      type: "annual_summary",
      label: `${y} Annual Tax Summary`,
      // Primary URL field (null until document is generated)
      document_url: null,
      // Alias for mobile app which reads download_url
      download_url: null,
      issued_at: null,
      status: "not_issued" as const,
    }));

    if (year) {
      const yearInt = parseInt(year);
      const filtered = documents.filter((d) => d.year === yearInt);
      return successResponse(filtered);
    }

    return successResponse(documents);
  } catch (error) {
    return handleApiError(error, "Failed to fetch tax documents");
  }
}
