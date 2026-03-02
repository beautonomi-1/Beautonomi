/**
 * Fetch global service categories from /api/public/categories/global.
 * Falls back to hardcoded defaults if API fails.
 */
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

export interface GlobalCategory {
  id: string;
  slug: string;
  name: string;
  icon_name?: string | null;
  description?: string | null;
  provider_count?: number;
  is_featured?: boolean;
}

const FALLBACK_CATEGORIES: GlobalCategory[] = [
  { id: "hair", slug: "hair", name: "Hair" },
  { id: "nails", slug: "nails", name: "Nails" },
  { id: "face", slug: "face", name: "Face" },
  { id: "body", slug: "body", name: "Body" },
];

const ICON_MAP: Record<string, string> = {
  hair: "cut-outline",
  nails: "color-palette-outline",
  face: "happy-outline",
  body: "body-outline",
  makeup: "brush-outline",
  spa: "water-outline",
  barber: "cut-outline",
  lashes: "eye-outline",
  skincare: "leaf-outline",
  massage: "fitness-outline",
};

export function getCategoryIcon(slug: string): string {
  return ICON_MAP[slug.toLowerCase()] ?? "sparkles-outline";
}

export function useGlobalCategories() {
  const [categories, setCategories] = useState<GlobalCategory[]>(FALLBACK_CATEGORIES);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<GlobalCategory[] | { data?: GlobalCategory[] }>(
        "/api/public/categories/global"
      );
      if (res.error) {
        setCategories(FALLBACK_CATEGORIES);
        return;
      }
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as any)?.data;
      if (Array.isArray(list) && list.length > 0) {
        setCategories(list);
      } else {
        setCategories(FALLBACK_CATEGORIES);
      }
    } catch {
      setCategories(FALLBACK_CATEGORIES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, loading, reload: load };
}
