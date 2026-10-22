import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Removes a partially-created provider after a fatal onboarding step fails.
 * Child rows cascade on providers delete; storage objects under provider-gallery/{id}/ are best-effort removed.
 */
export async function rollbackPartialProvider(
  admin: SupabaseClient,
  providerId: string,
): Promise<boolean> {
  try {
    const { data: files } = await admin.storage.from("provider-gallery").list(providerId);
    if (files?.length) {
      await admin.storage
        .from("provider-gallery")
        .remove(files.map((f) => `${providerId}/${f.name}`));
    }
  } catch (err) {
    console.warn("[onboarding] rollback storage cleanup failed", providerId, err);
  }
  const { error } = await admin.from("providers").delete().eq("id", providerId);
  if (error) console.error("[onboarding] rollback failed", providerId, error);
  return !error;
}
