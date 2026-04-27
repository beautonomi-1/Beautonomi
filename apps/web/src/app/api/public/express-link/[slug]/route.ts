import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { successResponse, notFoundResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { sanitizeExpressPrefill } from "@/lib/express-booking/prefill";

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
    const supabase = getSupabaseAdmin();
    let tenantId: string;
    try {
      tenantId = await resolveTenantIdWithZaFallback(request);
    } catch (tenantErr) {
      console.error("Tenant resolution failed in /api/public/express-link/[slug]:", tenantErr);
      return errorResponse("Tenant not configured", "TENANT_UNAVAILABLE", 503);
    }
    const { slug: rawSlug } = await params;
    const slug = (rawSlug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) {
      return notFoundResponse("Invalid link");
    }

    // Scope the slug lookup to providers that belong to the resolved tenant,
    // preventing cross-tenant slug collision when the same slug exists for
    // providers in different tenants.
    const { data: tenantProviders } = await supabase
      .from("providers")
      .select("id")
      .eq("tenant_id", tenantId);

    const tenantProviderIds = (tenantProviders ?? []).map((p: { id: string }) => p.id);

    const linkQuery = supabase
      .from("express_booking_links")
      .select("id, provider_id, name, slug, service_ids, staff_ids, location_id, location_type, is_active, expires_at, max_uses, use_count, prefill")
      .eq("slug", slug)
      .eq("is_active", true);

    if (tenantProviderIds.length > 0) {
      linkQuery.in("provider_id", tenantProviderIds);
    } else {
      // No providers in this tenant — cannot safely resolve without scoping; fail fast.
      return notFoundResponse("Booking link not found");
    }

    const { data: tenantScopedLink, error: linkError } = await linkQuery.maybeSingle();
    if (linkError) {
      return notFoundResponse("Booking link not found");
    }
    let link = tenantScopedLink;

    // Tenant host mapping can be temporarily missing/misaligned in some environments.
    // Fallback to a global slug lookup only when exactly one active candidate exists.
    if (!link) {
      const { data: fallbackLinks, error: fallbackErr } = await supabase
        .from("express_booking_links")
        .select("id, provider_id, name, slug, service_ids, staff_ids, location_id, location_type, is_active, expires_at, max_uses, use_count, prefill")
        .eq("slug", slug)
        .eq("is_active", true)
        .limit(2);
      if (fallbackErr || !fallbackLinks?.length) {
        return notFoundResponse("Booking link not found");
      }
      if (fallbackLinks.length > 1) {
        return notFoundResponse("Booking link not found");
      }
      link = fallbackLinks[0];
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

    const prefill = sanitizeExpressPrefill((link as { prefill?: unknown }).prefill);

    return successResponse({
      provider_slug: provider.slug,
      provider_id: provider.id,
      provider_name: provider.business_name,
      link_name: link.name,
      service_ids: link.service_ids ?? [],
      staff_ids: link.staff_ids ?? [],
      location_id: link.location_id ?? null,
      location_type: link.location_type ?? null,
      prefill,
    });
  } catch (error) {
    return handleApiError(error, "Failed to resolve booking link");
  }
}
