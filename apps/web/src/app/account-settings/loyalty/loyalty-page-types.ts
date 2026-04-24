export type LoyaltyPageData = {
  points_balance: number;
  redemption_value: number;
  redemption_currency: string;
  redemption_rate: number;
  points_per_currency_unit: number;
  next_milestone: {
    id: string;
    name: string;
    description?: string | null;
    points_threshold: number;
    reward_type: string;
    reward_amount: number;
    reward_currency: string;
  } | null;
  available_milestones: Array<{
    id: string;
    name: string;
    description?: string | null;
    points_threshold: number;
    reward_type: string;
    reward_amount: number;
    reward_currency: string;
  }>;
  history: Array<{
    id: string;
    points: number;
    transaction_type: string;
    description?: string | null;
    created_at: string;
  }>;
};
