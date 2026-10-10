import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  errorResponse,
  handleApiError,
} from "@/lib/supabase/api-helpers";
import { isExploreSoundCatalogEnabled } from "@/lib/explore/explore-feature-gates";
import { toPublicMediaUrl } from "@/lib/explore/media-urls";
import {
  assertExploreSoundSizeBytes,
  isAllowedExploreSoundMime,
  platformSoundObjectPath,
  titleFromSoundFilename,
} from "@/lib/explore/sound-storage";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);
    if (!(await isExploreSoundCatalogEnabled(null))) {
      return errorResponse("Sound catalog is disabled", "FORBIDDEN", 403);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return errorResponse("file is required", "VALIDATION_ERROR", 400);
    }

    const mime =
      (file instanceof File && file.type) || (formData.get("mime_type") as string | null) || "audio/m4a";
    if (!isAllowedExploreSoundMime(mime)) {
      return errorResponse("Sound must be MP3 or M4A", "VALIDATION_ERROR", 400);
    }

    const sizeErr = assertExploreSoundSizeBytes(file.size);
    if (sizeErr) return errorResponse(sizeErr, "VALIDATION_ERROR", 400);

    const titleRaw = formData.get("title");
    const filename = file instanceof File ? file.name : null;
    const title =
      typeof titleRaw === "string" && titleRaw.trim()
        ? titleRaw.trim().slice(0, 120)
        : titleFromSoundFilename(filename);

    const storagePath = platformSoundObjectPath(mime);
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = getSupabaseAdmin();
    const { error: upErr } = await supabase.storage.from("explore-posts").upload(storagePath, buffer, {
      contentType: mime,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upErr) return handleApiError(upErr, "Failed to upload sound");

    const { data, error } = await supabase
      .from("explore_sounds")
      .insert({
        title,
        owner_type: "platform",
        provider_id: null,
        storage_path: storagePath,
        duration_ms: null,
      })
      .select("id, title, storage_path, duration_ms, created_at")
      .single();

    if (error) return handleApiError(error, "Failed to register sound");

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return successResponse(
      {
        ...data,
        public_url: toPublicMediaUrl(data.storage_path, url),
      },
      201,
    );
  } catch (error) {
    return handleApiError(error, "Failed to upload sound");
  }
}
