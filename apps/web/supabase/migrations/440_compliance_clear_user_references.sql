-- Removes / nulls rows that reference public.users(id) or auth.users(id) with default NO ACTION,
-- so auth.admin.deleteUser can cascade public.users and related data (GDPR / regulatory erasure).

CREATE OR REPLACE FUNCTION public.compliance_clear_user_references(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Booking / charges (NO ACTION on users)
  DELETE FROM booking_audit_log WHERE created_by = p_user_id;
  DELETE FROM additional_charges WHERE requested_by = p_user_id;
  UPDATE booking_holds SET created_by_user_id = NULL WHERE created_by_user_id = p_user_id;

  -- Support
  UPDATE support_tickets SET assigned_to = NULL WHERE assigned_to = p_user_id;

  -- Staff / scheduling
  UPDATE staff_time_off SET approved_by = NULL WHERE approved_by = p_user_id;
  UPDATE time_blocks SET created_by = NULL WHERE created_by = p_user_id;

  -- Other users pointing at this user
  UPDATE users SET referred_by = NULL WHERE referred_by = p_user_id;
  UPDATE users SET identity_verification_reviewed_by = NULL WHERE identity_verification_reviewed_by = p_user_id;

  -- Identity verification reviews
  UPDATE user_verifications SET reviewed_by = NULL WHERE reviewed_by = p_user_id;

  -- AI / reporting (FK to auth.users)
  DELETE FROM ai_usage_log WHERE actor_user_id = p_user_id;
  DELETE FROM report_schedules WHERE created_by = p_user_id;

  -- Payment ops (FK to auth.users)
  DELETE FROM payment_fee_adjustments WHERE created_by = p_user_id;
  UPDATE payment_fee_adjustments SET reconciled_by = NULL WHERE reconciled_by = p_user_id;
  DELETE FROM fee_reconciliations WHERE created_by = p_user_id;
  UPDATE fee_reconciliations SET reviewed_by = NULL WHERE reviewed_by = p_user_id;
  UPDATE payment_gateway_fee_configs SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE payment_gateway_fee_configs SET updated_by = NULL WHERE updated_by = p_user_id;

  -- Commerce
  UPDATE product_return_requests SET resolved_by = NULL WHERE resolved_by = p_user_id;
  UPDATE product_orders SET staff_id = NULL WHERE staff_id = p_user_id;

  -- Booking payments (optional actor)
  UPDATE booking_payments SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE booking_refunds SET created_by = NULL WHERE created_by = p_user_id;

  -- Explore (redundant with ON DELETE SET NULL but safe)
  UPDATE explore_posts SET created_by_user_id = NULL WHERE created_by_user_id = p_user_id;

  -- Sales
  UPDATE sales SET created_by = NULL WHERE created_by = p_user_id;

  -- Templates
  UPDATE email_templates SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE sms_templates SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE email_template_versions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE sms_template_versions SET created_by = NULL WHERE created_by = p_user_id;

  -- Webhooks / system
  UPDATE webhook_endpoints SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE system_health_api_keys SET created_by = NULL WHERE created_by = p_user_id;

  -- Feature flags (auth.users)
  UPDATE feature_flags SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE feature_flags SET updated_by = NULL WHERE updated_by = p_user_id;

  -- Amplitude
  UPDATE amplitude_integration_config SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE amplitude_integration_config SET updated_by = NULL WHERE updated_by = p_user_id;

  -- Profile questions
  UPDATE profile_questions SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE profile_questions SET updated_by = NULL WHERE updated_by = p_user_id;

  -- Platform zones
  UPDATE platform_zones SET created_by = NULL WHERE created_by = p_user_id;

  -- Control plane (auth.users)
  UPDATE config_change_log SET changed_by = NULL WHERE changed_by = p_user_id;
END;
$$;

COMMENT ON FUNCTION public.compliance_clear_user_references(UUID) IS
  'Superadmin compliance: clear FK blockers before auth.admin.deleteUser (full account erasure).';

REVOKE ALL ON FUNCTION public.compliance_clear_user_references(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compliance_clear_user_references(UUID) TO service_role;
