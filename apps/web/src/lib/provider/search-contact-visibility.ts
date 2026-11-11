export type SearchContact = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export function clientSearchSuggestion(
  customer: SearchContact,
  providerClientId: string | undefined,
  canViewClients: boolean,
): { type: "client"; id: string; title: string; subtitle?: string; url: string } | null {
  if (!canViewClients) return null;
  const id = providerClientId || customer.id;
  return {
    type: "client",
    id,
    title: customer.full_name || customer.email || "Unknown",
    subtitle: customer.email || customer.phone || undefined,
    url: `/provider/clients/${id}`,
  };
}

export function bookingCustomerLabel(
  customer: { full_name?: string | null; email?: string | null } | null,
  canViewClients: boolean,
): string {
  if (!customer) return "";
  if (canViewClients) return customer.full_name || customer.email || "";
  return customer.full_name || "";
}
