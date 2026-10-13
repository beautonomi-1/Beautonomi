import { providerPortalFetch } from "@/lib/http/fetcher";

export type ClientDefaultAddressPatch = {
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  addressLatitude: number | null;
  addressLongitude: number | null;
};

export async function loadClientDefaultAddress(
  clientId: string,
): Promise<ClientDefaultAddressPatch | null> {
  const res = await providerPortalFetch(`/api/provider/clients/${clientId}`);
  if (!res.ok) return null;
  const body = await res.json();
  const clientData = body?.data ?? body;
  const addr =
    (clientData?.customer?.default_address as Record<string, unknown>) ??
    (clientData?.default_address as Record<string, unknown>) ??
    null;
  if (!addr) return null;
  return {
    addressLine1: String(addr.address_line1 || addr.line1 || addr.street || ""),
    addressLine2: String(addr.address_line2 || addr.line2 || ""),
    addressCity: String(addr.city || ""),
    addressState: String(addr.state || addr.province || ""),
    addressPostalCode: String(addr.postal_code || addr.postalCode || ""),
    addressCountry: String(addr.country || ""),
    addressLatitude:
      addr.latitude != null
        ? Number(addr.latitude)
        : addr.lat != null
          ? Number(addr.lat)
          : null,
    addressLongitude:
      addr.longitude != null
        ? Number(addr.longitude)
        : addr.lng != null
          ? Number(addr.lng)
          : null,
  };
}
