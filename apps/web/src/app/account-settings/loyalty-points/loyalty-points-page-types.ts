export type LoyaltyPointsTransaction = {
  id: string;
  type: string;
  points: number;
  /** Present on some API shapes; ledger rows may omit this */
  balance_after?: number;
  description: string;
  booking_ref?: string;
  expires_at?: string;
  created_at: string;
};

export type LoyaltyPointsPageData = {
  balance: {
    available: number;
    total_earned: number;
    total_redeemed: number;
    last_transaction_at?: string;
  };
  conversion: {
    rate: number;
    display: string;
    can_redeem_amount: number;
    currency: string;
  };
  config: {
    min_redemption_points: number;
    max_redemption_percentage: number;
    points_expiry_days: number;
    earning_rate: number;
  };
  recent_transactions: LoyaltyPointsTransaction[];
  pagination: {
    limit: number;
    offset: number;
    has_more: boolean;
  };
};
