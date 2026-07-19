import type { SupabaseClient } from "@supabase/supabase-js";
import { dispatchTemplateNotification } from "@/lib/notifications/dispatch-template-notification";
import { sendShadowAccountClaimInvite } from "@/lib/auth/claim-shadow-account";

const NUDGE_METADATA_KEY = "walk_in_app_nudge_sent_at";

export async function maybeSendWalkInAppNudge(params: {
  supabaseAdmin: SupabaseClient;
  customerId: string;
  bookingId: string;
  bookingNumber: string;
  providerId: string;
  providerName: string;
  tenantId?: string | null;
  /** Prefer after completion; also allowed at create for walk-ins with contact info. */
  trigger: "booking_created" | "booking_completed";
}): Promise<void> {
  const { data: userRow } = await params.supabaseAdmin
    .from("users")
    .select("id, email, phone, is_shadow, claimed_at, metadata")
    .eq("id", params.customerId)
    .maybeSingle();

  const user = userRow as {
    email?: string | null;
    phone?: string | null;
    is_shadow?: boolean | null;
    claimed_at?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;

  if (!user?.is_shadow || user.claimed_at) return;
  if (user.metadata?.[NUDGE_METADATA_KEY]) return;

  const hasPhone = typeof user.phone === "string" && user.phone.trim().length > 0;
  const hasRealEmail =
    typeof user.email === "string" &&
    user.email.includes("@") &&
    !user.email.endsWith("@beautonomi.invalid");
  if (!hasPhone && !hasRealEmail) return;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://beautonomi.com";
  const claimLink = `${baseUrl}/auth/claim?booking=${params.bookingId}`;

  try {
    await dispatchTemplateNotification(
      "walk_in_app_nudge",
      [params.customerId],
      {
        provider_name: params.providerName,
        booking_number: params.bookingNumber,
        booking_id: params.bookingId,
        claim_link: claimLink,
        app_store_link: process.env.NEXT_PUBLIC_IOS_APP_URL ?? "",
        play_store_link: process.env.NEXT_PUBLIC_ANDROID_APP_URL ?? "",
      },
      hasRealEmail ? ["email"] : ["sms"],
      { appType: "customer", tenantId: params.tenantId ?? null },
    );
  } catch (err) {
    console.warn("[walk-in nudge] template send failed:", err);
  }

  if (hasRealEmail) {
    try {
      await sendShadowAccountClaimInvite({
        supabaseAdmin: params.supabaseAdmin,
        email: user.email!,
        tenantId: params.tenantId ?? null,
      });
    } catch {
      /* claim invite is best-effort alongside nudge */
    }
  }

  await params.supabaseAdmin
    .from("users")
    .update({
      metadata: {
        ...(user.metadata ?? {}),
        [NUDGE_METADATA_KEY]: new Date().toISOString(),
        walk_in_app_nudge_trigger: params.trigger,
      },
    })
    .eq("id", params.customerId);
}
