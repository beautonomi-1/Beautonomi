import type { SupabaseClient } from "@supabase/supabase-js";

/** Pre-purge snapshot for confirmation report (captured while user/provider rows still exist). */
export type UserPurgeSnapshot = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  created_at: string | null;
  counts: {
    bookings_as_customer: number;
    product_orders_as_customer: number;
    conversations_as_customer: number;
    providers_owned: number;
    provider_staff_links: number;
    support_tickets: number;
  };
};

export type ProviderOrgPurgeSnapshot = {
  provider_id: string;
  business_name: string | null;
  slug: string | null;
  provider_email: string | null;
  owner_user_id: string | null;
  owner_email: string | null;
  tenant_id: string | null;
  stats: {
    booking_count: number;
    review_count: number;
    staff_with_login_count: number;
  };
  staff_login_user_ids: string[];
};

async function countEq(
  admin: SupabaseClient,
  table: string,
  column: string,
  userId: string,
): Promise<number> {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, userId);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Collect counts + profile for the compliance purge confirmation report.
 */
export async function collectUserPurgeSnapshot(
  admin: SupabaseClient,
  userId: string,
): Promise<UserPurgeSnapshot | null> {
  const { data: u, error } = await admin
    .from("users")
    .select("id, email, full_name, phone, role, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !u) return null;

  const [
    bookings_as_customer,
    product_orders_as_customer,
    conversations_as_customer,
    providers_owned,
    provider_staff_links,
    support_tickets,
  ] = await Promise.all([
    countEq(admin, "bookings", "customer_id", userId),
    countEq(admin, "product_orders", "customer_id", userId),
    countEq(admin, "conversations", "customer_id", userId),
    countEq(admin, "providers", "user_id", userId),
    countEq(admin, "provider_staff", "user_id", userId),
    countEq(admin, "support_tickets", "user_id", userId),
  ]);

  return {
    user_id: userId,
    email: (u as { email?: string | null }).email ?? null,
    full_name: (u as { full_name?: string | null }).full_name ?? null,
    phone: (u as { phone?: string | null }).phone ?? null,
    role: (u as { role?: string | null }).role ?? null,
    created_at: (u as { created_at?: string | null }).created_at ?? null,
    counts: {
      bookings_as_customer,
      product_orders_as_customer,
      conversations_as_customer,
      providers_owned,
      provider_staff_links,
      support_tickets,
    },
  };
}

export async function collectProviderOrgPurgeSnapshot(
  admin: SupabaseClient,
  opts: { providerId: string; tenantId: string },
): Promise<ProviderOrgPurgeSnapshot | null> {
  const { data: prov, error } = await admin
    .from("providers")
    .select("id, business_name, slug, email, user_id, tenant_id")
    .eq("id", opts.providerId)
    .eq("tenant_id", opts.tenantId)
    .maybeSingle();

  if (error || !prov) return null;

  const providerId = prov.id as string;
  const ownerId = prov.user_id as string | null;

  const { data: owner } = ownerId
    ? await admin.from("users").select("email").eq("id", ownerId).maybeSingle()
    : { data: null };

  const { data: staffRows } = await admin.from("provider_staff").select("user_id").eq("provider_id", providerId);

  const staffLoginIds = [
    ...new Set(
      (staffRows ?? [])
        .map((r: { user_id: string | null }) => r.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const { count: bookingCount } = await admin
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("provider_id", providerId);

  const { count: reviewCount } = await admin
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("provider_id", providerId);

  return {
    provider_id: providerId,
    business_name: (prov as { business_name?: string }).business_name ?? null,
    slug: (prov as { slug?: string }).slug ?? null,
    provider_email: (prov as { email?: string | null }).email ?? null,
    owner_user_id: ownerId,
    owner_email: owner ? ((owner as { email?: string | null }).email ?? null) : null,
    tenant_id: (prov as { tenant_id?: string | null }).tenant_id ?? null,
    stats: {
      booking_count: bookingCount ?? 0,
      review_count: reviewCount ?? 0,
      staff_with_login_count: staffLoginIds.length,
    },
    staff_login_user_ids: staffLoginIds,
  };
}
