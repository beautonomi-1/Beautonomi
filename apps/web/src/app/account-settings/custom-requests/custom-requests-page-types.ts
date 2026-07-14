export type CustomOfferSummary = {
  id: string;
  price: number;
  currency: string;
  duration_minutes: number;
  expiration_at: string;
  notes?: string | null;
  status: string;
  payment_url?: string | null;
  paid_at?: string | null;
  change_request_note?: string | null;
  staff_id?: string | null;
  location_id?: string | null;
  scheduled_at?: string | null;
  travel_fee?: number | null;
  staff?: { id: string; name: string } | null;
  location?: { id: string; name: string } | null;
};

export type CustomRequestListItem = {
  id: string;
  description: string;
  status: string;
  declined_reason?: string | null;
  preferred_start_at?: string | null;
  location_type: string;
  budget_min?: number | null;
  budget_max?: number | null;
  duration_minutes?: number | null;
  created_at: string;
  service_category_id?: string | null;
  service_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_country?: string | null;
  address_postal_code?: string | null;
  provider?: { business_name?: string | null; slug?: string | null } | null;
  customer?: { id: string; full_name?: string | null; email?: string | null; avatar_url?: string | null } | null;
  offers?: CustomOfferSummary[];
};

export type ProviderClientRow = {
  id: string;
  customer_id: string;
  customer?: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

export type CustomRequestsPageInitial = {
  mode: "customer" | "provider";
  items: CustomRequestListItem[];
  clients?: ProviderClientRow[];
  staffList?: Array<{ id: string; name: string }>;
  locationsList?: Array<{ id: string; name: string }>;
};
