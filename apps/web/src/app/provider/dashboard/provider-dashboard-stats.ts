/**
 * Dashboard API payload shape — shared by server fetch and client UI.
 */
export interface ProviderDashboardStats {
  total_bookings: number;
  active_bookings: number;
  confirmed_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  no_show_bookings: number;
  pending_bookings: number;

  at_home_bookings: number;
  at_salon_bookings: number;
  at_home_completed: number;
  at_salon_completed: number;
  at_home_confirmed: number;
  at_salon_confirmed: number;
  at_home_pending: number;
  at_salon_pending: number;
  at_home_cancelled: number;
  at_salon_cancelled: number;
  at_home_no_show: number;
  at_salon_no_show: number;

  revenue_this_month: number;
  revenue_this_week: number;
  revenue_today: number;
  revenue_growth: number;

  lifetime_revenue: number;

  available_balance: number;
  pending_payments_amount: number;
  pending_payments_count: number;

  service_earnings_total: number;
  booking_earnings_total?: number;
  product_order_earnings_total?: number;
  additional_charge_earnings_total?: number;
  other_earnings_total?: number;
  recognized_earnings_total?: number;
  tips_total?: number;
  tips_this_month?: number;
  gift_card_sales_total: number;
  membership_sales_total: number;
  refunds_total: number;

  platform_fees_deducted?: number;
  platform_commission_paid?: number;
  /** @deprecated use platform_commission_paid */
  platform_fees_paid?: number;
  expenses_total?: number;
  expenses_this_month?: number;

  travel_fees_total: number;
  travel_fees_today: number;
  travel_fees_this_month: number;
  travel_fees_last_month: number;

  completion_rate: number;
  no_show_rate: number;
  average_rating: number;
  total_reviews: number;

  appointments_today: number;
  appointments_this_week: number;
  appointments_this_month: number;

  gamification?: {
    total_points: number;
    lifetime_points: number;
    current_tier_points: number;
    current_badge: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      icon_url: string | null;
      tier: number;
      color: string;
      requirements: unknown;
      benefits: unknown;
    } | null;
    badge_earned_at: string | null;
    badge_expires_at: string | null;
    milestones: unknown[];
    recent_transactions: unknown[];
    progress_to_next_badge: {
      badge: {
        id: string;
        name: string;
        tier: number;
        color: string;
        requirements: unknown;
      };
      current_points: number;
      required_points: number;
      points_needed: number;
      progress_percentage: number;
    } | null;
  } | null;

  provider_profile?: {
    supports_house_calls: boolean;
    supports_salon: boolean;
    max_service_distance_km: number | null;
    is_distance_filter_enabled?: boolean;
  };
  dashboard_bundle_version?: number;
}
