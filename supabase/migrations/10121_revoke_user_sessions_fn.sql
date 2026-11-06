-- ============================================================================
-- 10121: Revoke all auth sessions for a user (compromise / admin action)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_all_user_sessions(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  DELETE FROM auth.sessions WHERE user_id = uid;
  DELETE FROM auth.refresh_tokens WHERE user_id = uid::text;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_all_user_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_all_user_sessions(uuid) TO service_role;

-- Revoke specific sessions of one user (e.g. "remove this device"). Refresh tokens cascade.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions_by_ids(uid uuid, session_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  DELETE FROM auth.sessions WHERE user_id = uid AND id = ANY(session_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_user_sessions_by_ids(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions_by_ids(uuid, uuid[]) TO service_role;
