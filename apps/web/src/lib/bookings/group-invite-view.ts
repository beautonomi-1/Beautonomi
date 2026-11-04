import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { GroupInviteRow } from "@/lib/bookings/group-invites";
import { checkPublicMutationRateLimit } from "@/lib/rate-limit/public-mutation";

const OPEN_INVITE = new Set(["pending", "accepted"]);
const CLOSED_BOOKING = new Set(["cancelled", "completed", "no_show"]);

export type GroupInviteView = {
  id: string;
  invited_name: string | null;
  status: string;
  expires_at: string | null;
  currency: string | null;
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  share_status: string | null;
  booking: {
    booking_number: string | null;
    scheduled_at: string | null;
    status: string | null;
    provider_name: string | null;
  } | null;
  can_pay: boolean;
  can_cancel: boolean;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Public-safe invite payload (never includes the token hash or contact details). */
export async function buildGroupInviteView(
  admin: SupabaseClient,
  invite: GroupInviteRow,
): Promise<GroupInviteView> {
  const participantRes = invite.booking_participant_id
    ? await admin
        .from("booking_participants")
        .select("amount_due, amount_paid, participant_payment_status")
        .eq("id", invite.booking_participant_id)
        .maybeSingle()
    : { data: null };
  const participant = (participantRes.data ?? null) as {
    amount_due?: number | string | null;
    amount_paid?: number | string | null;
    participant_payment_status?: string | null;
  } | null;

  const { data: group } = await admin
    .from("group_bookings")
    .select("primary_contact_booking_id")
    .eq("id", invite.group_booking_id)
    .maybeSingle();
  const leadId = (group as { primary_contact_booking_id?: string | null } | null)?.primary_contact_booking_id;

  let booking: GroupInviteView["booking"] = null;
  if (leadId) {
    const { data: b } = await admin
      .from("bookings")
      .select("booking_number, scheduled_at, status, provider_id")
      .eq("id", leadId)
      .maybeSingle();
    if (b) {
      const row = b as {
        booking_number?: string | null;
        scheduled_at?: string | null;
        status?: string | null;
        provider_id?: string | null;
      };
      let providerName: string | null = null;
      if (row.provider_id) {
        const { data: p } = await admin
          .from("providers")
          .select("business_name")
          .eq("id", row.provider_id)
          .maybeSingle();
        providerName = (p as { business_name?: string | null } | null)?.business_name ?? null;
      }
      booking = {
        booking_number: row.booking_number ?? null,
        scheduled_at: row.scheduled_at ?? null,
        status: row.status ?? null,
        provider_name: providerName,
      };
    }
  }

  const amountDue = round2(Number(participant?.amount_due ?? invite.amount_due ?? 0));
  const amountPaid = round2(Number(participant?.amount_paid ?? 0));
  const remaining = round2(Math.max(0, amountDue - amountPaid));
  const shareStatus = participant?.participant_payment_status ?? null;
  const expired = Boolean(invite.expires_at && new Date(invite.expires_at).getTime() < Date.now());
  const open =
    OPEN_INVITE.has(invite.status) &&
    !expired &&
    shareStatus !== "cancelled" &&
    !(booking?.status && CLOSED_BOOKING.has(booking.status));

  return {
    id: invite.id,
    invited_name: invite.invited_name,
    status: expired && invite.status === "pending" ? "expired" : invite.status,
    expires_at: invite.expires_at,
    currency: invite.currency,
    amount_due: amountDue,
    amount_paid: amountPaid,
    amount_remaining: remaining,
    share_status: shareStatus,
    booking,
    can_pay: open && remaining > 0,
    can_cancel: open && Boolean(invite.booking_participant_id),
  };
}

/** Returns a 429 response when the caller's IP exceeded the public mutation budget. */
export async function rateLimitGroupInvite(request: Request): Promise<NextResponse | null> {
  const rateLimit = await checkPublicMutationRateLimit(request);
  if (rateLimit.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
  );
}
