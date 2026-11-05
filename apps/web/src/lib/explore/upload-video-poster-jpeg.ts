import type { fetcher as fetcherType } from "@/lib/http/fetcher";

type Fetcher = typeof fetcherType;

/** Upload a trim-start JPEG as explore storage path (no photo finalize / text bar). */
export async function uploadExploreVideoPosterJpeg(
  fetcher: Fetcher,
  jpeg: Blob,
  width: number,
  height: number,
): Promise<{ display_path: string; width: number; height: number } | null> {
  const sizeBytes = jpeg.size;
  if (sizeBytes <= 0) return null;

  const slotRes = await fetcher.post<{
    data: { path: string; signed_url?: string | null };
  }>("/api/explore/upload", {
    kind: "image",
    size_bytes: sizeBytes,
    mime_type: "image/jpeg",
  });
  const slot = (slotRes as { data?: { path: string; signed_url?: string | null } })?.data;
  if (!slot?.path) return null;

  if (slot.signed_url) {
    const put = await fetch(slot.signed_url, {
      method: "PUT",
      body: jpeg,
      headers: { "Content-Type": "image/jpeg" },
    });
    if (!put.ok) return null;
  }

  return { display_path: slot.path, width, height };
}
