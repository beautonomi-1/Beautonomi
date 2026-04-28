export function appendReportLocation(path: string, locationId?: string | null): string {
  if (!locationId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}location_id=${encodeURIComponent(locationId)}`;
}
