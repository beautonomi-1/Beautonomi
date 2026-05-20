-- 617_yoco_oauth_webhook_read_scope.sql
--
-- Yoco's current Create webhook subscription endpoint requires BOTH
-- `application/webhooks:read` and `application/webhooks:write`.
-- Migration 614 intentionally removed deprecated `business/webhooks:*` scopes
-- but kept only the write application scope, which can make auto-registration
-- fail during OAuth callback even after the provider grants consent.

ALTER TABLE public.tenant_yoco_oauth_apps
    ALTER COLUMN default_scopes
    SET DEFAULT 'openid offline_access business/webpos:read business/webpos:write application/webhooks:read application/webhooks:write business/orders:read business/payouts:read';

UPDATE public.tenant_yoco_oauth_apps
SET default_scopes = regexp_replace(
        trim(default_scopes || ' application/webhooks:read'),
        '[[:space:]]+',
        ' ',
        'g'
    ),
    updated_at = NOW()
WHERE default_scopes !~ '(^|[[:space:]])application/webhooks:read([[:space:]]|$)'
  AND default_scopes ~ '(^|[[:space:]])application/webhooks:write([[:space:]]|$)';
