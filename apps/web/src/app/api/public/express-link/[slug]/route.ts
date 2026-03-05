import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { successResponse, notFoundResponse, handleApiError } from "@/lib/supabase/api-helpers";

/**
 * GET /api/public/express-link/[slug]
 *
 * Resolve an express booking link slug to provider and optional pre-selections.
 * Used by /book/l/[linkSlug] to redirect to the main book flow.
 * Increments use_count when the link is valid.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const supabase = await getSupabaseServer();
    const { slug: rawSlug } = await params;
    const slug = (rawSlug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) {
      return notFoundResponse("Invalid link");
    }

    const { data: link, error: linkError } = await supabase
      .from("express_booking_links")
      .select("id, provider_id, name, slug, service_ids, staff_ids, is_active, expires_at, max_uses, use_count")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (linkError || !link) {
      return notFoundResponse("Booking link not found");
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return notFoundResponse("This booking link has expired");
    }

    if (link.max_uses != null && (link.use_count ?? 0) >= link.max_uses) {
      return notFoundResponse("This booking link has reached its usage limit");
    }

    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, slug, business_name, is_active")
      .eq("id", link.provider_id)
      .single();

    if (providerError || !provider?.slug || provider.is_active === false) {
      return notFoundResponse("Provider not found");
    }

    // Increment use_count (best-effort; don't fail the request if this fails)
    await supabase
      .from("express_booking_links")
      .update({
        use_count: (link.use_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    return successResponse({
      provider_slug: provider.slug,
      provider_id: provider.id,
      provider_name: provider.business_name,
      link_name: link.name,
      service_ids: link.service_ids ?? [],
      staff_ids: link.staff_ids ?? [],
    });
  } catch (error) {
    return handleApiError(error, "Failed to resolve booking link");
  }
}
