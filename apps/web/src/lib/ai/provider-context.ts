/**
 * Build a compact provider context capsule for AI (RAG-lite).
 * Server-only; never include other providers' data.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const CAPSULE_MAX_CHARS = 4000;

export interface ProviderContextCapsule {
  provider_id: string;
  name: string;
  description: string | null;
  status: string;
  categories: string[];
  locations: Array<{ city?: string; area?: string }>;
  offerings: Array<{ name: string; duration?: number; price?: number }>;
  policies: { cancellation?: string; housecall_radius_km?: number };
  stats: { total_bookings?: number; rating?: number };
  tone?: string;
}

/**
 * Build context capsule for a provider (<= ~2–4KB). Safe for system prompt.
 */
export async function getProviderContext(providerId: string): Promise<ProviderContextCapsule | null> {
  const supabase = getSupabaseAdmin();

  const [providerRes, locationsRes, servicesRes] = await Promise.all([
    supabase.from("providers").select("id, business_name, description, status").eq("id", providerId).maybeSingle(),
    supabase.from("provider_locations").select("city, address, area").eq("provider_id", providerId).limit(5),
    supabase.from("services").select("name, duration_minutes, price").eq("provider_id", providerId).limit(20),
  ]);

  const provider = providerRes.data as { id: string; business_name: string; description: string | null; status: string } | null;
  if (!provider) return null;

  const locations = (locationsRes.data ?? []) as Array<{ city?: string; address?: string; area?: string }>;
  const services = (servicesRes.data ?? []) as Array<{ name: string; duration_minutes?: number; price?: number }>;

  const capsule: ProviderContextCapsule = {
    provider_id: providerId,
    name: provider.business_name,
    description: provider.description,
    status: provider.status,
    categories: [],
    locations: locations.map((l) => ({ city: l.city, area: l.area ?? l.address ?? undefined })),
    offerings: services.map((s) => ({ name: s.name, duration: s.duration_minutes, price: s.price })),
    policies: {},
    stats: {},
  };

  const json = JSON.stringify(capsule);
  if (json.length > CAPSULE_MAX_CHARS) {
    capsule.description = capsule.description?.slice(0, 200) ?? null;
    capsule.offerings = capsule.offerings.slice(0, 10);
  }

  return capsule;
}

/**
 * Serialize capsule for inclusion in system prompt.
 */
export function formatCapsuleForPrompt(capsule: ProviderContextCapsule): string {
  return `Provider context (use for personalization only):\n${JSON.stringify(capsule, null, 0).slice(0, CAPSULE_MAX_CHARS)}`;
}
