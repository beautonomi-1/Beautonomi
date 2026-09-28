import { NextResponse } from "next/server";
import type { PaystackEvent, SupabaseClient } from "./shared";
import { handlePaystackDisputeLifecycle } from "@/lib/bookings/paystack-dispute-lifecycle";

export async function handlePaystackDisputeEvent(
  event: PaystackEvent,
  supabase: SupabaseClient,
  eventId?: string | null,
): Promise<NextResponse> {
  const disputeData = event.data as Record<string, unknown> | null | undefined;
  try {
    await handlePaystackDisputeLifecycle({
      supabase,
      eventType: event.event,
      eventId: eventId ?? undefined,
      disputeData: disputeData ?? {},
    });
  } catch (err) {
    console.error("[webhook] paystack dispute handler failed:", err);
    throw err;
  }
  return NextResponse.json({ received: true });
}
