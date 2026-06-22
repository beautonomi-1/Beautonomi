-- Atomic badge_sync dedupe under concurrent mark-read storms (race-safe).
CREATE OR REPLACE FUNCTION public.try_claim_badge_sync_send(
  p_user_id UUID,
  p_app_type TEXT,
  p_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last INTEGER;
BEGIN
  IF p_app_type NOT IN ('customer', 'provider') THEN
    RETURN jsonb_build_object('claimed', false, 'previous_count', NULL);
  END IF;

  IF p_count < 0 OR p_count > 999999 THEN
    RETURN jsonb_build_object('claimed', false, 'previous_count', NULL);
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_app_type, 0)
  );

  SELECT last_count INTO v_last
  FROM user_badge_sync_state
  WHERE user_id = p_user_id AND app_type = p_app_type;

  IF v_last IS NOT NULL AND v_last = p_count THEN
    RETURN jsonb_build_object('claimed', false, 'previous_count', v_last);
  END IF;

  INSERT INTO user_badge_sync_state (user_id, app_type, last_count, updated_at)
  VALUES (p_user_id, p_app_type, p_count, NOW())
  ON CONFLICT (user_id, app_type) DO UPDATE
  SET last_count = EXCLUDED.last_count,
      updated_at = NOW();

  RETURN jsonb_build_object('claimed', true, 'previous_count', v_last);
END;
$$;

REVOKE ALL ON FUNCTION public.try_claim_badge_sync_send(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_claim_badge_sync_send(UUID, TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION public.try_claim_badge_sync_send IS
  'Atomically skip or claim a badge_sync send for (user, app, count). Returns claimed + previous_count for revert on send failure.';
