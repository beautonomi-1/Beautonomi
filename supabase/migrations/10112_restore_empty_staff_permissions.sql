-- 10109 merged issue_refunds into every non-null permissions object.
-- An empty object {} is how "use role defaults" is stored. That merge turned
-- those rows into {"issue_refunds": true|false} only, so staff lost every other
-- permission. Restore those migration artifacts to {}.

UPDATE public.provider_staff
SET permissions = '{}'::jsonb
WHERE permissions = '{"issue_refunds": true}'::jsonb
   OR permissions = '{"issue_refunds": false}'::jsonb;
