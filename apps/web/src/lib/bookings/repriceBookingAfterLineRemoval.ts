import type { SupabaseClient } from "@supabase/supabase-js";
import { multiplyMoney, roundCurrency, subtractMoney } from "@beautonomi/utils";

/**
 * Reduce a booking's subtotal, tax and total after `booking_services` lines worth
 * `removedLineAmount` were deleted (group guest drop-off). Add-ons, products, fees,
 * tips and discounts already on the booking are left untouched; tax scales with the subtotal.
 */
export async function repriceBookingAfterLineRemoval(
  admin: SupabaseClient,
  bookingId: string,
  removedLineAmount: number,
): Promise<{ subtotal: number; taxAmount: number; totalAmount: number }> {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("subtotal, tax_amount, total_amount")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const b = booking as { subtotal?: number | null; tax_amount?: number | null; total_amount?: number | null };
  const oldSubtotal = Math.max(0, Number(b.subtotal ?? 0));
  const oldTax = Math.max(0, Number(b.tax_amount ?? 0));
  const oldTotal = Math.max(0, Number(b.total_amount ?? 0));
  const removed = Math.max(0, Math.min(roundCurrency(removedLineAmount), oldSubtotal));

  const subtotal = subtractMoney(oldSubtotal, removed);
  const taxAmount = oldSubtotal > 0 ? multiplyMoney(oldTax, subtotal / oldSubtotal) : oldTax;
  const totalAmount = Math.max(0, subtractMoney(subtractMoney(oldTotal, removed), subtractMoney(oldTax, taxAmount)));

  const { error: updateErr } = await admin
    .from("bookings")
    .update({ subtotal, tax_amount: taxAmount, total_amount: totalAmount, updated_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (updateErr) throw updateErr;

  return { subtotal, taxAmount, totalAmount };
}
