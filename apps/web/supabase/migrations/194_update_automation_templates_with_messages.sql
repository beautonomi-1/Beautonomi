-- ============================================================================
-- Migration 194: Update Automation Templates with Message Content
-- ============================================================================
-- This migration updates existing automation templates to include message
-- templates in action_config, so providers can customize messages.
-- ============================================================================

-- Update all template action_config to include message templates
UPDATE marketing_automations
SET action_config = jsonb_build_object(
    'message_template', CASE name
        -- REMINDERS
        WHEN '48h Appointment Reminder' THEN 
            'Hi {{name}}, this is a friendly reminder that you have an appointment with us in 48 hours on {{appointment_date}}. We''re looking forward to seeing you!'
        WHEN '24h Upcoming Reminder' THEN 
            'Hi {{name}}, just a reminder that your appointment is tomorrow at {{appointment_date}}. See you soon!'
        WHEN '1h Final Reminder' THEN 
            'Hi {{name}}, your appointment is in 1 hour. We''ll see you soon!'
        
        -- APPOINTMENT UPDATES
        WHEN 'Appointment Rescheduled' THEN 
            'Hi {{name}}, we''ve rescheduled your appointment. Your new appointment is on {{appointment_date}}. Looking forward to seeing you!'
        WHEN 'No-Show Follow-up' THEN 
            'Hi {{name}}, we noticed you weren''t able to make it to your appointment. We understand things come up. Would you like to reschedule?'
        
        -- INCREASE BOOKINGS
        WHEN 'Thank You After Service' THEN 
            'Hi {{name}}, thank you for choosing us today! We hope you had a great experience. We''d love to see you again soon!'
        WHEN 'Review Request' THEN 
            'Hi {{name}}, we''d love to hear about your experience! Please leave us a review - your feedback helps us serve you better.'
        WHEN 'Re-book Reminder (3 Days)' THEN 
            'Hi {{name}}, it''s been 3 days since your last visit. Ready to book your next appointment? We''re here when you need us!'
        WHEN 'Re-book Reminder (2 Weeks)' THEN 
            'Hi {{name}}, it''s been 2 weeks since your last visit. Book your next appointment and maintain your routine!'
        WHEN 'Win-Back: 30 Days Inactive' THEN 
            'Hi {{name}}, we miss you! It''s been a while since your last visit. Book now and get 10% off your next service!'
        WHEN 'Win-Back: 90 Days Inactive' THEN 
            'Hi {{name}}, we''ve missed you! It''s been 90 days since your last visit. Come back and enjoy 15% off your next service!'
        WHEN 'New Lead Welcome' THEN 
            'Hi {{name}}, thank you for your interest! We''d love to help you. Book your first appointment and get started today!'
        WHEN 'New Lead Follow-up' THEN 
            'Hi {{name}}, we noticed you were interested in our services. Have questions? We''re here to help! Book your appointment today.'
        WHEN 'Package Expiring Soon' THEN 
            'Hi {{name}}, your service package expires in 7 days! Renew now to continue enjoying your benefits.'
        WHEN 'Seasonal Promotion' THEN 
            'Hi {{name}}, we have a special seasonal offer just for you! Book now and take advantage of our limited-time promotion.'
        
        -- CELEBRATE MILESTONES
        WHEN 'Client Birthday' THEN 
            'Happy Birthday {{name}}! 🎉 We''d love to celebrate with you - here''s a special birthday offer: 20% off your next service!'
        WHEN '1 Year Anniversary' THEN 
            'Hi {{name}}, happy 1 year anniversary with us! Thank you for being a valued client. Enjoy 15% off your next service!'
        WHEN '10th Visit Milestone' THEN 
            'Hi {{name}}, congratulations on your 10th visit! You''re a valued client. Enjoy a special loyalty reward on your next service!'
        WHEN '25th Visit Milestone' THEN 
            'Hi {{name}}, wow! 25 visits - you''re a VIP client! Thank you for your loyalty. Enjoy an exclusive reward!'
        WHEN 'Referral Thank You' THEN 
            'Hi {{name}}, thank you for referring a new client! We appreciate you. Enjoy a special reward on your next visit!'
        WHEN 'Holiday Greeting' THEN 
            'Hi {{name}}, happy holidays! We hope you''re having a wonderful season. Book your next appointment and enjoy our holiday special!'
        
        ELSE COALESCE(action_config->>'message_template', 'Hi {{name}}, this is an automated message from us.')
    END,
    'subject', CASE 
        WHEN action_type = 'email' THEN name
        ELSE NULL
    END
)
WHERE is_template = true
AND (action_config IS NULL OR action_config = '{}'::jsonb OR action_config->>'message_template' IS NULL);

-- Add comment explaining action_config structure
COMMENT ON COLUMN marketing_automations.action_config IS 'JSON object containing message template and configuration. Format: {"message_template": "Hi {{name}}...", "subject": "Email subject (optional)"}';
