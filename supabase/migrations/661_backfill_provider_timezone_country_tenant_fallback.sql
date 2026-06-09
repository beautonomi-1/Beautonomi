-- 661: Backfill `providers.timezone` for NULL/blank rows so every provider
-- carries a truthful IANA zone.
--
-- §Timezone-truthfulness audit 2026-06
-- ------------------------------------------------------------------
-- Root cause: `providers.timezone` (added in 206_provider_business_settings.sql
-- with DEFAULT 'Africa/Johannesburg', commented as an IANA id) can be NULL or
-- blank — e.g. a settings save that clears the field
-- (apps/web/src/app/api/provider/settings/business/route.ts sets
-- `updates.timezone = null` when the user submits an empty string and no zone
-- can be inferred). When the column is NULL/blank, every read-time display path
-- falls back to 'Africa/Johannesburg' (resolveTz in @/lib/dates/provider-tz,
-- safeTimezone in @/lib/bookings/display-datetime, resolveTimezone in
-- @/lib/notifications/notification-service.ts). That is correct for SA but
-- wrong for any provider outside South Africa, and it caused the customer-facing
-- notification time gap (push/SMS quoted a different wall-clock time than the
-- receipt).
--
-- This migration sets the zone from the most reliable signal available, in
-- priority order, and only ever touches rows that are currently NULL or blank.
-- It never overwrites an explicitly set value.
--
-- Derivation priority
-- ------------------------------------------------------------------
--   1. provider_locations.country (primary, else earliest) → IANA zone.
--      `provider_locations.country` is NOT NULL (003_providers.sql), so this is
--      the strongest signal we can evaluate in pure SQL. The mapping mirrors
--      SINGLE_ZONE_IANA_BY_ISO2 / COUNTRY_NAME_TO_ISO2 in
--      apps/web/src/lib/regions/infer-provider-timezone.ts and the prior
--      backfill 514_provider_timezone_location_backfill.sql — the single-zone
--      countries the platform actually operates in (SADC). Multi-zone countries
--      are intentionally NOT guessed from country alone.
--   2. Coordinate → IANA (provider_locations.latitude/longitude): NOT performed
--      here. Accurate coordinate→zone lookup needs the geo-tz shapefile
--      (a JS dependency); it cannot be reproduced in pure SQL without shipping
--      a PostGIS timezone boundary dataset. The application layer already does
--      this on write (inferProviderTimezoneFromLocation), and any residual rows
--      with coordinates but an unmapped country fall through to step 3/4 below.
--   3. tenant.default_timezone (providers.tenant_id → tenants.default_timezone,
--      both NOT NULL). This is the correct per-market default for a provider
--      whose location country is unmapped or whose location row is missing.
--   4. Final fallback: 'Africa/Johannesburg' — matches the existing read-time
--      fallback, guaranteeing no NULL/blank rows remain.
--
-- Safety / idempotency
-- ------------------------------------------------------------------
--   * Every UPDATE is gated on `timezone IS NULL OR btrim(timezone) = ''`, so an
--     explicitly set zone is never overwritten, and re-running the migration is
--     a no-op (the first run leaves zero NULL/blank rows).
--   * Stored UTC timestamps (e.g. bookings.scheduled_at) are NOT touched; this
--     only sets the provider's display timezone.
--   * The column DEFAULT is intentionally left as-is. Removing it would let new
--     un-set inserts go NULL; keeping it preserves a safe non-null floor. The
--     correct zone for NEW providers is set explicitly at onboarding from the
--     selected location (see apps/web/src/app/api/provider/onboarding/route.ts).

BEGIN;

-- Priority 1: derive from the provider's primary (else earliest) location country.
WITH loc AS (
  SELECT DISTINCT ON (pl.provider_id)
    pl.provider_id,
    trim(pl.country) AS country_raw
  FROM public.provider_locations pl
  ORDER BY pl.provider_id, pl.is_primary DESC, pl.created_at ASC
),
country_tz AS (
  SELECT
    loc.provider_id,
    CASE
      WHEN upper(loc.country_raw) IN ('ZA', 'ZAF', 'RSA') THEN 'Africa/Johannesburg'
      WHEN lower(loc.country_raw) IN ('south africa', 'rsa') THEN 'Africa/Johannesburg'
      WHEN upper(loc.country_raw) = 'BW' THEN 'Africa/Gaborone'
      WHEN lower(loc.country_raw) = 'botswana' THEN 'Africa/Gaborone'
      WHEN upper(loc.country_raw) IN ('LS', 'LSO') THEN 'Africa/Maseru'
      WHEN lower(loc.country_raw) = 'lesotho' THEN 'Africa/Maseru'
      WHEN upper(loc.country_raw) IN ('SZ', 'SWZ') THEN 'Africa/Mbabane'
      WHEN lower(loc.country_raw) IN ('eswatini', 'swaziland') THEN 'Africa/Mbabane'
      WHEN upper(loc.country_raw) IN ('NA', 'NAM') THEN 'Africa/Windhoek'
      WHEN lower(loc.country_raw) = 'namibia' THEN 'Africa/Windhoek'
      WHEN upper(loc.country_raw) IN ('ZW', 'ZWE') THEN 'Africa/Harare'
      WHEN lower(loc.country_raw) = 'zimbabwe' THEN 'Africa/Harare'
      WHEN upper(loc.country_raw) IN ('MZ', 'MOZ') THEN 'Africa/Maputo'
      WHEN lower(loc.country_raw) = 'mozambique' THEN 'Africa/Maputo'
      WHEN upper(loc.country_raw) IN ('MW', 'MWI') THEN 'Africa/Blantyre'
      WHEN lower(loc.country_raw) = 'malawi' THEN 'Africa/Blantyre'
      WHEN upper(loc.country_raw) IN ('ZM', 'ZMB') THEN 'Africa/Lusaka'
      WHEN lower(loc.country_raw) = 'zambia' THEN 'Africa/Lusaka'
      WHEN upper(loc.country_raw) IN ('AO', 'AGO') THEN 'Africa/Luanda'
      WHEN lower(loc.country_raw) = 'angola' THEN 'Africa/Luanda'
      ELSE NULL
    END AS tz
  FROM loc
  WHERE coalesce(loc.country_raw, '') <> ''
)
UPDATE public.providers p
SET timezone = country_tz.tz
FROM country_tz
WHERE p.id = country_tz.provider_id
  AND country_tz.tz IS NOT NULL
  AND (p.timezone IS NULL OR btrim(p.timezone) = '');

-- Priority 3: fall back to the provider's tenant default zone for any row still
-- NULL/blank (no location, or an unmapped/multi-zone country).
UPDATE public.providers p
SET timezone = t.default_timezone
FROM public.tenants t
WHERE p.tenant_id = t.id
  AND t.default_timezone IS NOT NULL
  AND btrim(t.default_timezone) <> ''
  AND (p.timezone IS NULL OR btrim(p.timezone) = '');

-- Priority 4: final hard fallback so no NULL/blank rows can remain.
UPDATE public.providers p
SET timezone = 'Africa/Johannesburg'
WHERE p.timezone IS NULL OR btrim(p.timezone) = '';

-- Verification: surface any rows the backfill could not resolve (should be 0).
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining
    FROM public.providers
   WHERE timezone IS NULL OR btrim(timezone) = '';
  IF remaining > 0 THEN
    RAISE EXCEPTION 'provider timezone backfill left % NULL/blank rows', remaining;
  END IF;
END $$;

COMMIT;
