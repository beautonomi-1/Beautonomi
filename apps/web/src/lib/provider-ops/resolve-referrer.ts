import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/lib/provider-ops/leads-csv-import";

export interface ResolvedReferrer {
  referrer_user_id: string | null;
  referrer_provider_id: string | null;
  display_name: string | null;
}

export interface ReferrerSearchResult {
  type: "provider" | "user";
  id: string;
  user_id: string | null;
  provider_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

const REFERRER_LOOKUP_CHUNK = 200;

function referrerMapKey(kind: "email" | "phone", value: string): string {
  return `${kind}:${value}`;
}

function displayNameFromProvider(row: {
  business_name?: string | null;
  email?: string | null;
  billing_email?: string | null;
}): string {
  return (
    row.business_name?.trim() ||
    row.billing_email?.trim() ||
    row.email?.trim() ||
    "Provider"
  );
}

function displayNameFromUser(row: {
  full_name?: string | null;
  email?: string | null;
}): string {
  return row.full_name?.trim() || row.email?.trim() || "User";
}

export function referrerSourceDetailFallback(
  email?: string | null,
  phone?: string | null,
): string | null {
  const parts = [email?.trim(), phone?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatReferrerDisplayName(lead: {
  referrer_provider?: {
    business_name?: string | null;
    email?: string | null;
    billing_email?: string | null;
  } | null;
  referrer_user?: { full_name?: string | null; email?: string | null } | null;
  source_detail?: string | null;
}): string | null {
  if (lead.referrer_provider) {
    return displayNameFromProvider(lead.referrer_provider);
  }
  if (lead.referrer_user) {
    return displayNameFromUser(lead.referrer_user);
  }
  const detail = lead.source_detail?.trim();
  return detail || null;
}

export function selectionFromSearchResult(result: ReferrerSearchResult): ResolvedReferrer {
  if (result.type === "provider") {
    return {
      referrer_provider_id: result.provider_id ?? result.id,
      referrer_user_id: result.user_id,
      display_name: result.name,
    };
  }
  return {
    referrer_provider_id: result.provider_id,
    referrer_user_id: result.id,
    display_name: result.name,
  };
}

async function loadScopedUserIds(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("admin_user_ids_in_tenant_scope", {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  return new Set(
    ((data ?? []) as { id: string }[]).map((row) => row.id).filter(Boolean),
  );
}

/**
 * Batch-resolve referrer emails/phones for CSV import.
 * Keys: `email:<normalized>` and `phone:<e164>`.
 */
export async function buildReferrerLookupMaps(
  supabase: SupabaseClient,
  tenantId: string,
  emails: string[],
  phones: string[],
): Promise<Map<string, ResolvedReferrer>> {
  const map = new Map<string, ResolvedReferrer>();
  const scopedUserIds = await loadScopedUserIds(supabase, tenantId);
  const uniqueEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()).filter(Boolean))];
  const uniquePhones = [...new Set(phones.map((p) => p.trim()).filter(Boolean))];

  for (let i = 0; i < uniqueEmails.length; i += REFERRER_LOOKUP_CHUNK) {
    const chunk = uniqueEmails.slice(i, i + REFERRER_LOOKUP_CHUNK);
    const orParts = chunk.flatMap((email) => [
      `billing_email.eq.${email}`,
      `email.eq.${email}`,
    ]);
    const { data: providers, error } = await supabase
      .from("providers")
      .select("id, user_id, business_name, email, billing_email")
      .eq("tenant_id", tenantId)
      .or(orParts.join(","));
    if (error) throw error;

    for (const provider of providers || []) {
      const resolved: ResolvedReferrer = {
        referrer_provider_id: provider.id,
        referrer_user_id: provider.user_id ?? null,
        display_name: displayNameFromProvider(provider),
      };
      for (const email of [provider.billing_email, provider.email]) {
        const key = email?.toLowerCase()?.trim();
        if (key && chunk.includes(key)) {
          map.set(referrerMapKey("email", key), resolved);
        }
      }
    }

    const unresolvedEmails = chunk.filter((email) => !map.has(referrerMapKey("email", email)));
    if (unresolvedEmails.length > 0) {
      const { data: users, error: userErr } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("email", unresolvedEmails);
      if (userErr) throw userErr;

      for (const user of users || []) {
        if (!scopedUserIds.has(user.id)) continue;
        const email = user.email?.toLowerCase()?.trim();
        if (!email) continue;
        const { data: ownedProvider } = await supabase
          .from("providers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .maybeSingle();
        map.set(referrerMapKey("email", email), {
          referrer_user_id: user.id,
          referrer_provider_id: ownedProvider?.id ?? null,
          display_name: displayNameFromUser(user),
        });
      }
    }
  }

  for (let i = 0; i < uniquePhones.length; i += REFERRER_LOOKUP_CHUNK) {
    const chunk = uniquePhones.slice(i, i + REFERRER_LOOKUP_CHUNK);
    const orParts = chunk.flatMap((phone) => [
      `billing_phone.eq.${phone}`,
      `phone.eq.${phone}`,
    ]);
    const { data: providers, error } = await supabase
      .from("providers")
      .select("id, user_id, business_name, phone, billing_phone")
      .eq("tenant_id", tenantId)
      .or(orParts.join(","));
    if (error) throw error;

    for (const provider of providers || []) {
      const resolved: ResolvedReferrer = {
        referrer_provider_id: provider.id,
        referrer_user_id: provider.user_id ?? null,
        display_name: displayNameFromProvider(provider),
      };
      for (const phone of [provider.billing_phone, provider.phone]) {
        const key = phone?.trim();
        if (key && chunk.includes(key)) {
          map.set(referrerMapKey("phone", key), resolved);
        }
      }
    }

    const unresolvedPhones = chunk.filter((phone) => !map.has(referrerMapKey("phone", phone)));
    if (unresolvedPhones.length > 0) {
      const { data: users, error: userErr } = await supabase
        .from("users")
        .select("id, full_name, email, phone")
        .in("phone", unresolvedPhones);
      if (userErr) throw userErr;

      for (const user of users || []) {
        if (!scopedUserIds.has(user.id)) continue;
        const phone = user.phone?.trim();
        if (!phone) continue;
        const { data: ownedProvider } = await supabase
          .from("providers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("user_id", user.id)
          .maybeSingle();
        map.set(referrerMapKey("phone", phone), {
          referrer_user_id: user.id,
          referrer_provider_id: ownedProvider?.id ?? null,
          display_name: displayNameFromUser(user),
        });
      }
    }
  }

  return map;
}

export function resolveReferrerFromMaps(
  lookup: Map<string, ResolvedReferrer>,
  email?: string | null,
  phone?: string | null,
): ResolvedReferrer | null {
  const normalizedEmail = email?.toLowerCase()?.trim();
  if (normalizedEmail) {
    const byEmail = lookup.get(referrerMapKey("email", normalizedEmail));
    if (byEmail) return byEmail;
  }

  const rawPhone = phone?.trim();
  if (rawPhone) {
    const e164 = normalizePhone(rawPhone).phone_e164 ?? rawPhone;
    const byPhone = lookup.get(referrerMapKey("phone", e164));
    if (byPhone) return byPhone;
    if (e164 !== rawPhone) {
      const byRaw = lookup.get(referrerMapKey("phone", rawPhone));
      if (byRaw) return byRaw;
    }
  }

  return null;
}

export async function searchReferrersInTenant(
  supabase: SupabaseClient,
  tenantId: string,
  query: string,
  limit = 12,
): Promise<ReferrerSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const scopedUserIds = await loadScopedUserIds(supabase, tenantId);
  const safe = q.replace(/[%_]/g, "");
  const results: ReferrerSearchResult[] = [];
  const seen = new Set<string>();

  const { data: providers, error: providerErr } = await supabase
    .from("providers")
    .select("id, user_id, business_name, email, billing_email, phone, billing_phone")
    .eq("tenant_id", tenantId)
    .or(
      `business_name.ilike.%${safe}%,email.ilike.%${safe}%,billing_email.ilike.%${safe}%,phone.ilike.%${safe}%,billing_phone.ilike.%${safe}%`,
    )
    .limit(limit);
  if (providerErr) throw providerErr;

  for (const provider of providers || []) {
    const key = `provider:${provider.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      type: "provider",
      id: provider.id,
      user_id: provider.user_id ?? null,
      provider_id: provider.id,
      name: displayNameFromProvider(provider),
      email: provider.billing_email || provider.email || null,
      phone: provider.billing_phone || provider.phone || null,
    });
  }

  if (results.length >= limit) {
    return results.slice(0, limit);
  }

  const { data: users, error: userErr } = await supabase
    .from("users")
    .select("id, full_name, email, phone")
    .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`)
    .limit(limit * 2);
  if (userErr) throw userErr;

  for (const user of users || []) {
    if (!scopedUserIds.has(user.id)) continue;
    const key = `user:${user.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { data: ownedProvider } = await supabase
      .from("providers")
      .select("id, business_name")
      .eq("tenant_id", tenantId)
      .eq("user_id", user.id)
      .maybeSingle();

    results.push({
      type: ownedProvider ? "provider" : "user",
      id: user.id,
      user_id: user.id,
      provider_id: ownedProvider?.id ?? null,
      name: ownedProvider?.business_name?.trim() || displayNameFromUser(user),
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}
