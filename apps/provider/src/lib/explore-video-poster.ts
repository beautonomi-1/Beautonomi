/** File URI when a thumbnail already exposes one. Shared image refs do not. */
export function exploreThumbnailFileUri(thumb: object | null | undefined): string | null {
  if (!thumb) return null;
  const record = thumb as { uri?: unknown; localUri?: unknown };
  const uri = record.uri ?? record.localUri;
  return typeof uri === "string" && uri.length > 0 ? uri : null;
}
