-- §Launch-audit 2026-04-18
-- Historically, the provider onboarding wizard and the legacy
-- business-details settings page accepted any free-text string for
-- `providers.timezone`. A handful of records ended up with offset-style
-- labels like "GMT+2", "UTC-05", "+0200". Those values are NOT valid
-- IANA identifiers, and `Intl.DateTimeFormat({ timeZone: ... })` throws
-- on them. That was the root cause of the 500s on /api/availability
-- the user reported at launch ("Failed to load resource: 500"). The
-- application side now validates on write (see
-- apps/web/src/app/api/provider/settings/business/route.ts) and fails
-- soft on read (see apps/web/src/lib/availability/time-utils.ts). This
-- migration rewrites the legacy values in-place so every `providers`
-- row has a zone that round-trips cleanly through `Intl.DateTimeFormat`.
--
-- We intentionally map "GMT+X" → "Etc/GMT-X" (POSIX sign flip — `Etc/GMT-2`
-- is two hours AHEAD of UTC, which is what most humans mean by "GMT+2").
-- The Etc/GMT zones have a fixed offset and do NOT observe DST, which is
-- semantically equivalent to the legacy behaviour (the engine treated
-- "GMT+2" as a fixed offset too). Providers who actually live in a DST
-- zone (e.g. Madrid, Berlin) should fix their timezone via Settings →
-- Business, where the write path now validates against IANA and would
-- accept "Europe/Madrid".

DO $$
DECLARE
  legacy RECORD;
  new_tz TEXT;
  sign_char TEXT;
  offset_hours INT;
  offset_mins INT;
  flipped_sign TEXT;
BEGIN
  FOR legacy IN
    SELECT id, timezone
    FROM public.providers
    WHERE timezone IS NOT NULL
      AND timezone NOT LIKE '%/%'       -- heuristic: real IANA ids contain '/'
      AND timezone NOT IN ('UTC', 'GMT', 'Z')
  LOOP
    -- Pattern match the raw value against our known legacy shapes.
    -- We only rewrite values we can confidently normalise — anything
    -- else is left alone (the application layer will fall back to UTC
    -- and log a warning so ops can hand-fix it).
    IF legacy.timezone ~ '^(GMT|UTC)?[+-]\d{1,2}(:?\d{2})?$' THEN
      sign_char    := substring(legacy.timezone FROM '[+-]');
      offset_hours := (substring(legacy.timezone FROM '[+-](\d{1,2})'))::INT;
      offset_mins  := COALESCE(
        (substring(legacy.timezone FROM '[+-]\d{1,2}:?(\d{2})$'))::INT,
        0
      );

      -- Etc/GMT zones do not support sub-hour offsets — skip any rows
      -- with a half-hour / 45-minute offset and let ops fix them by
      -- hand (e.g. "+05:30" → "Asia/Kolkata").
      IF offset_mins <> 0 THEN
        RAISE NOTICE 'provider % has sub-hour offset timezone %, skipping', legacy.id, legacy.timezone;
        CONTINUE;
      END IF;

      IF offset_hours > 14 THEN
        RAISE NOTICE 'provider % has out-of-range offset %, skipping', legacy.id, legacy.timezone;
        CONTINUE;
      END IF;

      -- Flip sign per POSIX: "GMT+2" (two hours ahead of UTC) → "Etc/GMT-2".
      flipped_sign := CASE WHEN sign_char = '+' THEN '-' ELSE '+' END;
      -- "Etc/GMT+0" and "Etc/GMT-0" are both valid aliases for UTC; we
      -- collapse to plain "UTC" for clarity when the offset is zero.
      IF offset_hours = 0 THEN
        new_tz := 'UTC';
      ELSE
        new_tz := 'Etc/GMT' || flipped_sign || offset_hours::TEXT;
      END IF;

      UPDATE public.providers
         SET timezone = new_tz
       WHERE id = legacy.id;

      RAISE NOTICE 'provider % timezone: % → %', legacy.id, legacy.timezone, new_tz;
    ELSE
      RAISE NOTICE 'provider % has unrecognised timezone %, leaving as-is', legacy.id, legacy.timezone;
    END IF;
  END LOOP;
END $$;

-- Sanity: after the rewrite, every non-null value should either be UTC,
-- an Etc/GMT±N zone, or a full region/zone identifier. We don't add a
-- CHECK constraint (too easy to break with a valid-but-unknown-to-pg
-- alias), but we surface a count so the deploy log flags unmigrated rows.
DO $$
DECLARE
  suspect INT;
BEGIN
  SELECT COUNT(*) INTO suspect
    FROM public.providers
   WHERE timezone IS NOT NULL
     AND timezone NOT LIKE '%/%'
     AND timezone NOT IN ('UTC', 'GMT', 'Z');
  IF suspect > 0 THEN
    RAISE NOTICE '% provider rows still have non-IANA timezone values after migration; ops to review.', suspect;
  END IF;
END $$;
