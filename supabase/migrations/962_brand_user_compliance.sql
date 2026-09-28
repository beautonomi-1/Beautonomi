-- Clear brand desk user FKs before auth user delete (additive to compliance_clear_user_references).

CREATE OR REPLACE FUNCTION public.brand_clear_user_references(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  UPDATE public.brand_briefs SET author_id = NULL WHERE author_id = p_user_id;
  UPDATE public.brand_briefs SET reviewer_id = NULL WHERE reviewer_id = p_user_id;
  UPDATE public.brand_campaigns SET owner_id = NULL WHERE owner_id = p_user_id;
  UPDATE public.brand_campaigns SET live_confirmed_by = NULL WHERE live_confirmed_by = p_user_id;
  UPDATE public.brand_placements SET owner_id = NULL WHERE owner_id = p_user_id;
  UPDATE public.brand_metric_entries SET author_id = NULL WHERE author_id = p_user_id;
  UPDATE public.brand_activity SET actor_id = NULL WHERE actor_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.brand_clear_user_references(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_clear_user_references(uuid) TO service_role;
