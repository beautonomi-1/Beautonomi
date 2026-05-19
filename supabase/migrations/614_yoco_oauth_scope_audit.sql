-- 614_yoco_oauth_scope_audit.sql
--
-- §Yoco-OAuth 2026-05 (audit): Yoco's published OAuth scope catalog
-- (https://developer.yoco.com/docs/api/authentication/scopes) no longer lists
-- the `business/payments:*`, `business/refunds:*`, or `business/webhooks:*`
-- scopes that migration 610 seeded as `tenant_yoco_oauth_apps.default_scopes`.
-- Requesting an unknown scope on iam.yoco.com/oauth2/authorize causes the
-- entire consent flow to fail before a provider can grant access. This
-- migration realigns the stored defaults with the scopes Beautonomi actually
-- needs to call Web POS (`business/webpos:*`) and auto-register webhook
-- subscriptions (`application/webhooks:write`), plus the read-only reporting
-- scopes used by the reconciliation report.
--
-- The change is idempotent and only touches rows whose `default_scopes` still
-- contain at least one of the now-invalid tokens. Existing access tokens
-- minted under the old scopes continue to work until they expire — providers
-- only need to redo the consent screen if Yoco revokes the connection.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Update the canonical column default so any future INSERT picks up the
--    corrected scope set without relying on application code.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.tenant_yoco_oauth_apps
    ALTER COLUMN default_scopes
    SET DEFAULT 'openid offline_access business/webpos:read business/webpos:write application/webhooks:write business/orders:read business/payouts:read';

COMMENT ON COLUMN public.tenant_yoco_oauth_apps.default_scopes IS
    'Space-separated OAuth scopes requested from Yoco. Must only contain scopes published at developer.yoco.com/docs/api/authentication/scopes; unknown scopes break the consent flow.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Repair existing rows. Any row whose stored scope string contains one of
--    the now-invalid tokens is rewritten to the corrected default. Rows that
--    have already been customised to a clean scope set are left untouched.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.tenant_yoco_oauth_apps
SET default_scopes = 'openid offline_access business/webpos:read business/webpos:write application/webhooks:write business/orders:read business/payouts:read',
    updated_at = NOW()
WHERE default_scopes ~ '(^|[[:space:]])business/(payments|refunds|webhooks):(read|write)([[:space:]]|$)';
