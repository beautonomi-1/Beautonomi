-- ============================================================================
-- Migration 223: Add create_explore_posts to Staff Default Permissions
-- ============================================================================
-- Adds create_explore_posts to owner and manager default permissions.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_default_permissions_for_role(p_role TEXT)
RETURNS JSONB AS $$
BEGIN
    CASE p_role
        WHEN 'owner' THEN
            RETURN '{
                "view_calendar": true,
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": true,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "view_reports": true,
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
                "create_explore_posts": true
            }'::jsonb;
        WHEN 'manager' THEN
            RETURN '{
                "view_calendar": true,
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": false,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "view_reports": true,
                "view_services": true,
                "edit_services": true,
                "view_products": true,
                "edit_products": true,
                "view_team": true,
                "manage_team": false,
                "view_settings": true,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": true,
                "create_explore_posts": true
            }'::jsonb;
        WHEN 'employee' THEN
            RETURN '{
                "view_calendar": true,
                "create_appointments": true,
                "edit_appointments": false,
                "cancel_appointments": false,
                "delete_appointments": false,
                "view_sales": true,
                "create_sales": false,
                "process_payments": false,
                "view_reports": false,
                "view_services": true,
                "edit_services": false,
                "view_products": true,
                "edit_products": false,
                "view_team": false,
                "manage_team": false,
                "view_settings": false,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": false
            }'::jsonb;
        ELSE
            RETURN '{}'::jsonb;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
