-- Beautonomi Database Migration
-- 681_validate_portal_token_unlimited_uses.sql
--
-- Guest booking portal links are minted with max_uses = -1 (unlimited reads
-- until expiry). use_portal_token() already special-cases -1, but
-- validate_portal_token() did not: with max_uses = -1 the check
-- `usage_count >= max_uses` is always true (0 >= -1), so every unlimited
-- token was rejected with 'Token usage limit exceeded'.
--
-- This recreates validate_portal_token with -1 treated as unlimited,
-- preserving SECURITY DEFINER, hardened search_path, and grants.

CREATE OR REPLACE FUNCTION public.validate_portal_token(p_token TEXT)
RETURNS TABLE (
    booking_id UUID,
    is_valid BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    v_token_record portal_tokens%ROWTYPE;
BEGIN
    -- Find token
    SELECT * INTO v_token_record
    FROM portal_tokens
    WHERE token = p_token
    AND is_active = true;

    -- Token not found
    IF NOT FOUND THEN
        RETURN QUERY SELECT NULL::UUID, false, 'Token not found'::TEXT;
        RETURN;
    END IF;

    -- Token expired
    IF v_token_record.expires_at < NOW() THEN
        RETURN QUERY SELECT v_token_record.booking_id, false, 'Token expired'::TEXT;
        RETURN;
    END IF;

    -- Token already used (if single-use)
    IF v_token_record.max_uses = 1 AND v_token_record.used_at IS NOT NULL THEN
        RETURN QUERY SELECT v_token_record.booking_id, false, 'Token already used'::TEXT;
        RETURN;
    END IF;

    -- Usage limit exceeded (-1 = unlimited uses, matching use_portal_token)
    IF v_token_record.max_uses <> -1
       AND v_token_record.usage_count >= v_token_record.max_uses THEN
        RETURN QUERY SELECT v_token_record.booking_id, false, 'Token usage limit exceeded'::TEXT;
        RETURN;
    END IF;

    -- Token is valid
    RETURN QUERY SELECT v_token_record.booking_id, true, 'Valid'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Re-assert grants (anonymous portal flows call this via PostgREST)
GRANT EXECUTE ON FUNCTION public.validate_portal_token(TEXT) TO anon, authenticated, service_role;
