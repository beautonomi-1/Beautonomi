export interface ProductOrderSheetItem {
  id: string;
  product_name: string;
  quantity: number;
  total_price: number;
  fulfilment_status?: string | null;
  fulfilled_qty?: number | null;
  product_variant?: { option_values?: Record<string, string> } | null;
}

export interface ProductOrderSheetOrder {
  id: string;
  order_number: string;
  status: string;
  subtotal?: number;
  tax_amount?: number;
  delivery_fee?: number;
  discount_amount?: number;
  gift_card_amount?: number | null;
  promotion_code?: string | null;
  platform_fee?: number;
  total_amount: number;
  payment_status: string;
  fulfillment_type: string;
  order_source?: string | null;
  booking_id?: string | null;
  customer_name?: string | null;
  tracking_number: string | null;
  created_at: string;
  customer?: {
    id: string;
    full_name: string;
    email: string;
    identity_verified?: boolean | null;
  } | null;
  items: ProductOrderSheetItem[];
}

export const PRODUCT_ORDER_STATUS_ACTIONS: Record<
  string,
  { next: string; label: string }[]
> = {
  pending: [
    { next: "confirmed", label: "Confirm" },
    { next: "cancelled", label: "Cancel" },
  ],
  confirmed: [{ next: "processing", label: "Start processing" }],
  processing: [
    { next: "shipped", label: "Mark shipped" },
    { next: "ready_for_collection", label: "Ready for collection" },
  ],
  shipped: [{ next: "delivered", label: "Mark delivered" }],
  ready_for_collection: [{ next: "delivered", label: "Collected" }],
};

export const PRODUCT_ORDER_STATUS_OPTIONS = [
  "pending",
  "confirmed",
  "processing",
  "ready_for_collection",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];
