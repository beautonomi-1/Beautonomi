import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { normalizePhoneToE164 } from "@/lib/phone";
import { isShadowEmail } from "@/lib/users/shadow-email";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendShadowAccountClaimInvite(params: {
  supabaseAdmin: SupabaseClient;
  email: string;
  tenantId?: string | null;
}): Promise<boolean> {
  const email = params.email.trim().toLowerCase();
  if (!email || isShadowEmail(email)) return false;

  const { data: userRow } = await params.supabaseAdmin
    .from("users")
    .select("id, full_name, email, is_shadow")
    .eq("email", email)
    .maybeSingle();

  if (!userRow?.id) return false;
  if (userRow.is_shadow !== true && !isShadowEmail(userRow.email as string)) return false;

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const redirectTo = `${appBase}/auth/callback?next=/account-settings`;

  const { data: linkData, error: linkError } = await params.supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (linkError || !linkData?.properties?.action_link) {
    console.warn("claim invite generateLink failed:", linkError?.message);
    return false;
  }

  const claimUrl = linkData.properties.action_link;
  const customerName = (userRow.full_name as string) || "there";

  const subject = "Claim your Beautonomi account";
  const html = `
    <h2>We found your bookings</h2>
    <p>Hi ${escapeHtml(customerName)},</p>
    <p>An appointment was booked for you on Beautonomi. Click below to set a password and access your bookings.</p>
    <p><a href="${claimUrl}" style="background:#DB2777;color:#fff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;display:inline-block;">Claim my account</a></p>`;
  const text = `We found bookings for ${email}. Claim your account: ${claimUrl}`;

  await enqueueNotification(
    {
      channel: "email",
      templateKey: "account_claim_invite",
      recipientUserId: userRow.id as string,
      payload: {
        to: email,
        subject,
        html,
        body: text,
        claim_url: claimUrl,
      },
      dedupeKey: `account_claim:${userRow.id}:${new Date().toISOString().slice(0, 10)}`,
      tenantId: params.tenantId ?? null,
    },
    params.supabaseAdmin,
  );

  return true;
}

export async function sendShadowAccountClaimInviteByPhone(params: {
  supabaseAdmin: SupabaseClient;
  phone: string;
  tenantId?: string | null;
}): Promise<boolean> {
  const phoneNorm = normalizePhoneToE164(params.phone.trim());
  if (!phoneNorm) return false;

  const { data: userRow } = await params.supabaseAdmin
    .from("users")
    .select("id, full_name, phone, is_shadow, claimed_at")
    .eq("phone", phoneNorm)
    .maybeSingle();

  if (!userRow?.id || userRow.is_shadow !== true || userRow.claimed_at) return false;

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const claimUrl = `${appBase}/login?claim=1&phone=${encodeURIComponent(phoneNorm)}`;
  const customerName = (userRow.full_name as string) || "there";

  await enqueueNotification(
    {
      channel: "sms",
      templateKey: "account_claim_invite",
      recipientUserId: userRow.id as string,
      payload: {
        body: `Hi ${customerName}, we found your Beautonomi bookings. Sign in with this phone to claim your account: ${claimUrl}`,
        claim_url: claimUrl,
        phone: phoneNorm,
      },
      dedupeKey: `account_claim_phone:${userRow.id}:${new Date().toISOString().slice(0, 10)}`,
      tenantId: params.tenantId ?? null,
    },
    params.supabaseAdmin,
  );

  return true;
}

export async function completeShadowAccountClaim(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<void> {
  // Idempotent and safe to call after any login: no-op for non-shadow users
  // so we never overwrite claimed_at on already-registered accounts.
  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("id, is_shadow")
    .eq("id", userId)
    .maybeSingle();
  if (!userRow?.id || userRow.is_shadow !== true) return;

  await supabaseAdmin
    .from("users")
    .update({
      is_shadow: false,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", userId);

  // Clear the auth metadata flag too so client-side "auto claim after login"
  // gates (which read session.user.user_metadata.is_shadow) stop firing.
  try {
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { is_shadow: false },
    });
  } catch {
    // Non-fatal: public.users.is_shadow is the source of truth.
  }

  await supabaseAdmin
    .from("provider_clients")
    .update({ linked_existing_platform_user: true })
    .eq("customer_id", userId)
    .eq("linked_existing_platform_user", false);

  const { data: bookings } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("customer_id", userId);

  if (bookings?.length) {
    await supabaseAdmin
      .from("portal_tokens")
      .update({ is_active: false })
      .in(
        "booking_id",
        bookings.map((b) => b.id),
      );
  }
}
