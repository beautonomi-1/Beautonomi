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
  /** Sum of payout requests in pending/processing (reserved from available balance). */
  pending_payout_queue?: number;
  /** Days before new platform-held earnings become withdrawable (from platform settings). */
  payout_hold_days?: number;
  /** Ledger balance before clamping to zero for display. */
  raw_payout_balance?: number;
  has_negative_payout_balance?: boolean;
  balance_owed_to_platform?: number;
  pending_payments_amount: number;
  pending_payments_count: number;

  service_earnings_total: number;
  booking_earnings_total?: number;
  product_order_earnings_total?: number;
  additional_charge_earnings_total?: number;
  other_earnings_total?: number;
  recognized_earnings_total?: number;
  product_order_retail_total?: number;
  retail_sales_today?: number;
  retail_sales_this_week?: number;
  retail_sales_this_month?: number;
  earnings_mix_time_basis?: string;
  metrics_time_basis?: string;
  unrecognized_payments_today?: number;
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

  bookings_truncated?: boolean;
  ledger_truncated?: boolean;

  period_breakdown?: {
    today?: DashboardPeriodSlice;
    this_week?: DashboardPeriodSlice;
    this_month?: DashboardPeriodSlice;
  };
  period_comparison?: {
    today?: DashboardPeriodComparison;
    this_week?: DashboardPeriodComparison;
    this_month?: DashboardPeriodComparison;
  };

  insights?: DashboardInsights | null;
  booking_eligibility?: {
    can_accept_online_bookings: boolean;
    booking_limit_message: string | null;
  } | null;
}

export type DashboardPeriodChannelMix = {
  online: number;
  walk_in: number;
  provider: number;
};

export type DashboardPeriodEarningsMix = {
  service_earnings: number;
  product_order_earnings: number;
  membership_earnings: number;
  additional_charge_earnings: number;
  other_earnings: number;
  tips: number;
  travel_fees: number;
  gift_card_sales: number;
  membership_sales: number;
  refunds: number;
  recognized_total: number;
};

export type DashboardPeriodSlice = {
  revenue: number;
  appointments: number;
  retail_sales: number;
  retail_sales_count: number;
  earnings_mix: DashboardPeriodEarningsMix;
  channel_mix?: DashboardPeriodChannelMix;
  booking_status: {
    pending: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    no_show: number;
    scheduled_total: number;
  };
  performance: {
    completion_rate: number;
    no_show_rate: number;
  };
};

export type DashboardPeriodComparison = {
  revenue_growth_pct: number;
  appointments_growth_pct: number;
  prior_revenue: number;
  prior_appointments: number;
  prior_label: string;
};

export type DashboardInsightsBooking = {
  id: string;
  booking_number: string;
  status: string;
  scheduled_at: string;
  total_amount: number;
  currency: string;
  location_type: string;
  services: Array<{
    name?: string;
    offering_name?: string;
    duration_minutes: number;
    staff_name: string | null;
    guest_name?: string | null;
  }>;
  customers: { full_name: string; phone: string } | null;
  is_group_booking?: boolean;
  group_booking_id?: string | null;
};

export type DashboardInsights = {
  weekly_revenue: Array<{ day: string; revenue: number }>;
  top_services: Array<{ service_name: string; booking_count: number; total_revenue: number }>;
  recent_activity: Array<{
    id: string;
    type: string;
    description: string;
    created_at: string;
    data?: {
      booking_id?: string;
      product_order_id?: string;
      client_name?: string;
      amount?: number;
    };
  }>;
  upcoming_bookings: DashboardInsightsBooking[];
  basis?: {
    upcoming?: string;
    activity?: string | null;
    activity_window?: string | null;
  };
};
