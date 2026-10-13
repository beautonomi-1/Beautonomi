export type ClientDefaultAddressLike = {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function hasMeaningfulDefaultAddress(addr: ClientDefaultAddressLike | null | undefined): boolean {
  if (!addr) return false;
  return Boolean(String(addr.address_line1 ?? "").trim() && String(addr.city ?? "").trim());
}

export function formatDefaultAddressSearchValue(addr: ClientDefaultAddressLike): string {
  return [addr.address_line1, addr.city, addr.state, addr.postal_code, addr.country]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean)
    .join(", ");
}
