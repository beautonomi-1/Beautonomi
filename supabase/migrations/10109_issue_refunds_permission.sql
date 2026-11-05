-- issue_refunds: separate from process_payments (record payments vs refund customers).

CREATE OR REPLACE FUNCTION public.get_default_permissions_for_role(p_role TEXT)
RETURNS JSONB AS $$
BEGIN
    CASE p_role
        WHEN 'owner' THEN
            RETURN '{
                "view_calendar": true,
                "calendar_scope": "all",
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": true,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "issue_refunds": true,
                "view_reports": true,
                "manage_finance": true,
                "manage_marketing": true,
                "view_services": true,
                "edit_services": true,
                "view_products": true,
                "edit_products": true,
                "view_team": true,
                "manage_team": true,
                "view_settings": true,
                "edit_settings": true,
                "view_clients": true,
                "edit_clients": true,
                "view_reviews": true,
                "edit_reviews": true,
                "view_messages": true,
                "send_messages": true,
                "create_explore_posts": true,
                "rate_clients": true,
                "view_client_ratings": true,
                "view_own_earnings": true
            }'::jsonb;
        WHEN 'manager' THEN
            RETURN '{
                "view_calendar": true,
                "calendar_scope": "all",
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": false,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "issue_refunds": true,
                "view_reports": true,
                "manage_finance": true,
                "manage_marketing": true,
                "view_services": true,
                "edit_services": true,
                "view_products": true,
                "edit_products": true,
                "view_team": true,
                "manage_team": true,
                "view_settings": true,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": true,
                "view_reviews": true,
                "edit_reviews": false,
                "view_messages": true,
                "send_messages": true,
                "create_explore_posts": true,
                "rate_clients": true,
                "view_client_ratings": true,
                "view_own_earnings": true
            }'::jsonb;
        WHEN 'employee' THEN
            RETURN '{
                "view_calendar": true,
                "calendar_scope": "own",
                "create_appointments": false,
                "edit_appointments": true,
                "cancel_appointments": false,
                "delete_appointments": false,
                "view_sales": false,
                "create_sales": false,
                "process_payments": false,
                "issue_refunds": false,
                "view_reports": false,
                "manage_finance": false,
                "manage_marketing": false,
                "view_services": true,
                "edit_services": false,
                "view_products": true,
                "edit_products": false,
                "view_team": false,
                "manage_team": false,
                "view_settings": false,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": true,
                "view_reviews": false,
                "edit_reviews": false,
                "view_messages": true,
                "send_messages": true,
                "create_explore_posts": false,
                "rate_clients": false,
                "view_client_ratings": false,
                "view_own_earnings": true
            }'::jsonb;
        ELSE
            RETURN '{}'::jsonb;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

-- Backfill explicit JSON on staff rows.
UPDATE public.provider_staff ps
SET permissions = COALESCE(ps.permissions, '{}'::jsonb) || jsonb_build_object(
  'issue_refunds',
  CASE
    WHEN ps.role IN ('owner', 'manager') OR ps.is_admin IS TRUE THEN true
    ELSE false
  END
)
WHERE ps.permissions IS NOT NULL;

-- Custom roles: default off unless already set.
UPDATE public.provider_roles pr
SET permissions = pr.permissions || '{"issue_refunds": false}'::jsonb
WHERE pr.permissions IS NOT NULL
  AND NOT (pr.permissions ? 'issue_refunds');
