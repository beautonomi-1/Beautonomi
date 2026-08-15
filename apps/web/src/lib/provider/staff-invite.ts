import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sendResendEmail, resolveResendCredentials } from "@/lib/integrations/resend";
import { resolveProviderAppLinks } from "@/lib/provider-ops/resolve-provider-app-links";
import { getNotificationTemplate } from "@/lib/notifications/onesignal";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import {
  persistJoinedProviderRole,
  resolveEffectiveProviderRole,
} from "@/lib/auth/effective-provider-role";

// Re-export for callers that imported from this module.
export { persistJoinedProviderRole, persistProviderStaffRole, resolveEffectiveProviderRole } from "@/lib/auth/effective-provider-role";

export const STAFF_INVITE_EXPIRY_DAYS = 14;

export type StaffInviteDeliveryResult = {
  invite_token: string;
  join_url: string;
  set_password_url: string | null;
  email: {
    attempted: boolean;
    delivered: boolean;
    error: string | null;
  };
  push: {
    attempted: boolean;
    delivered: boolean;
    error: string | null;
  };
};

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

export function buildStaffJoinUrl(token: string): string {
  const base = appBaseUrl();
  if (!base) return `/provider/join?token=${encodeURIComponent(token)}`;
  return `${base}/provider/join?token=${encodeURIComponent(token)}`;
}

export function substituteTemplateVars(
  template: string,
  variables: Record<string, string>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return out;
}

export async function rotateStaffInviteToken(
  admin: SupabaseClient,
  staffId: string,
): Promise<string> {
  const token = randomUUID();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + STAFF_INVITE_EXPIRY_DAYS);

  const { error } = await admin
    .from("provider_staff")
    .update({
      invite_token: token,
      invite_token_expires_at: expiresAt.toISOString(),
      invite_sent_at: new Date().toISOString(),
    })
    .eq("id", staffId);

  if (error) throw error;
  return token;
}

export async function loadStaffInviteRowByToken(
  admin: SupabaseClient,
  token: string,
): Promise<{
  id: string;
  provider_id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  is_active: boolean;
  invite_accepted_at: string | null;
  invite_token_expires_at: string | null;
  business_name: string | null;
} | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data, error } = await admin
    .from("provider_staff")
    .select(
      `
      id,
      provider_id,
      user_id,
      name,
      email,
      is_active,
      invite_accepted_at,
      invite_token_expires_at,
      providers:provider_id ( business_name )
    `,
    )
    .eq("invite_token", trimmed)
    .maybeSingle();

  if (error || !data) return null;

  const providers = data.providers as { business_name?: string | null } | { business_name?: string | null }[] | null;
  const prov = Array.isArray(providers) ? providers[0] : providers;

  return {
    id: data.id,
    provider_id: data.provider_id,
    user_id: data.user_id ?? null,
    name: data.name ?? null,
    email: data.email ?? null,
    is_active: data.is_active ?? true,
    invite_accepted_at: data.invite_accepted_at ?? null,
    invite_token_expires_at: data.invite_token_expires_at ?? null,
    business_name: prov?.business_name ?? null,
  };
}

/** Invite email must match the signed-in person unless they are already linked. */
export function staffInviteEmailAllowed(opts: {
  inviteEmail: string | null | undefined;
  authEmail: string | null | undefined;
  profileEmail: string | null | undefined;
  staffUserId: string | null | undefined;
  acceptingUserId: string;
}): boolean {
  if (opts.staffUserId && opts.staffUserId === opts.acceptingUserId) return true;
  const invite = (opts.inviteEmail || "").trim().toLowerCase();
  if (!invite) return true;
  const candidate =
    (opts.authEmail || "").trim().toLowerCase() ||
    (opts.profileEmail || "").trim().toLowerCase();
  if (!candidate) return false;
  return invite === candidate;
}

export function isStaffInviteTokenValid(row: {
  is_active: boolean;
  invite_accepted_at: string | null;
  invite_token_expires_at: string | null;
}): boolean {
  if (!row.is_active) return false;
  if (row.invite_accepted_at) return false;
  if (!row.invite_token_expires_at) return true;
  return new Date(row.invite_token_expires_at).getTime() > Date.now();
}

export async function generateStaffSetPasswordUrl(
  admin: SupabaseClient,
  email: string,
  joinUrl: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const redirectTo = `${appBaseUrl()}/auth/callback?next=${encodeURIComponent(joinUrl)}`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: normalized,
    options: { redirectTo },
  });

  if (error || !data?.properties?.action_link) {
    console.warn("[staff-invite] generateLink failed:", error?.message);
    return null;
  }
  return data.properties.action_link;
}

async function resolveJoinedRole(admin: ReturnType<typeof getSupabaseAdmin>, userId: string) {
  await persistJoinedProviderRole(userId);
  const { data } = await admin.from("users").select("role").eq("id", userId).maybeSingle();
  return (data?.role as string | undefined) ?? "provider_staff";
}

export async function acceptStaffInvite(params: {
  token: string;
  userId: string;
  userEmail: string | null | undefined;
}): Promise<{
  staff_id: string;
  provider_id: string;
  already_accepted: boolean;
  role: string;
}> {
  const admin = getSupabaseAdmin();
  const row = await loadStaffInviteRowByToken(admin, params.token);
  if (!row) {
    throw new Error("INVITE_NOT_FOUND");
  }

  if (row.invite_accepted_at) {
    if (row.user_id && row.user_id !== params.userId) {
      throw new Error("INVITE_ALREADY_ACCEPTED");
    }
    const role = await resolveJoinedRole(admin, params.userId);
    return {
      staff_id: row.id,
      provider_id: row.provider_id,
      already_accepted: true,
      role,
    };
  }

  if (!isStaffInviteTokenValid(row)) {
    throw new Error("INVITE_EXPIRED");
  }

  const { data: profile } = await admin
    .from("users")
    .select("email")
    .eq("id", params.userId)
    .maybeSingle();

  if (
    !staffInviteEmailAllowed({
      inviteEmail: row.email,
      authEmail: params.userEmail,
      profileEmail: profile?.email,
      staffUserId: row.user_id,
      acceptingUserId: params.userId,
    })
  ) {
    throw new Error("EMAIL_MISMATCH");
  }

  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("provider_staff")
    .update({
      user_id: params.userId,
      invite_accepted_at: now,
      is_active: true,
    })
    .eq("id", row.id);

  if (upErr) throw upErr;

  const role = await resolveJoinedRole(admin, params.userId);

  return {
    staff_id: row.id,
    provider_id: row.provider_id,
    already_accepted: false,
    role,
  };
}

export async function sendStaffInvite(params: {
  supabase: SupabaseClient;
  staffId: string;
  providerId: string;
  tenantId?: string | null;
  inviterUserId: string;
  inviterName?: string | null;
  customMessage?: string | null;
  recipientUserId?: string | null;
  recipientEmail: string;
}): Promise<StaffInviteDeliveryResult> {
  const admin = getSupabaseAdmin();

  const { data: staff, error: staffErr } = await admin
    .from("provider_staff")
    .select("id, name, email, user_id")
    .eq("id", params.staffId)
    .eq("provider_id", params.providerId)
    .single();

  if (staffErr || !staff) {
    throw new Error("Staff member not found");
  }

  const { data: provider } = await admin
    .from("providers")
    .select("business_name, tenant_id")
    .eq("id", params.providerId)
    .single();

  const tenantId =
    params.tenantId ??
    (provider as { tenant_id?: string | null } | null)?.tenant_id ??
    null;

  const token = await rotateStaffInviteToken(admin, params.staffId);
  const joinUrl = buildStaffJoinUrl(token);
  const inviteEmail = (params.recipientEmail || staff.email || "").trim().toLowerCase();

  let setPasswordUrl: string | null = null;
  if (inviteEmail) {
    setPasswordUrl = await generateStaffSetPasswordUrl(admin, inviteEmail, joinUrl);
  }

  const appLinks = await resolveProviderAppLinks(admin, tenantId);
  const businessName = (provider as { business_name?: string | null } | null)?.business_name || "the team";
  const staffName = staff.name || inviteEmail.split("@")[0] || "there";
  const inviterName = params.inviterName?.trim() || "Your manager";

  const templateVars: Record<string, string> = {
    staff_name: staffName,
    business_name: businessName,
    inviter_name: inviterName,
    join_url: joinUrl,
    set_password_url: setPasswordUrl || joinUrl,
    invite_token: token,
    ios_url: appLinks.ios || "",
    android_url: appLinks.android || "",
    huawei_url: appLinks.huawei || "",
  };

  const template = await getNotificationTemplate("staff_invitation", admin, tenantId);

  const emailSubject = substituteTemplateVars(
    template?.email_subject || `Join ${businessName} on Beautonomi`,
    templateVars,
  );
  let emailHtml = substituteTemplateVars(
    template?.email_body ||
      `<p>Hi ${staffName}, you've been invited to join ${businessName}.</p>
<p><a href="${setPasswordUrl || joinUrl}">Set password &amp; join the team</a></p>
<p style="font-size:12px;color:#6b7280;">Or open your invite: <a href="${joinUrl}">${joinUrl}</a></p>`,
    templateVars,
  );
  const emailText =
    (params.customMessage?.trim() ||
      substituteTemplateVars(
        template?.body ||
          `Hi ${staffName}, you've been invited to join ${businessName} on Beautonomi.`,
        templateVars,
      )) +
    `\n\nJoin: ${joinUrl}` +
    (setPasswordUrl ? `\nSet password: ${setPasswordUrl}` : "") +
    (appLinks.ios ? `\n\nProvider app (iOS): ${appLinks.ios}` : "") +
    (appLinks.android ? `\nProvider app (Android): ${appLinks.android}` : "");

  const pushTitle = substituteTemplateVars(
    template?.title || `Invitation to join ${businessName}`,
    templateVars,
  );
  const pushBody = substituteTemplateVars(
    params.customMessage?.trim() ||
      template?.body ||
      `You've been invited to join ${businessName}. Open the app to get started.`,
    templateVars,
  );
  const pushPath = `/provider/join?token=${encodeURIComponent(token)}`;

  const result: StaffInviteDeliveryResult = {
    invite_token: token,
    join_url: joinUrl,
    set_password_url: setPasswordUrl,
    email: { attempted: Boolean(inviteEmail), delivered: false, error: null },
    push: { attempted: false, delivered: false, error: null },
  };

  const targetUserId = params.recipientUserId || staff.user_id;

  if (inviteEmail) {
    try {
      const creds = await resolveResendCredentials(admin, tenantId);
      if (!creds) {
        result.email.error =
          "Email provider not configured (add a Resend API key in Admin Settings → Integrations).";
      } else if (targetUserId) {
        await enqueueNotification(
          {
            channel: "email",
            templateKey: "staff_invitation",
            recipientUserId: targetUserId,
            tenantId,
            payload: {
              to: inviteEmail,
              subject: emailSubject,
              html: emailHtml,
              body: emailText,
              join_url: joinUrl,
            },
            dedupeKey: `staff_invite:${params.staffId}:${token}:email`,
          },
          admin,
        );
        result.email.delivered = true;
      } else {
        await sendResendEmail({
          supabase: admin,
          tenantId,
          to: inviteEmail,
          subject: emailSubject,
          html: emailHtml,
          text: emailText,
        });
        result.email.delivered = true;
      }
    } catch (err) {
      result.email.error = err instanceof Error ? err.message : "Failed to send invite email";
    }
  }

  const pushUserId = targetUserId;
  if (pushUserId) {
    result.push.attempted = true;
    try {
      const { sendToUser } = await import("@/lib/notifications/onesignal");
      await sendToUser(
        pushUserId,
        {
          title: pushTitle,
          message: pushBody,
          data: {
            type: "staff_invitation",
            staff_id: params.staffId,
            provider_id: params.providerId,
            invitation_token: token,
            join_url: joinUrl,
          },
          url: pushPath,
        },
        ["push"],
        { appType: "provider" },
      );
      result.push.delivered = true;
    } catch (err) {
      result.push.error = err instanceof Error ? err.message : "Push notification failed";
    }
  }

  return result;
}
