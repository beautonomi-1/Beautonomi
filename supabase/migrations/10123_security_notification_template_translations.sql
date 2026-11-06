-- fr/ar translations for security device verification and new-device sign-in templates.

INSERT INTO public.notification_template_translations (template_key, language_code, title, body, email_subject, email_body)
VALUES
  (
    'security_device_verification_code',
    'fr',
    'Vérifiez votre appareil',
    'Votre code Beautonomi est {{code}}. Il expire dans {{expires_minutes}} minutes.',
    'Code de vérification Beautonomi',
    '<p>Utilisez ce code pour vérifier votre appareil <strong>{{device_label}}</strong> :</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{code}}</p><p>Ce code expire dans {{expires_minutes}} minutes. Si vous n''êtes pas à l''origine de cette demande, sécurisez votre compte immédiatement.</p>'
  ),
  (
    'security_device_verification_code',
    'ar',
    'تحقق من جهازك',
    'رمز Beautonomi هو {{code}}. ينتهي خلال {{expires_minutes}} دقيقة.',
    'رمز التحقق من Beautonomi',
    '<p>استخدم هذا الرمز للتحقق من جهازك <strong>{{device_label}}</strong>:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">{{code}}</p><p>ينتهي هذا الرمز خلال {{expires_minutes}} دقيقة. إذا لم تطلب ذلك، أمّن حسابك فوراً.</p>'
  ),
  (
    'security_new_device_signin',
    'fr',
    'Nouvelle connexion à votre compte',
    'Nouvelle connexion sur {{device_label}} depuis {{location}} à {{signin_time}}.',
    'Nouvelle connexion — Beautonomi',
    '<p>Votre compte a été connecté sur <strong>{{device_label}}</strong> depuis {{location}} à {{signin_time}}.</p><p>Si ce n''était pas vous, sécurisez votre compte immédiatement.</p>'
  ),
  (
    'security_new_device_signin',
    'ar',
    'تسجيل دخول جديد إلى حسابك',
    'تسجيل دخول جديد على {{device_label}} من {{location}} في {{signin_time}}.',
    'تسجيل دخول جديد — Beautonomi',
    '<p>تم تسجيل الدخول إلى حسابك على <strong>{{device_label}}</strong> من {{location}} في {{signin_time}}.</p><p>إذا لم تكن أنت، أمّن حسابك فوراً.</p>'
  )
ON CONFLICT (template_key, language_code) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  email_subject = EXCLUDED.email_subject,
  email_body = EXCLUDED.email_body,
  updated_at = NOW();
