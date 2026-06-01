-- Normalize stored Paystack Virtual Terminal destination numbers to E.164.
--
-- Paystack's Virtual Terminal API requires destination targets in international
-- (E.164) format, e.g. "+27824891972". Some existing setup requests stored local
-- South African numbers (e.g. "0824891972"), which Paystack rejects when an admin
-- tries to create the terminal from the request. This backfills the affected rows
-- so they can be fulfilled without re-submitting.

-- Idempotent best-effort normalizer (South Africa default). Mirrors the app-side
-- normalizeWhatsAppTarget behavior for the formats we actually store.
CREATE OR REPLACE FUNCTION pg_temp.normalize_za_msisdn(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
BEGIN
  IF raw IS NULL OR btrim(raw) = '' THEN
    RETURN NULL;
  END IF;

  -- Already international: keep, but strip formatting characters.
  IF left(btrim(raw), 1) = '+' THEN
    RETURN '+' || regexp_replace(btrim(raw), '\D', '', 'g');
  END IF;

  digits := regexp_replace(raw, '\D', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;

  -- Local SA format: 0XXXXXXXXX (10 digits) -> +27XXXXXXXXX
  IF length(digits) = 10 AND left(digits, 1) = '0' THEN
    RETURN '+27' || substr(digits, 2);
  END IF;

  -- Country code present without '+': 27XXXXXXXXX (11 digits) -> +27XXXXXXXXX
  IF length(digits) = 11 AND left(digits, 2) = '27' THEN
    RETURN '+' || digits;
  END IF;

  -- Fallback: assume it already carries a country code and just add '+'.
  RETURN '+' || digits;
END;
$$;

-- 1) Scalar destination_target column.
UPDATE public.provider_paystack_virtual_terminal_setup_requests
SET destination_target = pg_temp.normalize_za_msisdn(destination_target)
WHERE status IN ('requested', 'in_progress')
  AND destination_target IS NOT NULL
  AND left(btrim(destination_target), 1) <> '+';

-- 2) destinations JSONB array (rebuild each element with a normalized target).
UPDATE public.provider_paystack_virtual_terminal_setup_requests AS s
SET destinations = sub.new_destinations
FROM (
  SELECT
    r.id,
    jsonb_agg(
      CASE
        WHEN elem ? 'target' AND pg_temp.normalize_za_msisdn(elem->>'target') IS NOT NULL
          THEN jsonb_set(elem, '{target}', to_jsonb(pg_temp.normalize_za_msisdn(elem->>'target')))
        ELSE elem
      END
      ORDER BY ord
    ) AS new_destinations
  FROM public.provider_paystack_virtual_terminal_setup_requests r,
       jsonb_array_elements(r.destinations) WITH ORDINALITY AS d(elem, ord)
  WHERE r.status IN ('requested', 'in_progress')
    AND jsonb_typeof(r.destinations) = 'array'
    AND jsonb_array_length(r.destinations) > 0
  GROUP BY r.id
) AS sub
WHERE s.id = sub.id
  AND s.destinations IS DISTINCT FROM sub.new_destinations;
