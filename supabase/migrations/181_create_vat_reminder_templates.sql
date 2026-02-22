-- ============================================================================
-- Migration 181: Create Default VAT Remittance Reminder Templates
-- ============================================================================
-- This migration creates default email and SMS templates for VAT remittance reminders
-- Templates are created for 14, 7, 3, and 1 day reminders
-- Uses IF NOT EXISTS to avoid duplicates (no unique constraint required)
-- ============================================================================

-- Email Templates for VAT Reminders
DO $$
BEGIN
  -- 14 Days Reminder
  IF NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'VAT Remittance Reminder - 14 Days') THEN
    INSERT INTO email_templates (name, subject_template, body_template, category, variables, is_html, enabled)
    VALUES (
      'VAT Remittance Reminder - 14 Days',
      'VAT Remittance Due: {{deadline_date}} - {{provider_name}}',
      '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #FF0077;">VAT Remittance Reminder</h2><p>Dear {{provider_name}},</p><p>This is a reminder that your VAT remittance is due in <strong>{{days_until_deadline}} days</strong>.</p><div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;"><p style="margin: 5px 0;"><strong>Remittance Period:</strong> {{period_start}} to {{period_end}}</p><p style="margin: 5px 0;"><strong>Deadline:</strong> {{deadline_date}}</p><p style="margin: 5px 0;"><strong>VAT Amount to Remit:</strong> <span style="color: #FF0077; font-size: 18px; font-weight: bold;">{{vat_collected_formatted}}</span></p><p style="margin: 5px 0;"><strong>VAT Number:</strong> {{vat_number}}</p></div><p>Please ensure you remit this amount to SARS by the deadline to avoid penalties.</p><p style="margin: 20px 0;"><a href="{{sars_efiling_url}}" style="background-color: #FF0077; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Submit via SARS eFiling</a></p><p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions, please contact us at {{support_email}}.</p><p style="margin-top: 20px;">Best regards,<br>The Beautonomi Team</p></div></body></html>',
      'vat_remittance',
      '["provider_name", "vat_number", "period_start", "period_end", "deadline_date", "days_until_deadline", "vat_collected", "vat_collected_formatted", "sars_efiling_url", "support_email"]'::jsonb,
      true,
      true
    );
  END IF;

  -- 7 Days Reminder
  IF NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'VAT Remittance Reminder - 7 Days') THEN
    INSERT INTO email_templates (name, subject_template, body_template, category, variables, is_html, enabled)
    VALUES (
      'VAT Remittance Reminder - 7 Days',
      'URGENT: VAT Remittance Due in 7 Days - {{provider_name}}',
      '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #FF0077;">⚠️ VAT Remittance Reminder - 7 Days</h2><p>Dear {{provider_name}},</p><p><strong>Your VAT remittance is due in 7 days.</strong> Please ensure you submit your payment to SARS on time.</p><div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; border-radius: 5px; margin: 20px 0;"><p style="margin: 5px 0;"><strong>Remittance Period:</strong> {{period_start}} to {{period_end}}</p><p style="margin: 5px 0;"><strong>Deadline:</strong> {{deadline_date}}</p><p style="margin: 5px 0;"><strong>VAT Amount to Remit:</strong> <span style="color: #FF0077; font-size: 20px; font-weight: bold;">{{vat_collected_formatted}}</span></p><p style="margin: 5px 0;"><strong>VAT Number:</strong> {{vat_number}}</p></div><p style="margin: 20px 0;"><a href="{{sars_efiling_url}}" style="background-color: #FF0077; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Submit via SARS eFiling →</a></p><p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions, please contact us at {{support_email}}.</p><p style="margin-top: 20px;">Best regards,<br>The Beautonomi Team</p></div></body></html>',
      'vat_remittance',
      '["provider_name", "vat_number", "period_start", "period_end", "deadline_date", "days_until_deadline", "vat_collected", "vat_collected_formatted", "sars_efiling_url", "support_email"]'::jsonb,
      true,
      true
    );
  END IF;

  -- 3 Days Reminder
  IF NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'VAT Remittance Reminder - 3 Days') THEN
    INSERT INTO email_templates (name, subject_template, body_template, category, variables, is_html, enabled)
    VALUES (
      'VAT Remittance Reminder - 3 Days',
      'URGENT: VAT Remittance Due in 3 Days - {{provider_name}}',
      '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #dc3545;">🚨 VAT Remittance Reminder - 3 Days</h2><p>Dear {{provider_name}},</p><p><strong style="color: #dc3545;">Your VAT remittance is due in 3 days.</strong> Please submit your payment to SARS immediately to avoid penalties.</p><div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; border-radius: 5px; margin: 20px 0;"><p style="margin: 5px 0;"><strong>Remittance Period:</strong> {{period_start}} to {{period_end}}</p><p style="margin: 5px 0;"><strong>Deadline:</strong> {{deadline_date}}</p><p style="margin: 5px 0;"><strong>VAT Amount to Remit:</strong> <span style="color: #dc3545; font-size: 22px; font-weight: bold;">{{vat_collected_formatted}}</span></p><p style="margin: 5px 0;"><strong>VAT Number:</strong> {{vat_number}}</p></div><p style="margin: 20px 0;"><a href="{{sars_efiling_url}}" style="background-color: #dc3545; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">Submit via SARS eFiling NOW →</a></p><p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions, please contact us at {{support_email}}.</p><p style="margin-top: 20px;">Best regards,<br>The Beautonomi Team</p></div></body></html>',
      'vat_remittance',
      '["provider_name", "vat_number", "period_start", "period_end", "deadline_date", "days_until_deadline", "vat_collected", "vat_collected_formatted", "sars_efiling_url", "support_email"]'::jsonb,
      true,
      true
    );
  END IF;

  -- 1 Day Reminder
  IF NOT EXISTS (SELECT 1 FROM email_templates WHERE name = 'VAT Remittance Reminder - 1 Day') THEN
    INSERT INTO email_templates (name, subject_template, body_template, category, variables, is_html, enabled)
    VALUES (
      'VAT Remittance Reminder - 1 Day',
      'FINAL REMINDER: VAT Remittance Due TOMORROW - {{provider_name}}',
      '<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;"><div style="max-width: 600px; margin: 0 auto; padding: 20px;"><h2 style="color: #dc3545;">🚨 FINAL REMINDER: VAT Due TOMORROW</h2><p>Dear {{provider_name}},</p><p><strong style="color: #dc3545; font-size: 18px;">Your VAT remittance is due TOMORROW ({{deadline_date}}).</strong> Please submit your payment to SARS immediately to avoid penalties and interest charges.</p><div style="background-color: #f8d7da; border: 2px solid #dc3545; padding: 20px; border-radius: 5px; margin: 20px 0;"><p style="margin: 5px 0; font-size: 16px;"><strong>Remittance Period:</strong> {{period_start}} to {{period_end}}</p><p style="margin: 5px 0; font-size: 16px;"><strong>Deadline:</strong> <span style="color: #dc3545; font-weight: bold;">{{deadline_date}}</span></p><p style="margin: 5px 0; font-size: 18px;"><strong>VAT Amount to Remit:</strong> <span style="color: #dc3545; font-size: 24px; font-weight: bold;">{{vat_collected_formatted}}</span></p><p style="margin: 5px 0; font-size: 16px;"><strong>VAT Number:</strong> {{vat_number}}</p></div><p style="margin: 20px 0;"><a href="{{sars_efiling_url}}" style="background-color: #dc3545; color: white; padding: 16px 32px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 18px;">Submit via SARS eFiling URGENTLY →</a></p><p style="color: #dc3545; font-weight: bold; margin-top: 20px;">⚠️ Late payments may result in penalties and interest charges from SARS.</p><p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions, please contact us immediately at {{support_email}}.</p><p style="margin-top: 20px;">Best regards,<br>The Beautonomi Team</p></div></body></html>',
      'vat_remittance',
      '["provider_name", "vat_number", "period_start", "period_end", "deadline_date", "days_until_deadline", "vat_collected", "vat_collected_formatted", "sars_efiling_url", "support_email"]'::jsonb,
      true,
      true
    );
  END IF;
END $$;

-- SMS Templates for VAT Reminders
DO $$
BEGIN
  -- 14 Days Reminder
  IF NOT EXISTS (SELECT 1 FROM sms_templates WHERE name = 'VAT Remittance Reminder - 14 Days') THEN
    INSERT INTO sms_templates (name, message_template, category, variables, enabled)
    VALUES (
      'VAT Remittance Reminder - 14 Days',
      'Beautonomi: VAT remittance due {{deadline_date}}. Amount: {{vat_collected_formatted}}. Period: {{period_start}} to {{period_end}}. Submit: {{sars_efiling_url}}',
      'vat_remittance',
      '["deadline_date", "vat_collected_formatted", "period_start", "period_end", "sars_efiling_url"]'::jsonb,
      true
    );
  END IF;

  -- 7 Days Reminder
  IF NOT EXISTS (SELECT 1 FROM sms_templates WHERE name = 'VAT Remittance Reminder - 7 Days') THEN
    INSERT INTO sms_templates (name, message_template, category, variables, enabled)
    VALUES (
      'VAT Remittance Reminder - 7 Days',
      'URGENT: VAT remittance due in 7 days ({{deadline_date}}). Amount: {{vat_collected_formatted}}. Period: {{period_start}} to {{period_end}}. Submit: {{sars_efiling_url}}',
      'vat_remittance',
      '["deadline_date", "vat_collected_formatted", "period_start", "period_end", "sars_efiling_url"]'::jsonb,
      true
    );
  END IF;

  -- 3 Days Reminder
  IF NOT EXISTS (SELECT 1 FROM sms_templates WHERE name = 'VAT Remittance Reminder - 3 Days') THEN
    INSERT INTO sms_templates (name, message_template, category, variables, enabled)
    VALUES (
      'VAT Remittance Reminder - 3 Days',
      'URGENT: VAT remittance due in 3 days ({{deadline_date}}). Amount: {{vat_collected_formatted}}. Period: {{period_start}} to {{period_end}}. Submit NOW: {{sars_efiling_url}}',
      'vat_remittance',
      '["deadline_date", "vat_collected_formatted", "period_start", "period_end", "sars_efiling_url"]'::jsonb,
      true
    );
  END IF;

  -- 1 Day Reminder
  IF NOT EXISTS (SELECT 1 FROM sms_templates WHERE name = 'VAT Remittance Reminder - 1 Day') THEN
    INSERT INTO sms_templates (name, message_template, category, variables, enabled)
    VALUES (
      'VAT Remittance Reminder - 1 Day',
      'FINAL REMINDER: VAT remittance due TOMORROW ({{deadline_date}}). Amount: {{vat_collected_formatted}}. Period: {{period_start}} to {{period_end}}. Submit URGENTLY: {{sars_efiling_url}}',
      'vat_remittance',
      '["deadline_date", "vat_collected_formatted", "period_start", "period_end", "sars_efiling_url"]'::jsonb,
      true
    );
  END IF;
END $$;

-- Add comments
COMMENT ON TABLE email_templates IS 'Email notification templates, including VAT remittance reminders';
COMMENT ON TABLE sms_templates IS 'SMS notification templates, including VAT remittance reminders';
