export interface OrderItem {
  id: string;
  product_name: string;
  product_image_url: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface ProductOrder {
  id: string;
  order_number: string;
  status: string;
  fulfillment_type: string;
  total_amount: number;
  created_at: string;
  tracking_number: string | null;
  items: OrderItem[];
  provider: { id: string; business_name: string; slug: string };
}
