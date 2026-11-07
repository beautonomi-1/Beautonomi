/** HTTPS App Link for customer book flow — always use `slug`, not `provider_id`. */
export function buildProviderPublicBookUrl(
  appUrl: string,
  slug: string,
  opts?: {
    serviceId?: string | null;
    staffId?: string | null;
    locationType?: string | null;
  },
): string {
  const base = appUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set("slug", slug.trim());
  const serviceId = opts?.serviceId?.trim();
  const staffId = opts?.staffId?.trim();
  const locationType = opts?.locationType?.trim();
  if (serviceId) params.set("service", serviceId);
  if (staffId) params.set("staff", staffId);
  if (locationType) params.set("location_type", locationType);
  return `${base}/booking?${params.toString()}`;
}
