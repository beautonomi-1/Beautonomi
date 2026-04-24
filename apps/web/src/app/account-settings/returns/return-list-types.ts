export type ReturnRequestListItem = {
  id: string;
  product_name: string;
  reason: string;
  quantity: number;
  refund_amount: number;
  status: string;
  created_at: string;
  order: { order_number: string; provider: { business_name: string } };
};
