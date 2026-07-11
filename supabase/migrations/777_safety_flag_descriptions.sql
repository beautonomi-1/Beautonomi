-- Make safety feature-flag descriptions factual so superadmins know what each
-- flag actually controls today.
--
-- * safety.panic.enabled  — checked by all three SafetyPanicButton surfaces and
--   enforced by POST /api/me/safety/panic.
-- * safety.enabled        — never read by runtime code; the module on/off switch
--   lives in safety_module_config (Control Plane → Modules → Safety).
-- * safety.check_in.enabled — reserved; the check-in flow is not built yet.

UPDATE feature_flags
SET description = 'Show the safety/panic button in the customer app, provider app, and web booking pages. Also requires the Safety module (Control Plane → Modules → Safety) to be enabled for the environment.'
WHERE feature_key = 'safety.panic.enabled' AND tenant_id IS NULL;

UPDATE feature_flags
SET description = 'Reserved — not read by any app. Use Control Plane → Modules → Safety to turn the safety module on or off per environment.'
WHERE feature_key = 'safety.enabled' AND tenant_id IS NULL;

UPDATE feature_flags
SET description = 'Reserved for the safety check-in flow (not yet live in apps). Has no runtime effect today.'
WHERE feature_key = 'safety.check_in.enabled' AND tenant_id IS NULL;
