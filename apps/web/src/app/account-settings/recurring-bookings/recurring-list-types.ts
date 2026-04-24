export type SimpleFrequency = "weekly" | "biweekly" | "monthly";

export type RecurringBookingListItem = {
  id: string;
  frequency?: SimpleFrequency | string | null;
  recurrence_rule?: string | null;
  start_date: string;
  end_date: string | null;
  preferred_time: string;
  location_type: "at_home" | "at_salon";
  payment_method?: string | null;
  is_active: boolean;
  provider: {
    id: string;
    business_name: string;
    slug?: string | null;
  };
  service_name?: string;
  provider_name?: string;
  next_date?: string | null;
  status?: "active" | "paused" | "cancelled";
  price?: number | null;
  currency?: string | null;
  metadata?: {
    services?: Array<{ offering_id: string; staff_id?: string }>;
    address?: { line1?: string; city?: string; state?: string; country?: string; postal_code?: string };
  };
  created_at: string;
};
