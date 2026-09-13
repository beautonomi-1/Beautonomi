-- Per-language notification template copy (push/email/sms/whatsapp).
-- Base templates remain in notification_templates; rows here override per locale.

CREATE TABLE IF NOT EXISTS public.notification_template_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  language_code TEXT NOT NULL,
  title TEXT,
  body TEXT,
  email_subject TEXT,
  email_body TEXT,
  sms_body TEXT,
  whatsapp_body TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_key, language_code)
);

DROP TRIGGER IF EXISTS update_notification_template_translations_updated_at
  ON public.notification_template_translations;

CREATE TRIGGER update_notification_template_translations_updated_at
  BEFORE UPDATE ON public.notification_template_translations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.notification_template_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_template_translations_service_role
  ON public.notification_template_translations;

CREATE POLICY notification_template_translations_service_role
  ON public.notification_template_translations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed French + Arabic for high-volume booking templates (English fallback when missing).
-- Variables must match notification-service substitution keys (booking_date, booking_time, provider_name).
INSERT INTO public.notification_template_translations (template_key, language_code, title, body)
SELECT t.template_key, t.language_code, t.title, t.body
FROM (VALUES
  ('booking_confirmed', 'fr', 'Réservation confirmée', 'Votre rendez-vous chez {{provider_name}} est confirmé pour le {{booking_date}} à {{booking_time}}.'),
  ('booking_confirmed', 'ar', 'تم تأكيد الحجز', 'تم تأكيد موعدك لدى {{provider_name}} في {{booking_date}} الساعة {{booking_time}}.'),
  ('booking_cancelled', 'fr', 'Réservation annulée', 'Votre rendez-vous chez {{provider_name}} a été annulé.'),
  ('booking_cancelled', 'ar', 'تم إلغاء الحجز', 'تم إلغاء موعدك لدى {{provider_name}}.'),
  ('booking_reminder_24h', 'fr', 'Rappel de rendez-vous', 'N''oubliez pas votre rendez-vous chez {{provider_name}} demain à {{booking_time}}.'),
  ('booking_reminder_24h', 'ar', 'تذكير بالموعد', 'لا تنس موعدك لدى {{provider_name}} غداً الساعة {{booking_time}}.'),
  ('booking_reminder_2h', 'fr', 'Rappel de rendez-vous', 'Votre rendez-vous chez {{provider_name}} est dans 2 heures ({{booking_time}}).'),
  ('booking_reminder_2h', 'ar', 'تذكير بالموعد', 'موعدك لدى {{provider_name}} بعد ساعتين ({{booking_time}}).')
) AS t(template_key, language_code, title, body)
ON CONFLICT (template_key, language_code) DO NOTHING;
