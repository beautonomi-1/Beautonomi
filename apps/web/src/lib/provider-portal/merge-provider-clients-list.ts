/**
 * Shared merge for provider clients list (saved + serviced + conversation-only).
 * Used by the clients page client fetch and RSC initial load.
 */
export interface MergedProviderClient {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  last_visit?: string;
  total_visits: number;
  total_spent: number;
  average_rating?: number;
  preferred_team_member_id?: string;
  preferred_team_member_name?: string;
  birth_date?: string | null;
  marketing_consent: boolean;
  sms_consent: boolean;
  is_saved?: boolean;
  customer_id?: string;
}

export function mergeProviderClientsListFromSources(
  savedData: { data?: unknown[] },
  servicedData: { data?: unknown[] },
  conversationsData: { data?: unknown[] },
): MergedProviderClient[] {
  const savedClients = (savedData.data || []).map((client: any) => {
    const fullName = client.customer?.full_name || "";
    const nameParts = fullName.trim().split(/\s+/);
    return {
      id: client.id,
      first_name: nameParts[0] || "Unknown",
      last_name: nameParts.slice(1).join(" ") || "",
      email: client.customer?.email || "",
      phone: client.customer?.phone || "",
      notes: client.notes || "",
      tags: client.tags || [],
      created_at: client.created_at,
      last_visit: client.last_service_date,
      total_visits: client.total_bookings || 0,
      total_spent: client.total_spent || 0,
      average_rating: client.customer?.rating_average,
      birth_date: client.customer?.date_of_birth || null,
      marketing_consent: client.customer?.email_notifications_enabled ?? true,
      sms_consent: client.customer?.sms_notifications_enabled ?? true,
      is_saved: true,
      customer_id: client.customer_id,
    };
  });

  const savedCustomerIds = new Set(savedClients.map((c: any) => c.customer_id));
  const servicedClients = (servicedData.data || [])
    .filter((client: any) => !savedCustomerIds.has(client.customer_id))
    .map((client: any) => {
      const fullName = client.customer?.full_name || "";
      const nameParts = fullName.trim().split(/\s+/);
      return {
        id: client.customer_id,
        first_name: nameParts[0] || "Unknown",
        last_name: nameParts.slice(1).join(" ") || "",
        email: client.customer?.email || "",
        phone: client.customer?.phone || "",
        notes: "",
        tags: [],
        created_at: client.last_service_date,
        last_visit: client.last_service_date,
        total_visits: client.total_bookings || 0,
        total_spent: client.total_spent || 0,
        average_rating: client.customer?.rating_average,
        birth_date: client.customer?.date_of_birth || null,
        marketing_consent: client.customer?.email_notifications_enabled ?? true,
        sms_consent: client.customer?.sms_notifications_enabled ?? true,
        is_saved: false,
        customer_id: client.customer_id,
      };
    });

  const allExistingCustomerIds = new Set([
    ...savedClients.map((c: any) => c.customer_id),
    ...servicedClients.map((c: any) => c.customer_id),
  ]);

  const conversationClients = (conversationsData.data || [])
    .filter((client: any) => !allExistingCustomerIds.has(client.customer_id))
    .map((client: any) => {
      const fullName = client.customer?.full_name || "";
      const nameParts = fullName.trim().split(/\s+/);
      return {
        id: client.customer_id,
        first_name: nameParts[0] || "Unknown",
        last_name: nameParts.slice(1).join(" ") || "",
        email: client.customer?.email || "",
        phone: client.customer?.phone || "",
        notes: "",
        tags: [],
        created_at: client.last_message_date || client.customer?.created_at,
        last_visit: client.last_service_date || null,
        total_visits: client.total_bookings || 0,
        total_spent: client.total_spent || 0,
        average_rating: client.customer?.rating_average,
        birth_date: client.customer?.date_of_birth || null,
        marketing_consent: client.customer?.email_notifications_enabled ?? true,
        sms_consent: client.customer?.sms_notifications_enabled ?? true,
        is_saved: false,
        customer_id: client.customer_id,
      };
    });

  return [...savedClients, ...servicedClients, ...conversationClients].sort((a, b) => {
    if (a.is_saved && !b.is_saved) return -1;
    if (!a.is_saved && b.is_saved) return 1;
    const dateA = a.last_visit ? new Date(a.last_visit).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
    const dateB = b.last_visit ? new Date(b.last_visit).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
    return dateB - dateA;
  });
}
