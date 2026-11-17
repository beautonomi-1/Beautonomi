import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Columns a signed-in session may read. Guest contact stays on the service role. */
export const PARTICIPANT_COLUMNS_WITHOUT_CONTACT = [
  "id",
  "booking_id",
  "group_booking_id",
  "participant_name",
  "is_primary_contact",
  "created_at",
  "updated_at",
  "service_id",
  "service_name",
  "price",
  "duration_minutes",
  "addons",
  "checked_in_at",
  "checked_out_at",
  "customer_id",
  "notes",
  "amount_due",
  "amount_paid",
  "participant_payment_status",
].join(", ");

type ContactRow = {
  id: string;
  participant_email?: string | null;
  participant_phone?: string | null;
};

/** Fill guest email and phone from the service role when the server needs them to send. */
export async function mergeParticipantContact<T extends { id?: string | null }>(
  rows: T[],
  includeContact: boolean,
): Promise<T[]> {
  if (!includeContact || rows.length === 0) return rows;
  const ids = [...new Set(rows.map((row) => row.id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return rows;
  const { data, error } = await getSupabaseAdmin()
    .from("booking_participants")
    .select("id, participant_email, participant_phone")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map(((data ?? []) as ContactRow[]).map((row) => [row.id, row]));
  return rows.map((row) => {
    if (!row.id) return row;
    const contact = byId.get(row.id);
    if (!contact) return row;
    return {
      ...row,
      participant_email: contact.participant_email ?? null,
      participant_phone: contact.participant_phone ?? null,
    };
  });
}
