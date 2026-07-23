-- ============================================================================
-- Migration 811: Staff floor-ops default permissions (employee + manager packs)
-- ============================================================================
-- Aligns SQL defaults with TS getDefaultStaffPermissionsForDbRole:
-- - employee: full floor day-ops (bookings, POS, clients) without bank/settings/reports
-- - manager: ops + manage_team + reports; no edit_settings
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
                "view_reviews": true,
                "edit_reviews": true,
                "view_messages": true,
                "send_messages": true,
                "create_explore_posts": true,
                "rate_clients": true,
                "view_client_ratings": true
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
                "view_client_ratings": true
            }'::jsonb;
        WHEN 'employee' THEN
            RETURN '{
                "view_calendar": true,
                "create_appointments": true,
                "edit_appointments": true,
                "cancel_appointments": true,
                "delete_appointments": false,
                "view_sales": true,
                "create_sales": true,
                "process_payments": true,
                "view_reports": false,
                "view_services": true,
                "edit_services": false,
                "view_products": true,
                "edit_products": false,
                "view_team": true,
                "manage_team": false,
                "view_settings": false,
                "edit_settings": false,
                "view_clients": true,
                "edit_clients": true,
                "view_reviews": true,
                "edit_reviews": false,
                "view_messages": true,
                "send_messages": true,
                "create_explore_posts": false,
                "rate_clients": false,
                "view_client_ratings": false
            }'::jsonb;
        ELSE
            RETURN '{}'::jsonb;
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION get_default_permissions_for_role IS 'Returns default permissions JSONB for owner/manager/employee floor-ops packs';
