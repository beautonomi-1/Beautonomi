-- Global language rows for South African official languages (tenant_id NULL).
-- Picker UIs merge bundled @beautonomi/i18n locales; these rows improve admin ordering and labels.

INSERT INTO public.preference_options (type, code, name, display_order, is_active)
SELECT v.type, v.code, v.name, v.display_order, true
FROM (
  VALUES
    ('language'::text, 'af'::text, 'Afrikaans'::text, 101),
    ('language', 'zu', 'isiZulu', 102),
    ('language', 'st', 'Sesotho (Southern Sotho)', 103),
    ('language', 'xh', 'isiXhosa', 104),
    ('language', 'nso', 'Sesotho sa Leboa (Northern Sotho)', 105),
    ('language', 'tn', 'Setswana', 106),
    ('language', 'ts', 'Xitsonga', 107),
    ('language', 've', 'Tshivenḓa', 108),
    ('language', 'ss', 'siSwati', 109)
) AS v(type, code, name, display_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.preference_options po
  WHERE po.tenant_id IS NULL
    AND po.type = v.type
    AND po.code = v.code
);
