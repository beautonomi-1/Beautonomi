export type CustomerReviewListItem = {
  id: string;
  booking_id: string;
  provider_id: string;
  rating: number;
  comment: string | null;
  photos: string[] | null;
  is_verified: boolean;
  provider_response?: string | null;
  provider_response_at?: string | null;
  created_at: string;
  updated_at: string;
  bookings: {
    id: string;
    booking_number: string;
    scheduled_at: string;
    status: string;
  } | null;
  providers: {
    id: string;
    business_name: string;
    thumbnail_url: string | null;
    avatar_url?: string | null;
  } | null;
};
