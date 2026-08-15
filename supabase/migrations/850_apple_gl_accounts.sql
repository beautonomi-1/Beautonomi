-- 850: Apple IAP GL accounts (shadow trigger Apple path handled via metadata in app layer)

BEGIN;

INSERT INTO public.gl_accounts (code, name, type, normal_side) VALUES
  ('1150', 'Apple settlement receivable', 'asset', 'debit'),
  ('4010', 'App Store commission expense', 'expense', 'debit')
ON CONFLICT (code) DO NOTHING;

COMMIT;
