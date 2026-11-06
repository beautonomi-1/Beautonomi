-- Security / account-protection notification templates (global, must-deliver).

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_device_verification_code',
  'Verify your device',
  'Your Beautonomi verification code is {{code}}. It expires in {{expires_minutes}} minutes.',
  ARRAY['email']::TEXT[],
  'Your Beautonomi device verification code',
  '<p>Use this code to verify your device <strong>{{device_label}}</strong>:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{code}}</p><p>This code expires in {{expires_minutes}} minutes. If you did not request this, secure your account immediately.</p><p><a href="{{app_url}}/account-settings/login-and-security">Review login &amp; security</a></p>',
  'Beautonomi code {{code}} (expires in {{expires_minutes}} min). Not you? Secure your account in the app.',
  ARRAY['code', 'device_label', 'expires_minutes', 'app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: one-time code to verify a new or unrecognized device.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_step_up_code',
  'Confirm it''s you',
  'Your Beautonomi confirmation code is {{code}}. It expires in {{expires_minutes}} minutes.',
  ARRAY['email']::TEXT[],
  'Your Beautonomi confirmation code',
  '<p>Use this code to confirm a change to your account (<strong>{{action_label}}</strong>):</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{code}}</p><p>This code expires in {{expires_minutes}} minutes. If you did not request this, change your password and review your devices.</p><p><a href="{{app_url}}/account-settings/login-and-security">Review login &amp; security</a></p>',
  NULL,
  ARRAY['code', 'action_label', 'expires_minutes', 'app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: one-time code to confirm a sensitive change (bank, payout, contact, password or team).'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_device_approval_request',
  'Approve sign-in on a new device',
  'Approve sign-in for {{device_label}} from {{location}}.',
  ARRAY['push']::TEXT[],
  'Approve a new device on your Beautonomi account',
  '<p>Someone is trying to sign in to your account on <strong>{{device_label}}</strong> from {{location}}.</p><p>If this was you, approve the request in the app. If not, deny it and change your password.</p><p><a href="{{app_url}}/account-settings/login-and-security">Review devices</a></p>',
  NULL,
  ARRAY['device_label', 'location', 'app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: push/email to approve or deny a new device sign-in.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_new_device_signin',
  'New sign-in to your account',
  'New sign-in on {{device_label}} from {{location}} at {{signin_time}}.',
  ARRAY['push', 'email']::TEXT[],
  'New sign-in to your Beautonomi account',
  '<p>Your account was signed in on <strong>{{device_label}}</strong> from {{location}} at {{signin_time}}.</p><p>If this wasn''t you, secure your account right away.</p><p><a href="{{app_url}}/account-settings/login-and-security">Review login activity</a></p>',
  'Beautonomi: new sign-in on {{device_label}} from {{location}}. Not you? Secure your account.',
  ARRAY['device_label', 'location', 'signin_time', 'app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: alert after a successful sign-in from a new device.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_signin_attempt_blocked',
  'Sign-in attempt blocked',
  'We blocked a sign-in attempt. {{reason}}',
  ARRAY['push', 'email']::TEXT[],
  'Sign-in attempt blocked â€” Beautonomi',
  '<p>We blocked a sign-in attempt on your account.</p><p><strong>Reason:</strong> {{reason}}</p><p>If this wasn''t you, review your security settings.</p><p><a href="{{app_url}}/account-settings/login-and-security">Secure your account</a></p>',
  'Beautonomi blocked a sign-in attempt. {{reason}}',
  ARRAY['reason', 'app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: blocked login (rate limit, invalid credentials, etc.).'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_payout_account_added',
  'Payout account added',
  'A payout account ending in {{account_last4}} was added to your profile.',
  ARRAY['push', 'email']::TEXT[],
  'Payout account added â€” Beautonomi',
  '<p>A payout account (<strong>{{bank_name}}</strong>, ending {{account_last4}}) was added to your profile.</p><p>If you did not make this change, contact support immediately.</p><p><a href="{{app_url}}/provider/settings/payout-accounts">Review payout accounts</a></p>',
  'Beautonomi: payout account ending {{account_last4}} added. Not you? Contact support.',
  ARRAY['account_last4', 'bank_name', 'app_url']::TEXT[],
  '/provider/settings/payout-accounts',
  TRUE,
  'Security: provider payout bank account added.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_payout_account_changed',
  'Payout account updated',
  'Your payout account ending in {{account_last4}} was updated.',
  ARRAY['push', 'email']::TEXT[],
  'Payout account changed â€” Beautonomi',
  '<p>Your payout account ending in <strong>{{account_last4}}</strong> was updated.</p><p>If you did not make this change, secure your account and contact support.</p><p><a href="{{app_url}}/provider/settings/payout-accounts">Review payout accounts</a></p>',
  'Beautonomi: payout account ending {{account_last4}} changed. Not you? Secure your account.',
  ARRAY['account_last4', 'app_url']::TEXT[],
  '/provider/settings/payout-accounts',
  TRUE,
  'Security: provider payout account details changed.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_payout_account_ready',
  'Payout account ready',
  'Your payout account ending in {{account_last4}} is ready to receive payouts.',
  ARRAY['push', 'email']::TEXT[],
  'Payout account ready â€” Beautonomi',
  '<p>Your payout account ending in <strong>{{account_last4}}</strong> has finished its security review and can receive payouts.</p><p><a href="{{app_url}}/provider/settings/payout-accounts">View payout accounts</a></p>',
  NULL,
  ARRAY['account_last4', 'app_url']::TEXT[],
  '/provider/settings/payout-accounts',
  TRUE,
  'Security: cooling-off completed; payout account active.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_payout_hold_released',
  'Payout hold released',
  'The security hold on payout account ending {{account_last4}} has been released.',
  ARRAY['push', 'email']::TEXT[],
  'Payout hold released â€” Beautonomi',
  '<p>The security hold on your payout account ending in <strong>{{account_last4}}</strong> has been released.</p><p><a href="{{app_url}}/provider/settings/payout-accounts">View payout accounts</a></p>',
  NULL,
  ARRAY['account_last4', 'app_url']::TEXT[],
  '/provider/settings/payout-accounts',
  TRUE,
  'Security: admin or policy released a payout account hold.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_password_changed',
  'Password changed',
  'Your Beautonomi password was changed. If this wasn''t you, secure your account immediately.',
  ARRAY['push', 'email']::TEXT[],
  'Your Beautonomi password was changed',
  '<p>Your account password was changed successfully.</p><p>If you did not make this change, reset your password and review your devices.</p><p><a href="{{app_url}}/account-settings/login-and-security">Login &amp; security</a></p>',
  'Beautonomi password changed. Not you? Secure your account in the app.',
  ARRAY['app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: password change confirmation.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_phone_changed',
  'Phone number updated',
  'Your phone number was updated to {{new_phone_mask}}.',
  ARRAY['push', 'email']::TEXT[],
  'Phone number changed â€” Beautonomi',
  '<p>Your account phone number was changed to <strong>{{new_phone_mask}}</strong>.</p><p>If this wasn''t you, secure your account immediately.</p><p><a href="{{app_url}}/account-settings/login-and-security">Review security</a></p>',
  'Beautonomi: phone updated to {{new_phone_mask}}. Not you? Secure your account.',
  ARRAY['new_phone_mask', 'app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: phone number change alert.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_email_change_requested',
  'Email change requested',
  'A change to {{new_email_mask}} was requested for your account.',
  ARRAY['push', 'email']::TEXT[],
  'Email change requested â€” Beautonomi',
  '<p>Someone requested to change your account email to <strong>{{new_email_mask}}</strong>.</p><p>If this wasn''t you, cancel the request and secure your account.</p><p><a href="{{app_url}}/account-settings/login-and-security">Review security</a></p>',
  NULL,
  ARRAY['new_email_mask', 'app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: email change initiated (confirmation pending).'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_mfa_enabled',
  'Two-step verification enabled',
  'Two-step verification is now enabled on your account.',
  ARRAY['push', 'email']::TEXT[],
  'Two-step verification enabled â€” Beautonomi',
  '<p>Two-step verification (authenticator app) was enabled on your account.</p><p>Keep your recovery codes in a safe place.</p><p><a href="{{app_url}}/account-settings/login-and-security">Manage 2FA</a></p>',
  NULL,
  ARRAY['app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: MFA enrollment completed.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_mfa_disabled',
  'Two-step verification disabled',
  'Two-step verification was turned off on your account.',
  ARRAY['push', 'email']::TEXT[],
  'Two-step verification disabled â€” Beautonomi',
  '<p>Two-step verification was disabled on your account.</p><p>If you did not make this change, re-enable 2FA and change your password immediately.</p><p><a href="{{app_url}}/account-settings/login-and-security">Secure your account</a></p>',
  'Beautonomi: 2FA disabled on your account. Not you? Secure your account now.',
  ARRAY['app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: MFA removed or disabled.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_recovery_code_used',
  'Recovery code used',
  'A two-step verification recovery code was used on your account.',
  ARRAY['push', 'email']::TEXT[],
  'Recovery code used â€” Beautonomi',
  '<p>A recovery code was used to sign in to your account.</p><p>If this wasn''t you, reset your password and regenerate recovery codes.</p><p><a href="{{app_url}}/account-settings/login-and-security">Review security</a></p>',
  'Beautonomi: a 2FA recovery code was used. Not you? Secure your account.',
  ARRAY['app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: MFA recovery code consumed.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_recovery_codes_regenerated',
  'Recovery codes regenerated',
  'Your two-step verification recovery codes were regenerated.',
  ARRAY['push', 'email']::TEXT[],
  'New recovery codes â€” Beautonomi',
  '<p>Your two-step verification recovery codes were regenerated. Previous codes no longer work.</p><p>Store the new codes securely.</p><p><a href="{{app_url}}/account-settings/login-and-security">View recovery codes</a></p>',
  NULL,
  ARRAY['app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: MFA recovery codes rotated.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_team_access_changed',
  'Team access updated',
  'Team access on your account was updated: {{change_summary}}',
  ARRAY['push', 'email']::TEXT[],
  'Team access changed â€” Beautonomi',
  '<p>Team access for your business was updated.</p><p><strong>Summary:</strong> {{change_summary}}</p><p>If you did not authorize this, review your team and security settings.</p><p><a href="{{app_url}}/provider/settings/team">Review team</a></p>',
  NULL,
  ARRAY['change_summary', 'app_url']::TEXT[],
  '/provider/settings/team',
  TRUE,
  'Security: provider staff/team permission change.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_account_secured',
  'Account secured',
  'Your account was secured after a suspicious activity review.',
  ARRAY['push', 'email']::TEXT[],
  'Your account is secured â€” Beautonomi',
  '<p>We helped secure your account after suspicious activity was reported or detected.</p><p>Review your recent sign-ins and devices.</p><p><a href="{{app_url}}/account-settings/login-and-security">Review login &amp; security</a></p>',
  NULL,
  ARRAY['app_url']::TEXT[],
  '/account-settings/login-and-security',
  TRUE,
  'Security: post-incident account secured confirmation.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();

INSERT INTO public.notification_templates (
  tenant_id, key, title, body, channels, email_subject, email_body, sms_body, variables, url, enabled, description
) VALUES (
  NULL,
  'security_admin_mfa_setup_reminder',
  'Set up admin two-step verification',
  'Admin two-step verification will be required from {{enforce_date}}. Set up your authenticator now.',
  ARRAY['push', 'email']::TEXT[],
  'Action required: set up admin 2FA',
  '<p>Your admin role will require two-step verification starting <strong>{{enforce_date}}</strong>.</p><p>Set up an authenticator app before that date to avoid losing access to the admin portal.</p><p><a href="{{app_url}}/admin/security">Open security settings</a></p>',
  NULL,
  ARRAY['enforce_date', 'app_url']::TEXT[],
  '/admin/security',
  TRUE,
  'Security: remind admins to enroll MFA before enforce_all_from date.'
)
ON CONFLICT (key) WHERE (tenant_id IS NULL) DO UPDATE SET
  title = EXCLUDED.title, body = EXCLUDED.body, channels = EXCLUDED.channels,
  email_subject = EXCLUDED.email_subject, email_body = EXCLUDED.email_body, sms_body = EXCLUDED.sms_body,
  variables = EXCLUDED.variables, url = EXCLUDED.url, enabled = EXCLUDED.enabled,
  description = EXCLUDED.description, updated_at = NOW();
