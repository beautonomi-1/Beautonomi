import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  requireRoleInApi,
  successResponse,
  handleApiError,
  getProviderIdForUser,
  notFoundResponse,
} from "@/lib/supabase/api-helpers";
import { requirePermission } from "@/lib/auth/requirePermission";

/**
 * GET /api/provider/gallery
 * Return gallery items for the current provider.
 * Gallery URLs are stored as a TEXT[] column (`gallery`) on the `providers` table.
 */
export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRoleInApi(
      ["provider_owner", "provider_staff"],
      request
    );
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { data: provider, error } = await supabase
      .from("providers")
      .select("gallery, thumbnail_url, avatar_url")
      .eq("id", providerId)
      .single();

    if (error) {
      throw error;
    }

    const galleryUrls: string[] = provider.gallery || [];

    const items = galleryUrls.map((url: string, index: number) => ({
      id: `gallery-${index}`,
      url,
      position: index,
    }));

    return successResponse({
      thumbnailUrl: provider.thumbnail_url || null,
      avatarUrl: provider.avatar_url ?? null,
      items,
    });
  } catch (error) {
    return handleApiError(error, "Failed to load gallery");
  }
}

const GALLERY_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

function isAllowedGalleryMime(t: string): boolean {
  const x = t.toLowerCase().split(";")[0]?.trim() || "";
  return x === "image/jpeg" || x === "image/jpg" || x === "image/png" || x === "image/webp";
}

function parseApplyAs(value: unknown): "thumbnail" | "avatar" | null {
  if (value === "thumbnail" || value === "avatar") return value;
  return null;
}

/**
 * POST /api/provider/gallery
 * Add a new gallery item.
 * - JSON: { url?: string } | { image_base64?: string (data URL) } — optional apply_as: "thumbnail" | "avatar"
 * - multipart/form-data: file (required), optional apply_as — preferred from native (no base64 on device).
 */
export async function POST(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    let url: string;
    let applyAs: "thumbnail" | "avatar" | null = null;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      applyAs = parseApplyAs(formData.get("apply_as"));
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return handleApiError(
          new Error("file field is required"),
          "file is required",
          "VALIDATION_ERROR",
          400
        );
      }
      if (file.size === 0) {
        return handleApiError(
          new Error("Empty file"),
          "Empty file",
          "VALIDATION_ERROR",
          400
        );
      }
      if (file.size > GALLERY_UPLOAD_MAX_BYTES) {
        return handleApiError(
          new Error("File too large"),
          "Image must be 8MB or smaller",
          "VALIDATION_ERROR",
          400
        );
      }
      const normalizedType = (file.type || "image/jpeg").toLowerCase();
      if (!isAllowedGalleryMime(normalizedType)) {
        return handleApiError(
          new Error("Invalid file type"),
          "Only JPEG, PNG, and WebP are allowed",
          "VALIDATION_ERROR",
          400
        );
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const fileExt = file.name.split(".").pop()?.toLowerCase() || normalizedType.split("/")[1] || "jpg";
        const fileName = `${providerId}/gallery-${Date.now()}.${fileExt}`;
        const supabaseAdmin = getSupabaseAdmin();
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from("provider-gallery")
          .upload(fileName, buffer, {
            contentType: normalizedType || "image/jpeg",
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError || !uploadData?.path) {
          throw uploadError ?? new Error("Upload failed");
        }
        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from("provider-gallery").getPublicUrl(uploadData.path);
        url = publicUrl;
      } catch (e) {
        console.error("Gallery multipart upload failed:", e);
        return handleApiError(
          e instanceof Error ? e : new Error("Upload failed"),
          "Failed to upload image",
          "UPLOAD_ERROR",
          400
        );
      }
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      applyAs = parseApplyAs(body.apply_as);

      const imageBase64 = body.image_base64 as string | undefined;
      if (imageBase64 && typeof imageBase64 === "string" && imageBase64.startsWith("data:")) {
        try {
          const response = await fetch(imageBase64);
          const blob = await response.blob();
          const fileExt = blob.type?.split("/")[1] || "jpg";
          const fileName = `${providerId}/gallery-${Date.now()}.${fileExt}`;
          const supabaseAdmin = getSupabaseAdmin();
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from("provider-gallery")
            .upload(fileName, blob, {
              contentType: blob.type || "image/jpeg",
              cacheControl: "3600",
              upsert: false,
            });
          if (uploadError || !uploadData?.path) {
            throw uploadError ?? new Error("Upload failed");
          }
          const { data: { publicUrl } } = supabaseAdmin.storage
            .from("provider-gallery")
            .getPublicUrl(uploadData.path);
          url = publicUrl;
        } catch (e) {
          console.error("Gallery image upload failed:", e);
          return handleApiError(
            e instanceof Error ? e : new Error("Upload failed"),
            "Failed to upload image",
            "UPLOAD_ERROR",
            400
          );
        }
      } else {
        const urlParam = body.url;
        if (!urlParam || typeof urlParam !== "string") {
          return handleApiError(
            new Error("url, image_base64 (data URL), or multipart file is required"),
            "url or image_base64 or file is required",
            "VALIDATION_ERROR",
            400
          );
        }
        url = urlParam;
      }
    }

    // Get current gallery
    const { data: provider, error: fetchError } = await supabase
      .from("providers")
      .select("gallery")
      .eq("id", providerId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const currentGallery: string[] = provider.gallery || [];
    const updatedGallery = [...currentGallery, url];

    const updateRow: Record<string, unknown> = { gallery: updatedGallery };
    if (applyAs === "thumbnail") updateRow.thumbnail_url = url;
    if (applyAs === "avatar") updateRow.avatar_url = url;

    const { error } = await supabase.from("providers").update(updateRow).eq("id", providerId).select("gallery").single();

    if (error) {
      throw error;
    }

    return successResponse(
      {
        url,
        position: updatedGallery.length - 1,
      },
      201
    );
  } catch (error) {
    return handleApiError(error, "Failed to add gallery item");
  }
}

/**
 * DELETE /api/provider/gallery
 * Remove a gallery item by URL or index.
 * Query params: ?url=<encoded_url> or ?index=<number>
 */
export async function DELETE(request: NextRequest) {
  try {
    const permissionCheck = await requirePermission("edit_settings", request);
    if (!permissionCheck.authorized) {
      return permissionCheck.response!;
    }
    const { user } = permissionCheck;
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);

    if (!providerId) {
      return notFoundResponse("Provider not found");
    }

    const { searchParams } = new URL(request.url);
    const urlToRemove = searchParams.get("url");
    const indexParam = searchParams.get("index");

    // Get current gallery
    const { data: provider, error: fetchError } = await supabase
      .from("providers")
      .select("gallery")
      .eq("id", providerId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const currentGallery: string[] = provider.gallery || [];
    let updatedGallery: string[];

    if (urlToRemove) {
      updatedGallery = currentGallery.filter((u: string) => u !== urlToRemove);
    } else if (indexParam !== null) {
      const index = parseInt(indexParam, 10);
      if (isNaN(index) || index < 0 || index >= currentGallery.length) {
        return handleApiError(
          new Error("Invalid index"),
          "Invalid index",
          "VALIDATION_ERROR",
          400
        );
      }
      updatedGallery = [
        ...currentGallery.slice(0, index),
        ...currentGallery.slice(index + 1),
      ];
    } else {
      return handleApiError(
        new Error("url or index query param is required"),
        "url or index query param is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const { error } = await supabase
      .from("providers")
      .update({ gallery: updatedGallery })
      .eq("id", providerId);

    if (error) {
      throw error;
    }

    return successResponse({ removed: true, remaining: updatedGallery.length });
  } catch (error) {
    return handleApiError(error, "Failed to remove gallery item");
  }
}
