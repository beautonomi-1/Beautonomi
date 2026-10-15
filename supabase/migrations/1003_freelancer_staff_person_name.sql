-- 1003_freelancer_staff_person_name.sql
--
-- A freelancer's own provider_staff row is the person clients book. Onboarding
-- captures that person's name (owner_name -> users.full_name), but some rows
-- were stored with the business name (inline onboarding fallback) or the
-- 'Owner' placeholder (ensure_* RPCs when full_name was empty). Booking
-- history, receipts, and custom offers read provider_staff.name directly.
--
-- Only rewrites rows that still hold the business name or the placeholder,
-- so a name the freelancer set themselves is kept.

UPDATE provider_staff ps
SET    name       = btrim(u.full_name),
       updated_at = NOW()
FROM   providers p
JOIN   users u ON u.id = p.user_id
WHERE  ps.provider_id   = p.id
  AND  ps.user_id       = p.user_id
  AND  p.business_type  = 'freelancer'
  AND  NULLIF(btrim(u.full_name), '') IS NOT NULL
  AND  (
         lower(btrim(ps.name)) = 'owner'
      OR btrim(ps.name) = btrim(p.business_name)
      )
  AND  btrim(ps.name) IS DISTINCT FROM btrim(u.full_name);
