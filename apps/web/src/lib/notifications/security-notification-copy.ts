/** Shared security template keys and fallback copy (no send-path imports). */

export const SECURITY_NOTIFICATION_TEMPLATE_KEYS = [
  "security_device_verification_code",
  "security_step_up_code",
  "security_device_approval_request",
  "security_new_device_signin",
  "security_signin_attempt_blocked",
  "security_payout_account_added",
  "security_payout_account_changed",
  "security_payout_account_ready",
  "security_payout_hold_released",
  "security_password_changed",
  "security_phone_changed",
  "security_email_change_requested",
  "security_mfa_enabled",
  "security_mfa_disabled",
  "security_recovery_code_used",
  "security_recovery_codes_regenerated",
  "security_team_access_changed",
  "security_account_secured",
  "security_admin_mfa_setup_reminder",
] as const;

export type SecurityNotificationTemplateKey = (typeof SECURITY_NOTIFICATION_TEMPLATE_KEYS)[number];

export function isSecurityNotificationTemplateKey(templateKey: string): boolean {
  return templateKey.trim().toLowerCase().startsWith("security_");
}

export const SECURITY_NOTIFICATION_FALLBACKS: Record<
  string,
  { title: string; body: string; url: string }
> = {
  security_device_verification_code: {
    title: "Verify your device",
    body: "Your verification code is {{code}}. It expires in {{expires_minutes}} minutes.",
    url: "/account-settings/login-and-security",
  },
  security_step_up_code: {
    title: "Confirm it's you",
    body: "Your Beautonomi confirmation code is {{code}}. It expires in {{expires_minutes}} minutes.",
    url: "/account-settings/login-and-security",
  },
  security_device_approval_request: {
    title: "Approve sign-in on a new device",
    body: "Approve sign-in for {{device_label}} from {{location}}.",
    url: "/account-settings/login-and-security",
  },
  security_new_device_signin: {
    title: "New sign-in to your account",
    body: "New sign-in on {{device_label}} from {{location}} at {{signin_time}}.",
    url: "/account-settings/login-and-security",
  },
  security_signin_attempt_blocked: {
    title: "Sign-in attempt blocked",
    body: "We blocked a sign-in attempt. {{reason}}",
    url: "/account-settings/login-and-security",
  },
  security_payout_account_added: {
    title: "Payout account added",
    body: "A payout account ending in {{account_last4}} was added.",
    url: "/provider/settings/payout-accounts",
  },
  security_payout_account_changed: {
    title: "Payout account updated",
    body: "Your payout account ending in {{account_last4}} was updated.",
    url: "/provider/settings/payout-accounts",
  },
  security_payout_account_ready: {
    title: "Payout account ready",
    body: "Your payout account ending in {{account_last4}} is ready for payouts.",
    url: "/provider/settings/payout-accounts",
  },
  security_payout_hold_released: {
    title: "Payout hold released",
    body: "The security hold on payout account ending {{account_last4}} was released.",
    url: "/provider/settings/payout-accounts",
  },
  security_password_changed: {
    title: "Password changed",
    body: "Your password was changed. If this wasn't you, secure your account immediately.",
    url: "/account-settings/login-and-security",
  },
  security_phone_changed: {
    title: "Phone number updated",
    body: "Your phone number was updated to {{new_phone_mask}}.",
    url: "/account-settings/login-and-security",
  },
  security_email_change_requested: {
    title: "Email change requested",
    body: "A change to {{new_email_mask}} was requested for your account.",
    url: "/account-settings/login-and-security",
  },
  security_mfa_enabled: {
    title: "Two-step verification enabled",
    body: "Two-step verification is now enabled on your account.",
    url: "/account-settings/login-and-security",
  },
  security_mfa_disabled: {
    title: "Two-step verification disabled",
    body: "Two-step verification was turned off on your account.",
    url: "/account-settings/login-and-security",
  },
  security_recovery_code_used: {
    title: "Recovery code used",
    body: "A two-step verification recovery code was used on your account.",
    url: "/account-settings/login-and-security",
  },
  security_recovery_codes_regenerated: {
    title: "Recovery codes regenerated",
    body: "Your two-step verification recovery codes were regenerated.",
    url: "/account-settings/login-and-security",
  },
  security_team_access_changed: {
    title: "Team access updated",
    body: "Team access was updated: {{change_summary}}",
    url: "/provider/settings/team",
  },
  security_account_secured: {
    title: "Account secured",
    body: "Your account was secured after a suspicious activity review.",
    url: "/account-settings/login-and-security",
  },
  security_admin_mfa_setup_reminder: {
    title: "Set up admin two-step verification",
    body: "Admin 2FA will be required from {{enforce_date}}. Set up your authenticator now.",
    url: "/admin/security",
  },
};
