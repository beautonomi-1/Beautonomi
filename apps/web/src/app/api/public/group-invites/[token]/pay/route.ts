import { NextRequest } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  errorResponse,
  handleApiError,
  notFoundResponse,
  requireRoleInApi,
  successResponse,
} from "@/lib/supabase/api-helpers";
import { acceptGroupBookingInvite, getGroupInviteByToken } from "@/lib/bookings/group-invites";
import { rateLimitGroupInvite } from "@/lib/bookings/group-invite-view";
import { computeBookingOutstandingDisplay } from "@/lib/bookings/display-invariants";
import { sumPendingWalletGiftBookingPayments } from "@/lib/bookings/ensure-wallet-gift-booking-payments";
import { initializeOnlinePayment } from "@/lib/payments/online-payment";
import {
  paystackChannelsForInitialize,
  resolveHostedCheckoutCallbacks,
} from "@/lib/payments/resolve-paystack-hosted-callback";
import { convertToSmallestUnit, generateTransactionReference } from "@/lib/payments/paystack";
import { resolvePaymentTenantForBookingRequest } from "@/lib/bookings/resolve-payment-tenant";

const bodySchema = z.object({
  callback_url: z.string().url().optional(),
});

/**
 * POST /api/public/group-invites/[token]/pay
 * Start Paystack checkout for a guest's split-payment share.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const limited = await rateLimitGroupInvite(request);
    if (limited) return limited;
    const { user } = await requireRoleInApi(["customer", "superadmin"], request);
    const { token } = await params;
    const admin = getSupabaseAdmin();
    let invite = await getGroupInviteByToken(admin, token);
    if (!invite) return notFoundResponse("Invite not found");
    if (invite.status !== "accepted" && invite.status !== "pending") {
      return errorResponse("This invite is no longer active.", "INVITE_INACTIVE", 409);
    }
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
      return errorResponse("This invite has expired.", "INVITE_INACTIVE", 409);
    }
    if (!invite.booking_participant_id) {
      return errorResponse("Invite is not linked to a participant.", "INVALID_INVITE", 400);
    }
    if (invite.status === "pending") {
      const claimed = await acceptGroupBookingInvite(admin, token, user.id);
      if (claimed.ok === false) {
        return errorResponse("This invite is no longer active.", "INVITE_INACTIVE", 409);
      }
      invite = claimed.invite;
    }
    const participantId = invite.booking_participant_id!;

    const { data: participant } = await admin
      .from("booking_participants")
      .select("id, amount_due, amount_paid, participant_payment_status, group_booking_id")
      .eq("id", participantId)
      .maybeSingle();
    if (!participant) return notFoundResponse("Participant not found");
    if ((participant as { participant_payment_status?: string }).participant_payment_status === "cancelled") {
      return errorResponse("This guest's spot was cancelled.", "PARTICIPANT_CANCELLED", 409);
    }

    const due = Number((participant as { amount_due?: number }).amount_due ?? invite.amount_due ?? 0);
    const paid = Number((participant as { amount_paid?: number }).amount_paid ?? 0);
    const remaining = Math.round(Math.max(0, due - paid) * 100) / 100;
    if (remaining <= 0) {
      return errorResponse("Nothing left to pay for this guest.", "ALREADY_PAID", 409);
    }

    const { data: groupRow } = await admin
      .from("group_bookings")
      .select("primary_contact_booking_id, provider_id")
      .eq("id", invite.group_booking_id)
      .maybeSingle();
    const bookingId = (groupRow as { primary_contact_booking_id?: string | null })
      ?.primary_contact_booking_id;
    if (!bookingId) {
      return errorResponse("Group booking is not ready for payment.", "BOOKING_NOT_LINKED", 409);
    }

    const { data: booking } = await admin
      .from("bookings")
      .select(
        "id, tenant_id, currency, booking_number, status, payment_status, total_amount, total_paid, total_refunded, wallet_amount, gift_card_amount",
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return notFoundResponse("Booking not found");
    const b = booking as Record<string, unknown>;
    if (["cancelled", "completed", "no_show"].includes(String(b.status ?? ""))) {
      return errorResponse("This group booking is closed.", "BOOKING_CLOSED", 409);
    }
    const pendingWalletGift = await sumPendingWalletGiftBookingPayments(admin, bookingId);
    const outstanding = computeBookingOutstandingDisplay({
      totalAmount: Number(b.total_amount ?? 0),
      totalPaid: Number(b.total_paid ?? 0),
      totalRefunded: Number(b.total_refunded ?? 0),
      walletAmount: Number(b.wallet_amount ?? 0),
      giftCardAmount: Number(b.gift_card_amount ?? 0),
      unpaidAdditionalCharges: 0,
      paymentStatus: (b.payment_status as string | null) ?? null,
      pendingWalletGiftAmount: pendingWalletGift,
    });
    if (outstanding + 0.01 < remaining) {
      return errorResponse(
        "The booking balance is already covered, so this share no longer needs paying.",
        "ALREADY_PAID",
        409,
      );
    }

    const tenantResolved = await resolvePaymentTenantForBookingRequest(
      request,
      (booking as { tenant_id?: string | null }).tenant_id,
    );
    if (tenantResolved.ok === false) return tenantResolved.response;

    const currency = String(
      invite.currency ?? (booking as { currency?: string }).currency ?? "ZAR",
    );
    const reference = generateTransactionReference("grp", participantId);
    const amountMinor = convertToSmallestUnit(remaining, currency);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://beautonomi.com").replace(/\/$/, "");
    const invitePath = `/group-invite/${encodeURIComponent(token)}`;
    const callbacks = resolveHostedCheckoutCallbacks({
      baseUrl: appUrl,
      clientCallbackUrl: parsed.success ? parsed.data.callback_url : undefined,
      defaultSuccessPath: invitePath,
      defaultCancelPath: invitePath,
      query: { payment: "share" },
    });

    const init = await initializeOnlinePayment({
      tenantId: tenantResolved.paymentTenantId,
      email: user.email ?? "guest@beautonomi.com",
      amountInSmallestUnit: amountMinor,
      currency,
      reference,
      ...paystackChannelsForInitialize({ saveCard: false }),
      callbackUrl: callbacks.successUrl,
      metadata: {
        payment_type: "group_participant_share",
        type: "group_participant_share",
        booking_id: bookingId,
        group_participant_id: participantId,
        customer_id: user.id,
        invite_id: invite.id,
      },
    });

    if (!init.authorizationUrl) {
      return errorResponse("Could not start payment.", "PAYMENT_INIT_FAILED", 502);
    }

    return successResponse({
      authorization_url: init.authorizationUrl,
      reference,
      amount: remaining,
      currency,
    });
  } catch (error) {
    return handleApiError(error, "Failed to start guest payment");
  }
}
