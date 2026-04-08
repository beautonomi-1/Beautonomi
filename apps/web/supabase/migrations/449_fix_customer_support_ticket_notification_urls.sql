-- Customer web serves support tickets at /help/my-tickets/[id], not /support/tickets/[id].
-- Fixes in-app notification action_url and push/email deep links from notification_templates.

UPDATE public.notification_templates
SET url = '/help/my-tickets/{{ticket_id}}'
WHERE key IN ('support_ticket_created', 'support_ticket_updated')
  AND (url IS DISTINCT FROM '/help/my-tickets/{{ticket_id}}');
