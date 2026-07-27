/**
 * Batch-resolve booking numbers, client names, and payment methods for provider
 * ledger UI rows. Mirrors the enrichment in GET /api/provider/finance/export.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProviderLedgerRowEnrichment = {
  client_name: string | null;
  payment_method: string | null;
  reference: string | null;
};

type LedgerRowInput = {
  id: string;
  booking_id?: string | null;
  source_payment_id?: string | null;
};

export async function enrichProviderLedgerRowsForUi(
  db: SupabaseClient,
  providerId: string,
  rows: LedgerRowInput[],
): Promise<Map<string, ProviderLedgerRowEnrichment>> {
  const out = new Map<string, ProviderLedgerRowEnrichment>();
  if (rows.length === 0) return out;

  const bookingIds = [...new Set(rows.map((r) => r.booking_id).filter(Boolean))] as string[];
  const sourcePaymentIds = [...new Set(rows.map((r) => r.source_payment_id).filter(Boolean))] as string[];

  const bookingNumberMap = new Map<string, string>();
  const bookingCustomerIdMap = new Map<string, string | null>();
  const bookingGuestNameMap = new Map<string, string | null>();
  const customerIds = new Set<string>();

  if (bookingIds.length > 0) {
    for (let i = 0; i < bookingIds.length; i += 200) {
      const slice = bookingIds.slice(i, i + 200);
      const { data: bookings } = await db
        .from("bookings")
        .select("id, booking_number, customer_id, guest_name")
        .eq("provider_id", providerId)
        .in("id", slice);
      for (const b of (bookings ?? []) as Array<{
        id: string;
        booking_number?: string | null;
        customer_id?: string | null;
        guest_name?: string | null;
      }>) {
        if (b.booking_number) bookingNumberMap.set(b.id, b.booking_number);
        bookingCustomerIdMap.set(b.id, b.customer_id ?? null);
        bookingGuestNameMap.set(b.id, b.guest_name ?? null);
        if (b.customer_id) customerIds.add(b.customer_id);
      }
    }
  }

  const customerNameMap = new Map<string, string>();
  if (customerIds.size > 0) {
    const ids = [...customerIds];
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200);
      const { data: users } = await db.from("users").select("id, full_name").in("id", slice);
      for (const u of (users ?? []) as Array<{ id: string; full_name?: string | null }>) {
        if (u.full_name) customerNameMap.set(u.id, String(u.full_name));
      }
    }
  }

  const paymentMethodMap = new Map<string, string>();
  if (sourcePaymentIds.length > 0) {
    for (let i = 0; i < sourcePaymentIds.length; i += 200) {
      const slice = sourcePaymentIds.slice(i, i + 200);
      const { data: payments } = await db
        .from("booking_payments")
        .select("id, payment_method, payment_provider")
        .in("id", slice);
      for (const p of (payments ?? []) as Array<{
        id: string;
        payment_method?: string | null;
        payment_provider?: string | null;
      }>) {
        const method = p.payment_provider || p.payment_method || null;
        if (method) paymentMethodMap.set(p.id, method);
      }
    }
  }

  for (const row of rows) {
    const bookingId = row.booking_id ?? null;
    const customerId = bookingId ? bookingCustomerIdMap.get(bookingId) : null;
    const guestName = bookingId ? bookingGuestNameMap.get(bookingId) : null;
    const client_name =
      (customerId && customerNameMap.get(customerId)) || guestName || null;
    const reference = bookingId ? bookingNumberMap.get(bookingId) ?? bookingId : null;
    const payment_method = row.source_payment_id
      ? paymentMethodMap.get(row.source_payment_id) ?? null
      : null;
    out.set(String(row.id), { client_name, payment_method, reference });
  }

  return out;
}
