import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PublicHoldRedirectInfo = {
  holdId: string;
  providerId: string;
  providerSlug: string;
  holdStatus: string;
  expiresAt: string;
};

/**
 * Minimal hold lookup for server redirects (/book/continue → /booking).
 * Does not increment counters or apply full checkout enrichment.
 */
export async function getPublicHoldRedirectInfo(
  holdId: string,
  tenantId: string,
): Promise<PublicHoldRedirectInfo | null> {
  if (!holdId?.trim()) return null;
  const supabase = getSupabaseAdmin();
  const { data: hold, error } = await supabase
    .from("booking_holds")
    .select(
      "id, provider_id, hold_status, expires_at, providers!inner(slug, tenant_id)",
    )
    .eq("id", holdId)
    .eq("providers.tenant_id", tenantId)
    .maybeSingle();

  if (error || !hold) return null;

  const providers = hold.providers as { slug?: string } | { slug?: string }[] | null;
  const slug = Array.isArray(providers)
    ? providers[0]?.slug
    : providers?.slug;
  if (!slug) return null;

  if (hold.hold_status !== "active" && hold.hold_status !== "consuming") {
    return null;
  }

  const expiresAt = new Date(hold.expires_at);
  if (expiresAt < new Date()) {
    return null;
  }

  return {
    holdId: hold.id,
    providerId: hold.provider_id,
    providerSlug: slug,
    holdStatus: hold.hold_status,
    expiresAt: hold.expires_at,
  };
}
