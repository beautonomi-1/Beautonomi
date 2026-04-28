import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveTenantIdWithZaFallback } from "@/lib/tenant/resolve-tenant-from-db";
import { successResponse, notFoundResponse, errorResponse, handleApiError } from "@/lib/supabase/api-helpers";
import { sanitizeExpressPrefill } from "@/lib/express-booking/prefill";

const EXPRESS_LINK_SELECT =
  "id, provider_id, name, slug, service_ids, staff_ids, location_id, location_type, is_active, expires_at, max_uses, use_count, prefill, created_at, updated_at";

type ExpressBookingLinkRow = {
  id: string;
  provider_id: string;
  name: string;
  slug: string;
  service_ids?: string[] | null;
  staff_ids?: string[] | null;
  location_id?: string | null;
  location_type?: string | null;
  is_active?: boolean | null;
  expires_at?: string | null;
  max_uses?: number | null;
  use_count?: number | null;
  prefill?: unknown;
};

function isUsableLink(link: ExpressBookingLinkRow): boolean {
  if (link.is_active === false) return false;
  if (link.expires_at) {
    const expiresAt = new Date(link.expires_at);
    if (Number.isFinite(expiresAt.getTime()) && expiresAt < new Date()) return false;
  }
  if (link.max_uses != null && (link.use_count ?? 0) >= link.max_uses) return false;
  return true;
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
}

/** Fallback when `providers.slug` is blank — matches booking slug expectations; UUID fallback resolves via public provider API. */
function derivePublicProviderSlug(
  rawSlug: string | null | undefined,
  businessName: string | null | undefined,
  providerId: string,
): string {
  const trimmed = typeof rawSlug === "string" ? rawSlug.trim() : "";
  if (trimmed) return trimmed;
  const name = typeof businessName === "string" ? businessName.trim() : "";
  if (name) {
    const slugified = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96);
    if (slugified) return slugified;
  }
  return providerId;
}

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
    const slug = normalizeSlug(rawSlug || "");
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
      .select(EXPRESS_LINK_SELECT)
      .ilike("slug", slug)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (tenantProviderIds.length > 0) {
      linkQuery.in("provider_id", tenantProviderIds);
    }

    let link: ExpressBookingLinkRow | null = null;
    if (tenantProviderIds.length > 0) {
      const { data: tenantScopedLinks, error: linkError } = await linkQuery;
      if (!linkError) {
        link = ((tenantScopedLinks ?? []) as ExpressBookingLinkRow[]).find(isUsableLink) ?? null;
      }
    }

    // Tenant host mapping can be temporarily missing/misaligned in some environments.
    // Fallback to the newest globally usable candidate so legacy duplicate short
    // codes do not make every matching link 404. New active links are still
    // guarded against global duplicates at creation time.
    if (!link) {
      const { data: fallbackLinks, error: fallbackErr } = await supabase
        .from("express_booking_links")
        .select(EXPRESS_LINK_SELECT)
        .ilike("slug", slug)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
      if (fallbackErr || !fallbackLinks?.length) {
        return notFoundResponse("Booking link not found");
      }
      link = ((fallbackLinks ?? []) as ExpressBookingLinkRow[]).find(isUsableLink) ?? null;
    }

    // Last-resort normalised scan for legacy data where the stored slug contains
    // spaces, uppercase, or punctuation. Slugs are short codes, so this remains cheap.
    if (!link) {
      const { data: looseLinks, error: looseErr } = await supabase
        .from("express_booking_links")
        .select(EXPRESS_LINK_SELECT)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!looseErr && looseLinks?.length) {
        link =
          ((looseLinks ?? []) as ExpressBookingLinkRow[]).find(
            (candidate) => normalizeSlug(candidate.slug || "") === slug && isUsableLink(candidate),
          ) ?? null;
      }
    }

    if (!link) {
      return notFoundResponse("Booking link not found or unavailable");
    }

    if (link.expires_at) {
      const expiresAt = new Date(link.expires_at);
      if (Number.isFinite(expiresAt.getTime()) && expiresAt < new Date()) {
      return notFoundResponse("This booking link has expired");
      }
    }

    if (link.max_uses != null && (link.use_count ?? 0) >= link.max_uses) {
      return notFoundResponse("This booking link has reached its usage limit");
    }

    // `providers` uses `status` (e.g. active/draft), not `is_active` — selecting a non-existent column
    // caused provider lookups to fail and surfaced as NOT_FOUND for every express link.
    const { data: provider, error: providerError } = await supabase
      .from("providers")
      .select("id, slug, business_name, status")
      .eq("id", link.provider_id)
      .maybeSingle();

    if (providerError || !provider) {
      console.error("[express-link] provider lookup failed", providerError, link.provider_id);
      return notFoundResponse("Provider not found");
    }

    // Align with GET /api/public/providers/[slug]: only listed/active businesses book.
    if (provider.status !== "active") {
      return notFoundResponse("Provider not available");
    }

    const providerSlug = derivePublicProviderSlug(
      provider.slug as string | null | undefined,
      provider.business_name as string | null | undefined,
      provider.id as string,
    );

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
      provider_slug: providerSlug,
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
