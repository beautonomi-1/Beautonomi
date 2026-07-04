const APP_BASE = () => (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

export function resolveIntegrationVendorSlug(product: {
  vendor: string;
  integration_vendor_slug?: string | null;
}): string {
  return (product.integration_vendor_slug ?? product.vendor ?? "").trim().toLowerCase();
}

/** Provider web path for completing brand integration after a terminal order. */
export function resolveIntegrationSetupPath(product: {
  vendor: string;
  integration_vendor_slug?: string | null;
}): string {
  const slug = resolveIntegrationVendorSlug(product);
  if (slug === "yoco") {
    return "/provider/settings/sales/yoco-integration";
  }
  return `/provider/settings/sales/terminal-integrations/${encodeURIComponent(slug)}`;
}

export function resolveIntegrationSetupUrl(
  product: { vendor: string; integration_vendor_slug?: string | null },
  orderId?: string,
): string {
  const base = APP_BASE();
  const path = resolveIntegrationSetupPath(product);
  const qs = orderId ? `?order=${encodeURIComponent(orderId)}` : "";
  return `${base}${path}${qs}`;
}
