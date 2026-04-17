-- Migration: Create offering_staff view
-- The application code references "offering_staff" but the underlying table is "staff_services".
-- This view provides a consistent name that matches the PostgREST relationship naming
-- used in offerings embeds (offering_staff!left(staff_id)) and direct .from("offering_staff") queries.

CREATE OR REPLACE VIEW offering_staff AS
SELECT
  staff_id,
  offering_id,
  provider_id,
  created_at
FROM staff_services;

COMMENT ON VIEW offering_staff IS 'View over staff_services for PostgREST relationship compatibility';

-- Grant the same access as the underlying table
GRANT SELECT ON offering_staff TO anon, authenticated, service_role;

-- Allow inserts/updates/deletes through the view (it's a simple 1:1 view on a single table)
CREATE OR REPLACE RULE offering_staff_insert AS ON INSERT TO offering_staff
  DO INSTEAD INSERT INTO staff_services (staff_id, offering_id, provider_id)
  VALUES (NEW.staff_id, NEW.offering_id, NEW.provider_id);

CREATE OR REPLACE RULE offering_staff_update AS ON UPDATE TO offering_staff
  DO INSTEAD UPDATE staff_services
  SET staff_id = NEW.staff_id, offering_id = NEW.offering_id, provider_id = NEW.provider_id
  WHERE staff_id = OLD.staff_id AND offering_id = OLD.offering_id;

CREATE OR REPLACE RULE offering_staff_delete AS ON DELETE TO offering_staff
  DO INSTEAD DELETE FROM staff_services
  WHERE staff_id = OLD.staff_id AND offering_id = OLD.offering_id;
