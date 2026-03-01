/**
 * GET /api/public/provider-forms?provider_id=uuid
 *
 * Returns active intake/consent/waiver forms and their fields for a provider.
 * Used by express booking (/book/continue), customer app checkout, and portal.
 * No auth required (public booking flow).
 */

import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider_id");

    if (!providerId) {
      return successResponse({ forms: [] });
    }

    const supabase = getSupabaseAdmin();

    const { data: forms, error } = await supabase
      .from("provider_forms")
      .select(
        `
        id, title, description, form_type, is_required, is_active,
        fields:provider_form_fields(id, name, field_type, is_required, sort_order)
      `
      )
      .eq("provider_id", providerId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const sorted = (forms || []).map((f: { fields?: Array<{ sort_order: number }> }) => ({
      ...f,
      fields: (f.fields || []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
      ),
    }));

    return successResponse({ forms: sorted });
  } catch (error) {
    return handleApiError(error, "Failed to load provider forms");
  }
}
