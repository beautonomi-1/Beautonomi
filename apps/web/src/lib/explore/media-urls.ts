/**
 * Normalize explore-posts media_urls for display and storage.
 * DB may store either storage paths (explore/...) or full Supabase public URLs;
 * API always returns full URLs; we store paths.
 */

const BUCKET = "explore-posts";

/**
 * Return the public URL for display. Accepts either a storage path or an existing full URL.
 */
export function toPublicMediaUrl(value: string, supabaseUrl: string | undefined): string {
  if (!value?.trim()) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (!supabaseUrl) return value;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${value.replace(/^\//, "")}`;
}

const STORAGE_PATH_SUFFIX = `/storage/v1/object/public/${BUCKET}/`;

/**
 * Extract storage path from a full Supabase public URL, or return the value if already a path.
 */
export function toStoragePath(fullUrlOrPath: string): string {
  if (!fullUrlOrPath?.trim()) return fullUrlOrPath;
  if (fullUrlOrPath.startsWith("http") && fullUrlOrPath.includes(STORAGE_PATH_SUFFIX)) {
    const idx = fullUrlOrPath.indexOf(STORAGE_PATH_SUFFIX);
    return fullUrlOrPath.slice(idx + STORAGE_PATH_SUFFIX.length);
  }
  return fullUrlOrPath;
}
