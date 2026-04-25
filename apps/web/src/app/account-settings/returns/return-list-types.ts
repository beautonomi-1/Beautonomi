export type ReturnRequestListItem = {
  id: string;
  product_name: string;
  reason: string;
  quantity: number;
  refund_amount: number;
  status: string;
  created_at: string;
  order: { id?: string; order_number: string; currency?: string | null; provider: { business_name: string } };
};
