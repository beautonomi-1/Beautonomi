export type PaymentMethodRow = {
  id: string;
  type: string;
  card_type?: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  expiry_label?: string;
  is_expired?: boolean;
  cardholder_name?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
};

export type PaymentSafetyCopyInitial = {
  title: string;
  body: string;
  learn_more_url: string;
  learn_more_label: string;
};

export type PaymentsPageInitial = {
  paymentMethods: PaymentMethodRow[];
  couponCount: number;
  paymentSafetyCopy: PaymentSafetyCopyInitial | null;
};
