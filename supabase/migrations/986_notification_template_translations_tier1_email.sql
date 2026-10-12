-- Tier 1 notification_template_translations: email_subject + email_body (fr/ar).
-- Full HTML documents pass through the runtime wrapper; fragments get Beautonomi shell at send time.

INSERT INTO public.notification_template_translations (template_key, language_code, title, body, email_subject, email_body)
VALUES
  (
    'booking_confirmed',
    'fr',
    'Réservation confirmée',
    'Votre rendez-vous chez {{provider_name}} est confirmé pour le {{booking_date}} à {{booking_time}}.',
    'Réservation confirmée — {{provider_name}}',
    '<p>Votre rendez-vous chez <strong>{{provider_name}}</strong> est confirmé pour le {{booking_date}} à {{booking_time}}.</p><p><strong>Services :</strong> {{services}}</p><p><strong>Total :</strong> {{total_amount}}</p>{{pricing_breakdown_html}}<p>Réservation n° {{booking_number}}</p>'
  ),
  (
    'booking_confirmed',
    'ar',
    'تم تأكيد الحجز',
    'تم تأكيد موعدك لدى {{provider_name}} في {{booking_date}} الساعة {{booking_time}}.',
    'تم تأكيد الحجز — {{provider_name}}',
    '<p>تم تأكيد موعدك لدى <strong>{{provider_name}}</strong> في {{booking_date}} الساعة {{booking_time}}.</p><p><strong>الخدمات:</strong> {{services}}</p><p><strong>الإجمالي:</strong> {{total_amount}}</p>{{pricing_breakdown_html}}<p>رقم الحجز {{booking_number}}</p>'
  ),
  (
    'booking_reminder_24h',
    'fr',
    'Rappel de rendez-vous',
    'N''oubliez pas votre rendez-vous chez {{provider_name}} demain à {{booking_time}}.',
    'Rappel : rendez-vous demain — {{provider_name}}',
    '<p>Rappel : vous avez un rendez-vous chez <strong>{{provider_name}}</strong> le {{booking_date}} à {{booking_time}}.</p><p><strong>Lieu :</strong> {{location}}</p>'
  ),
  (
    'booking_reminder_24h',
    'ar',
    'تذكير بالموعد',
    'لا تنس موعدك لدى {{provider_name}} غداً الساعة {{booking_time}}.',
    'تذكير: موعد غداً — {{provider_name}}',
    '<p>تذكير: لديك موعد لدى <strong>{{provider_name}}</strong> في {{booking_date}} الساعة {{booking_time}}.</p><p><strong>الموقع:</strong> {{location}}</p>'
  ),
  (
    'booking_cancelled',
    'fr',
    'Réservation annulée',
    'Votre rendez-vous chez {{provider_name}} a été annulé.',
    'Réservation annulée — {{provider_name}}',
    '<p>Votre rendez-vous chez <strong>{{provider_name}}</strong> le {{booking_date}} a été annulé.</p><p>{{refund_info}}</p><p>Réservation n° {{booking_number}}</p>'
  ),
  (
    'booking_cancelled',
    'ar',
    'تم إلغاء الحجز',
    'تم إلغاء موعدك لدى {{provider_name}}.',
    'تم إلغاء الحجز — {{provider_name}}',
    '<p>تم إلغاء موعدك لدى <strong>{{provider_name}}</strong> في {{booking_date}}.</p><p>{{refund_info}}</p><p>رقم الحجز {{booking_number}}</p>'
  ),
  (
    'booking_rescheduled',
    'fr',
    'Rendez-vous reprogrammé',
    'Votre rendez-vous chez {{provider_name}} a été reprogrammé.',
    'Rendez-vous reprogrammé — {{provider_name}}',
    '<p>Nouvelle date : <strong>{{new_date}}</strong> à {{new_time}}.</p><p>Ancien créneau : {{old_date}} à {{old_time}}.</p>'
  ),
  (
    'booking_rescheduled',
    'ar',
    'تم إعادة جدولة الموعد',
    'تم إعادة جدولة موعدك لدى {{provider_name}}.',
    'إعادة جدولة — {{provider_name}}',
    '<p>الموعد الجديد: <strong>{{new_date}}</strong> الساعة {{new_time}}.</p><p>الموعد السابق: {{old_date}} الساعة {{old_time}}.</p>'
  ),
  (
    'payment_successful',
    'fr',
    'Paiement réussi',
    'Votre paiement a été traité avec succès.',
    'Paiement réussi — réservation n°{{booking_number}}',
    '<p>Votre paiement de <strong>{{amount}}</strong> pour la réservation n°{{booking_number}} a été accepté.</p>'
  ),
  (
    'payment_successful',
    'ar',
    'تم الدفع بنجاح',
    'تمت معالجة دفعتك بنجاح.',
    'تم الدفع بنجاح — حجز رقم {{booking_number}}',
    '<p>تم استلام دفعتك البالغة <strong>{{amount}}</strong> للحجز رقم {{booking_number}}.</p>'
  ),
  (
    'payment_failed',
    'fr',
    'Échec du paiement',
    'Votre paiement a échoué. Veuillez réessayer.',
    'Échec du paiement — action requise',
    '<p>Nous n''avons pas pu traiter votre paiement de <strong>{{amount}}</strong> (réservation n°{{booking_number}}).</p><p><strong>Raison :</strong> {{failure_reason}}</p>'
  ),
  (
    'payment_failed',
    'ar',
    'فشل الدفع',
    'فشلت عملية الدفع. يرجى المحاولة مرة أخرى.',
    'فشل الدفع — يلزم اتخاذ إجراء',
    '<p>تعذر معالجة دفعتك البالغة <strong>{{amount}}</strong> (حجز رقم {{booking_number}}).</p><p><strong>السبب:</strong> {{failure_reason}}</p>'
  ),
  (
    'refund_processed',
    'fr',
    'Remboursement effectué',
    'Votre remboursement a été traité.',
    'Remboursement — réservation n°{{booking_number}}',
    '<p>Un remboursement de <strong>{{amount}}</strong> a été initié pour la réservation n°{{booking_number}}.</p><p>{{refund_reason}}</p>'
  ),
  (
    'refund_processed',
    'ar',
    'تم استرداد المبلغ',
    'تمت معالجة استردادك.',
    'استرداد — حجز رقم {{booking_number}}',
    '<p>تم بدء استرداد بقيمة <strong>{{amount}}</strong> للحجز رقم {{booking_number}}.</p><p>{{refund_reason}}</p>'
  )
ON CONFLICT (template_key, language_code) DO UPDATE
SET
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  updated_at = NOW();
