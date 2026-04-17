-- 486_time_blocks_add_created_by.sql
-- When migration 069 ran before 202, the CREATE TABLE IF NOT EXISTS in 202 was
-- skipped and the DO block only added location_id, block_type, title, notes,
-- is_recurring, recurrence_rule — but NOT created_by.

ALTER TABLE public.time_blocks
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
