import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettleCardMachinePaymentInput } from "@/lib/payments/settle-card-machine-payment";

export async function notifyTerminalCaptureOnAlreadyPaidBooking(
  supabase: SupabaseClient,
  input: SettleCardMachinePaymentInput,
  providerPaymentId: string,
  bookingId: string | null,
): Promise<void> {
  try {
    if (bookingId) {
      await supabase.from("booking_events").insert({
        booking_id: bookingId,
        event_type: "terminal_capture_on_paid_booking",
        event_data: {
          payment_provider: input.paymentProvider,
          provider_payment_id: providerPaymentId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          amount: input.amount,
        },
      });
    }
    const { notifyProviderTeamUsers } = await import("@/lib/notifications/notify-provider-team");
    await notifyProviderTeamUsers(
      input.providerId,
      {
        type: "terminal_capture_on_paid",
        title: "Card machine charge on paid booking",
        message: `A card machine charge of ${input.currency ?? "ZAR"} ${Number(input.amount ?? 0).toFixed(2)} was received for a booking that was already paid. Refund it on the machine.`,
        data: {
          entity_type: input.entityType,
          entity_id: input.entityId,
          booking_id: bookingId,
          amount: input.amount,
        },
      },
      { managersOnly: true, push: true },
    );
  } catch (err) {
    console.warn("[terminal-capture-on-paid] notify failed:", err);
  }
}
