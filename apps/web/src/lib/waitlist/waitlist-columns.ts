import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Columns a signed-in session may read. Guest contact stays on the service role. */
export const WAITLIST_COLUMNS_WITHOUT_CONTACT = [
  "id",
  "provider_id",
  "customer_id",
  "customer_name",
  "service_id",
  "staff_id",
  "preferred_date",
  "preferred_time_start",
  "preferred_time_end",
  "notes",
  "status",
  "priority",
  "created_at",
  "updated_at",
  "location_id",
].join(", ");

type ContactRow = {
  id: string;
  customer_email?: string | null;
  customer_phone?: string | null;
};

/** Fill guest email and phone from the service role when the caller is allowed to use them. */
export async function mergeWaitlistContact<T extends { id: string }>(
  rows: T[],
  includeContact: boolean,
): Promise<Array<T & { customer_email?: string | null; customer_phone?: string | null }>> {
  if (!includeContact || rows.length === 0) {
    return rows as Array<T & { customer_email?: string | null; customer_phone?: string | null }>;
  }
  const ids = [...new Set(rows.map((row) => row.id).filter(Boolean))];
  if (ids.length === 0) return rows;
  const { data, error } = await getSupabaseAdmin()
    .from("waitlist_entries")
    .select("id, customer_email, customer_phone")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map(((data ?? []) as ContactRow[]).map((row) => [row.id, row]));
  return rows.map((row) => {
    const contact = byId.get(row.id);
    if (!contact) return row;
    return {
      ...row,
      customer_email: contact.customer_email ?? null,
      customer_phone: contact.customer_phone ?? null,
    };
  });
}
