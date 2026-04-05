-- Make cash optional for on-platform checkout flows.
-- Defaults: card/mobile/gift_card enabled, cash disabled.

update public.platform_settings
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{payment_types}',
  (
    coalesce(settings->'payment_types', '{}'::jsonb)
    || jsonb_build_object(
      'card', true,
      'mobile', true,
      'gift_card', true,
      'cash', false
    )
  ),
  true
),
updated_at = now()
where is_active = true;
