import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveAllowedExploreSoundId(
  supabase: SupabaseClient,
  soundId: string | null | undefined,
  providerId: string,
): Promise<{ ok: true; id: string | null } | { ok: false; message: string }> {
  if (soundId == null || soundId === "") {
    return { ok: true, id: null };
  }
  const id = soundId.trim();
  if (!id) return { ok: true, id: null };

  const { data, error } = await supabase
    .from("explore_sounds")
    .select("id, owner_type, provider_id, is_hidden")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, message: "Sound not found" };
  }
  if (data.is_hidden) {
    return { ok: false, message: "Sound is not available" };
  }
  if (data.owner_type === "platform") {
    return { ok: true, id: data.id };
  }
  if (data.owner_type === "provider" && data.provider_id === providerId) {
    return { ok: true, id: data.id };
  }
  return { ok: false, message: "Sound not available for this provider" };
}

export async function resolveExplorePostSoundIdForWrite(
  supabase: SupabaseClient,
  soundId: string | null | undefined,
  providerId: string,
  opts: { catalogEnabled: boolean; hasVideoMedia: boolean },
): Promise<{ ok: true; id: string | null } | { ok: false; message: string }> {
  if (soundId == null || soundId === "") {
    return { ok: true, id: null };
  }
  if (!opts.catalogEnabled) {
    return { ok: false, message: "Sound catalog is disabled" };
  }
  if (!opts.hasVideoMedia) {
    return { ok: false, message: "Background sound requires the first slide to be a video" };
  }
  return resolveAllowedExploreSoundId(supabase, soundId, providerId);
}
