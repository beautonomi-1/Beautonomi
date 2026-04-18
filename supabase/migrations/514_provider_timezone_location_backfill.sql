-- Backfill `providers.timezone` when NULL/blank using primary-or-first `provider_locations.country`.
-- Must stay aligned with `SINGLE_ZONE_IANA_BY_ISO2` / `COUNTRY_NAME_TO_ISO2` in
-- apps/web/src/lib/regions/infer-provider-timezone.ts (single-zone countries only).

WITH loc AS (
  SELECT DISTINCT ON (pl.provider_id)
    pl.provider_id,
    trim(pl.country) AS country_raw
  FROM public.provider_locations pl
  ORDER BY pl.provider_id, pl.is_primary DESC, pl.created_at ASC
),
mapped AS (
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
SET timezone = mapped.tz
FROM mapped
WHERE p.id = mapped.provider_id
  AND mapped.tz IS NOT NULL
  AND (p.timezone IS NULL OR trim(p.timezone) = '');
