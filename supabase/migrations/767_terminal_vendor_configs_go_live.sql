-- Migration 767: Enable terminal vendor catalog rows for go-live
--
-- Feature flags were enabled in 761, but terminal_vendor_configs.enabled
-- remained false from seed (757). Providers need both flag + config enabled.

UPDATE public.terminal_vendor_configs
SET enabled = true, updated_at = now()
WHERE enabled = false;
