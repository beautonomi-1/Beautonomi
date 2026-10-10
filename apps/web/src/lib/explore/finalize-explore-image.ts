import type { SupabaseClient } from "@supabase/supabase-js";
import { processExploreDisplayJpeg } from "@/lib/explore/brand-display-image";
import type { ExploreTextOverlay } from "@/lib/explore/media-types";

export type FinalizeExploreImageResult = {
  path: string;
  display_path: string;
  width: number;
  height: number;
};

/** Download original from explore-posts, Sharp display JPEG, upload display asset. */
export async function finalizeExploreImageFromStorage(
  supabaseAdmin: SupabaseClient,
  providerId: string,
  originalPath: string,
  opts?: { textOverlays?: ExploreTextOverlay[] | null },
): Promise<FinalizeExploreImageResult> {
  const path = originalPath.replace(/^\//, "");
  const { data: blob, error: dlErr } = await supabaseAdmin.storage.from("explore-posts").download(path);
  if (dlErr || !blob) {
    throw new Error(dlErr?.message ?? "Original image not found in storage");
  }
  const inputBuffer = Buffer.from(await blob.arrayBuffer());

  const { data: prov } = await supabaseAdmin
    .from("providers")
    .select("business_name")
    .eq("id", providerId)
    .maybeSingle();

  const { buffer, width, height } = await processExploreDisplayJpeg(
    inputBuffer,
    prov?.business_name,
    opts?.textOverlays ?? null,
  );

  const displayPath = `explore/${providerId}/display-${Date.now()}.jpg`;
  const { data: uploadData, error: upErr } = await supabaseAdmin.storage
    .from("explore-posts")
    .upload(displayPath, buffer, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
  if (upErr) {
    throw new Error(upErr.message ?? "Failed to upload display image");
  }

  return {
    path,
    display_path: uploadData?.path ?? displayPath,
    width,
    height,
  };
}
