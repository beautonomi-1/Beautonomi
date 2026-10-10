import type { SupabaseClient } from "@supabase/supabase-js";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";

export type ExploreSoundCatalogItem = {
  id: string;
  title: string;
  storage_path: string;
  duration_ms: number | null;
  is_hidden: boolean;
  created_at: string;
  source: "platform" | "provider";
  public_url: string;
};

type SoundRow = {
  id: string;
  title: string;
  storage_path: string;
  duration_ms: number | null;
  is_hidden: boolean;
  created_at: string;
  owner_type: string;
};

export async function listExploreSoundsForProvider(
  supabase: SupabaseClient,
  providerId: string,
  supabaseUrl?: string,
): Promise<ExploreSoundCatalogItem[]> {
  const [platformRes, providerRes] = await Promise.all([
    supabase
      .from("explore_sounds")
      .select("id, title, storage_path, duration_ms, is_hidden, created_at, owner_type")
      .eq("owner_type", "platform")
      .eq("is_hidden", false)
      .order("title", { ascending: true }),
    supabase
      .from("explore_sounds")
      .select("id, title, storage_path, duration_ms, is_hidden, created_at, owner_type")
      .eq("owner_type", "provider")
      .eq("provider_id", providerId)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false }),
  ]);

  const mapRow = (row: SoundRow, source: "platform" | "provider"): ExploreSoundCatalogItem => ({
    id: row.id,
    title: row.title,
    storage_path: row.storage_path,
    duration_ms: row.duration_ms,
    is_hidden: row.is_hidden,
    created_at: row.created_at,
    source,
    public_url: toPublicMediaUrl(row.storage_path, supabaseUrl),
  });

  const platform = (platformRes.data ?? []) as SoundRow[];
  const provider = (providerRes.data ?? []) as SoundRow[];

  return [
    ...platform.map((r) => mapRow(r, "platform")),
    ...provider.map((r) => mapRow(r, "provider")),
  ];
}
