/**
 * Calendar date in the device local timezone (`YYYY-MM-DD`).
 * Duplicated from `@beautonomi/utils` so client bundles avoid Turbopack + transpilePackages
 * interop issues with the prebuilt workspace package (runtime "is not a function").
 */
export function formatLocalDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
