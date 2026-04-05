-- Canonical global service categories for public nav, search, and /sitemap.xml /category/{slug}.
-- Icons: Beautonomi bespoke SVG keys (PascalCase, apps/web/src/components/icons/categories/beautonomi-category-icons.tsx);
-- legacy Lucide names still resolve in apps/web/src/lib/icons/global-category-lucide.ts.
-- Upsert keeps name/description/icon/order in sync on re-run.
-- Supersedes earlier seed slugs: skincare → skin-facials, waxing → hair-removal, lashes-brows → brows-lashes.

UPDATE public.global_service_categories
SET is_active = false, updated_at = now()
WHERE slug IN ('skincare', 'waxing', 'lashes-brows');

INSERT INTO public.global_service_categories (name, slug, description, icon, display_order, is_featured, is_active)
VALUES
  ('Hair', 'hair', 'Cuts, colour, styling, and everyday hair care', 'BeautonomiHair', 10, true, true),
  ('Nails', 'nails', 'Manicures, pedicures, nail art, and extensions', 'BeautonomiNails', 20, true, true),
  ('Braids', 'braids', 'Box braids, cornrows, twists, and braided styles', 'BeautonomiBraids', 30, true, true),
  ('Makeup', 'makeup', 'Makeup application, lessons, and special-occasion looks', 'BeautonomiMakeup', 40, true, true),
  ('Massage', 'massage', 'Relaxation, deep tissue, and therapeutic massage', 'BeautonomiMassage', 50, true, true),
  ('Dreadlocks', 'dreadlocks', 'Locs, maintenance, styling, and dreadlock care', 'BeautonomiDreadlocks', 60, true, true),
  ('Brows & Lashes', 'brows-lashes', 'Brows, lash extensions, lifts, and tinting', 'BeautonomiBrowsLashes', 70, true, true),
  ('Natural Hair', 'natural-hair', 'Natural hair care, treatments, and styling', 'BeautonomiNaturalHair', 80, true, true),
  ('Wigs & Weaves', 'wigs-weaves', 'Installs, custom wigs, weaves, and maintenance', 'BeautonomiWigsWeaves', 90, true, true),
  ('Skin & Facials', 'skin-facials', 'Facials, skin treatments, and complexion care', 'BeautonomiSkinFacials', 100, true, true),
  ('Hair Removal', 'hair-removal', 'Waxing, threading, laser, and hair removal', 'BeautonomiHairRemoval', 110, true, true),
  ('Barber', 'barber', 'Cuts, shaves, and men''s grooming', 'BeautonomiBarber', 120, true, true),
  ('Spa', 'spa', 'Spa rituals, body treatments, and wellness', 'BeautonomiSpa', 130, true, true)

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order,
  is_featured = EXCLUDED.is_featured,
  is_active = EXCLUDED.is_active,
  updated_at = now();
