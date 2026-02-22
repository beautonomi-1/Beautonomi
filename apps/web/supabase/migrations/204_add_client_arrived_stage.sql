-- Migration 204: Add client_arrived to current_stage for in-salon "Client Arrived" flow
-- current_stage is CONTEXT-AWARE based on location_type (at_salon vs at_home).
--
-- AT-SALON (in-salon, incl. online bookings & walk-ins):
--   confirmed → client_arrived → service_started → service_completed
--   Client comes to salon; "Client Arrived" = client checked in.
--
-- AT-HOME (house calls):
--   confirmed → provider_on_way → provider_arrived → service_started → service_completed
--   Provider travels to client; client_arrived does NOT apply.
--
-- Application enforces which stages apply per location_type (see mapStatus, API, sidebar).

-- Drop existing check constraint (PostgreSQL names it tablename_columnname_check)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_current_stage_check;

-- Re-add constraint with client_arrived (all allowed values; context logic in app)
ALTER TABLE bookings ADD CONSTRAINT bookings_current_stage_check
  CHECK (current_stage IS NULL OR current_stage IN (
    'confirmed',
    'client_arrived',   -- In-salon only: client has arrived at the salon
    'provider_on_way',  -- At-home only: provider en route
    'provider_arrived', -- At-home only: provider arrived at client
    'service_started',
    'service_completed'
  ));

COMMENT ON COLUMN bookings.current_stage IS 'Lifecycle stage. At-salon: confirmed, client_arrived, service_started, service_completed. At-home: confirmed, provider_on_way, provider_arrived, service_started, service_completed. Application enforces per location_type.';
