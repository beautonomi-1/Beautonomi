-- ============================================================================
-- 515: Canonical unique referral codes on public.users (not handle / name-based)
-- ============================================================================
-- Display + ?ref= previously used handle or id prefix — ambiguous across users.
-- Every user gets a stable random alphanumeric code; handle remains a separate username.

CREATE OR REPLACE FUNCTION public.generate_unique_user_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_chars CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_len CONSTANT INT := 10;
  v_code TEXT;
  v_i INT;
  v_taken BOOLEAN;
BEGIN
  LOOP
    v_code := '';
    FOR v_i IN 1..v_len LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    SELECT EXISTS(
      SELECT 1 FROM users u WHERE u.referral_code = v_code
    ) INTO v_taken;
    EXIT WHEN NOT v_taken;
  END LOOP;
  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.generate_unique_user_referral_code() IS
  'Random 10-char A-Z2-9 code (no ambiguous 0/O/1/I); unique among users.referral_code.';

-- Backfill NULL / blank
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM users WHERE referral_code IS NULL OR trim(coalesce(referral_code, '')) = '' LOOP
    UPDATE users
    SET referral_code = public.generate_unique_user_referral_code(),
        updated_at = NOW()
    WHERE id = r.id;
  END LOOP;
END $$;

-- Resolve duplicate referral_code values (should be rare)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH d AS (
      SELECT id,
             row_number() OVER (PARTITION BY referral_code ORDER BY created_at NULLS LAST, id) AS rn
      FROM users
      WHERE referral_code IS NOT NULL
    )
    SELECT id FROM d WHERE rn > 1
  LOOP
    UPDATE users
    SET referral_code = public.generate_unique_user_referral_code(),
        updated_at = NOW()
    WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE users
  ALTER COLUMN referral_code SET NOT NULL;

DROP INDEX IF EXISTS idx_users_referral_code;
CREATE UNIQUE INDEX idx_users_referral_code_unique
  ON users (referral_code);

-- New signups: assign code before insert completes
CREATE OR REPLACE FUNCTION public.set_users_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR trim(NEW.referral_code) = '' THEN
    NEW.referral_code := public.generate_unique_user_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_set_referral_code ON users;
CREATE TRIGGER trg_users_set_referral_code
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_users_referral_code();

-- Prevent clients from swapping to another user’s code
CREATE OR REPLACE FUNCTION public.preserve_users_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.referral_code IS NOT NULL THEN
    NEW.referral_code := OLD.referral_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_preserve_referral_code ON users;
CREATE TRIGGER trg_users_preserve_referral_code
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_users_referral_code();
