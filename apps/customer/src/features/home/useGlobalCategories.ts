/**
 * Fetch global service categories from /api/public/categories/global.
 *
 * `icon` matches web/DB (`/images/...`, `https://...`, or legacy Lucide-style keys).
 * Use `getGlobalCategoryImageUri` + Expo Image in native UI; `getCategoryIcon` is the Ionicons fallback.
 */
import { useState, useEffect, useCallback } from "react";
import { resolveGlobalCategoryIconUri } from "@beautonomi/utils";
import { api } from "@/lib/api-client";
import { APP_URL } from "@/config/public-env";

export interface GlobalCategory {
  id: string;
  slug: string;
  name: string;
  /** DB field: path or URL (same as web `global_service_categories.icon`) */
  icon?: string | null;
  /** Legacy alias if any proxy strips `icon` */
  icon_name?: string | null;
  description?: string | null;
  provider_count?: number;
  is_featured?: boolean;
}

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

/** Absolute URI for `<Image source={{ uri }} />`, or `null` to use `getCategoryIcon(slug)` instead. */
export function getGlobalCategoryImageUri(icon: string | null | undefined): string | null {
  return resolveGlobalCategoryIconUri(icon, APP_URL);
}

export function useGlobalCategories() {
  const [categories, setCategories] = useState<GlobalCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<GlobalCategory[] | { data?: GlobalCategory[] }>(
        "/api/public/categories/global"
      );
      if (res.error) {
        setCategories([]);
        setError(res.error.message ?? "Failed to load categories");
        return;
      }
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (raw as { data?: GlobalCategory[] })?.data;
      if (Array.isArray(list) && list.length > 0) {
        setCategories(list);
      } else {
        setCategories([]);
        setError("No categories available");
      }
    } catch (e) {
      setCategories([]);
      setError(e instanceof Error ? e.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, loading, error, reload: load };
}
