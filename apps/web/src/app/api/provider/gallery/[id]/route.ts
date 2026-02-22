import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError, getProviderIdForUser, notFoundResponse } from "@/lib/supabase/api-helpers";

async function updateGalleryImage(
  request: NextRequest,
  params: { id: string },
  _method: "PUT" | "PATCH"
) {
  const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
  const supabase = await getSupabaseServer(request);
  const providerId = await getProviderIdForUser(user.id, supabase);
  if (!providerId) return notFoundResponse("Provider not found");

  const body = await request.json().catch(() => ({}));
  const { caption, service_tags, tags, is_cover } = body;

  const { data: provider } = await supabase
    .from("providers")
    .select("gallery")
    .eq("id", providerId)
    .single();

  if (!provider) return notFoundResponse("Provider not found");

  return successResponse({
    id: params.id,
    caption: caption ?? null,
    service_tags: service_tags ?? tags ?? null,
    is_cover: is_cover ?? false,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await params;
    return updateGalleryImage(request, resolved, "PUT");
  } catch (error) {
    return handleApiError(error, "Failed to update gallery image");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await params;
    return updateGalleryImage(request, resolved, "PATCH");
  } catch (error) {
    return handleApiError(error, "Failed to update gallery image");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user } = await requireRoleInApi(["provider_owner", "provider_staff"], request);
    const supabase = await getSupabaseServer(request);
    const providerId = await getProviderIdForUser(user.id, supabase);
    if (!providerId) return notFoundResponse("Provider not found");

    const index = parseInt(id.replace("gallery-", ""), 10);

    const { data: provider } = await supabase
      .from("providers")
      .select("gallery")
      .eq("id", providerId)
      .single();

    if (!provider) return notFoundResponse("Provider not found");

    const gallery: string[] = provider.gallery || [];
    if (index >= 0 && index < gallery.length) {
      gallery.splice(index, 1);
      await supabase
        .from("providers")
        .update({ gallery })
        .eq("id", providerId);
    }

    return successResponse({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete gallery image");
  }
}
