export type WaitlistEntry = {
  id: string;
  provider_id: string;
  service_id: string | null;
  staff_id: string | null;
  preferred_date: string | null;
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  status: "waiting" | "contacted" | "booked" | "cancelled";
  created_at: string;
  provider: {
    id: string;
    business_name: string;
    slug: string;
  };
  service: {
    id: string;
    title: string;
  } | null;
  staff: {
    id: string;
    name: string;
  } | null;
};
