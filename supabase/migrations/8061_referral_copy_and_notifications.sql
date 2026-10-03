-- Referral program copy alignment: rewards are referrer-only (wallet + loyalty).
-- Also refresh the referral_code_used notification template (welcome, no dual bonus).

UPDATE referral_faqs
SET
  answer = 'Share your unique referral link or code with friends. When someone signs up using your link and completes their first eligible booking, you earn a wallet reward and loyalty points. Rewards are credited to your wallet after the referred user''s first completed booking.',
  updated_at = NOW()
WHERE question = 'How does the referral program work?';

UPDATE notification_templates
SET
  email_subject = 'Welcome to Beautonomi!',
  body = 'You joined Beautonomi using {{referrer_name}}''s referral. Complete your first booking to get started — your friend earns a referral bonus when you do.',
  email_body = '<h2>Welcome to Beautonomi!</h2><p>You joined using <strong>{{referrer_name}}</strong>''s referral link.</p><p>Complete your first booking to get started. Your friend earns a referral bonus when you complete your first eligible booking.</p>',
  description = 'Sent when a new user signs up with a referral code (welcome — referrer earns on first booking)',
  updated_at = NOW()
WHERE key = 'referral_code_used';
