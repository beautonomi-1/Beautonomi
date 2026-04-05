import type { LucideIcon } from "lucide-react";
import { Tag, Wand2 } from "lucide-react";
import {
  BEAUTONOMI_CATEGORY_ICONS_AS_LUCIDE,
  BeautonomiBarber,
  BeautonomiBraids,
  BeautonomiBrowsLashes,
  BeautonomiDreadlocks,
  BeautonomiHair,
  BeautonomiHairRemoval,
  BeautonomiMakeup,
  BeautonomiMassage,
  BeautonomiNails,
  BeautonomiNaturalHair,
  BeautonomiSkinFacials,
  BeautonomiSpa,
  BeautonomiWigsWeaves,
  BeautonomiAll,
} from "@/components/icons/categories/beautonomi-category-icons";

const asIcon = (C: typeof BeautonomiHair) => C as LucideIcon;

/**
 * `global_service_categories.icon`: prefer **Beautonomi\*** bespoke SVG names from the seed migration;
 * image URLs (http/https/data//) as <img>; legacy Lucide names still resolve to the matching custom icon.
 */
export const GLOBAL_CATEGORY_LUCIDE_MAP: Record<string, LucideIcon> = {
  ...BEAUTONOMI_CATEGORY_ICONS_AS_LUCIDE,
  Tag,
  Wand2,

  Scissors: asIcon(BeautonomiHair),
  Hand: asIcon(BeautonomiNails),
  Braids: asIcon(BeautonomiBraids),
  Palette: asIcon(BeautonomiMakeup),
  Activity: asIcon(BeautonomiMassage),
  Waves: asIcon(BeautonomiDreadlocks),
  Sparkles: asIcon(BeautonomiBrowsLashes),
  Leaf: asIcon(BeautonomiNaturalHair),
  Layers: asIcon(BeautonomiWigsWeaves),
  ScanFace: asIcon(BeautonomiSkinFacials),
  Zap: asIcon(BeautonomiHairRemoval),
  Shirt: asIcon(BeautonomiBarber),
  Flower2: asIcon(BeautonomiSpa),

  GitBranch: asIcon(BeautonomiBraids),
  Eye: asIcon(BeautonomiBrowsLashes),
  Armchair: asIcon(BeautonomiMassage),
};

function normalizeIconToken(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const NORMALIZED_ICON_KEY_TO_REGISTRY: Record<string, string> = Object.keys(GLOBAL_CATEGORY_LUCIDE_MAP).reduce(
  (acc, key) => {
    acc[normalizeIconToken(key)] = key;
    return acc;
  },
  {} as Record<string, string>
);

/** Lowercase slug / legacy keys → map key */
const LEGACY_KEY_TO_REGISTRY: Record<string, string> = {
  all: "BeautonomiAll",
  wand2: "BeautonomiAll",
  hair: "BeautonomiHair",
  makeup: "BeautonomiMakeup",
  nails: "BeautonomiNails",
  massage: "BeautonomiMassage",
  facial: "BeautonomiSkinFacials",
  scissors: "BeautonomiHair",
  sparkles: "BeautonomiBrowsLashes",
  droplets: "BeautonomiSpa",
  palette: "BeautonomiMakeup",
  ruler: "BeautonomiHair",
  scanface: "BeautonomiSkinFacials",
  eye: "BeautonomiBrowsLashes",
  armchair: "BeautonomiMassage",
};

function toPascalCaseToken(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/[-_](.)/g, (_, c: string) => c.toUpperCase());
}

export function resolveGlobalCategoryLucideIcon(raw: string | null | undefined): LucideIcon | null {
  if (raw == null || !String(raw).trim()) return null;
  const icon = String(raw).trim();

  if (GLOBAL_CATEGORY_LUCIDE_MAP[icon]) {
    return GLOBAL_CATEGORY_LUCIDE_MAP[icon];
  }

  const lower = icon.toLowerCase();
  const legacyKey = LEGACY_KEY_TO_REGISTRY[lower];
  if (legacyKey && GLOBAL_CATEGORY_LUCIDE_MAP[legacyKey]) {
    return GLOBAL_CATEGORY_LUCIDE_MAP[legacyKey];
  }

  const pascal = toPascalCaseToken(icon);
  if (GLOBAL_CATEGORY_LUCIDE_MAP[pascal]) {
    return GLOBAL_CATEGORY_LUCIDE_MAP[pascal];
  }

  const normalizedRegistryKey = NORMALIZED_ICON_KEY_TO_REGISTRY[normalizeIconToken(icon)];
  if (normalizedRegistryKey && GLOBAL_CATEGORY_LUCIDE_MAP[normalizedRegistryKey]) {
    return GLOBAL_CATEGORY_LUCIDE_MAP[normalizedRegistryKey];
  }

  return null;
}

export function isGlobalCategoryIconImageUrl(icon: string | null | undefined): boolean {
  if (!icon?.trim()) return false;
  const s = icon.trim();
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:") || s.startsWith("/");
}
