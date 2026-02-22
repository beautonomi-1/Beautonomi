-- Beautonomi Database Migration
-- 205_provider_total_bookings_completed_only.sql
-- Provider total_bookings and reward/achievement points should only count COMPLETED appointments.
-- This replaces the trigger that incremented on every booking insert with one that only counts completed.

-- Drop the old triggers that count all bookings
DROP TRIGGER IF EXISTS on_booking_created_update_stats ON bookings;
DROP TRIGGER IF EXISTS on_booking_deleted_update_stats ON bookings;

-- Replace the function to only count completed bookings
CREATE OR REPLACE FUNCTION update_provider_booking_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only increment when a new booking is created with status 'completed' (rare but possible)
    IF NEW.status = 'completed' THEN
      UPDATE providers
      SET total_bookings = total_bookings + 1
      WHERE id = NEW.provider_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Status changed TO completed: increment
    IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
      UPDATE providers
      SET total_bookings = total_bookings + 1
      WHERE id = NEW.provider_id;
    -- Status changed FROM completed (e.g. cancelled): decrement
    ELSIF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
      UPDATE providers
      SET total_bookings = GREATEST(total_bookings - 1, 0)
      WHERE id = NEW.provider_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement if the deleted booking was completed
    IF OLD.status = 'completed' THEN
      UPDATE providers
      SET total_bookings = GREATEST(total_bookings - 1, 0)
      WHERE id = OLD.provider_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers: INSERT, UPDATE, DELETE
CREATE TRIGGER on_booking_created_update_stats
  AFTER INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_provider_booking_stats();

CREATE TRIGGER on_booking_updated_update_stats
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_provider_booking_stats();

CREATE TRIGGER on_booking_deleted_update_stats
  AFTER DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_provider_booking_stats();

-- Recalculate providers.total_bookings from actual completed bookings (fix existing data)
UPDATE providers p
SET total_bookings = COALESCE(
  (SELECT COUNT(*)::INTEGER FROM bookings b WHERE b.provider_id = p.id AND b.status = 'completed'),
  0
);
