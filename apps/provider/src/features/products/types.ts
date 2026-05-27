export interface ProductVariantRow {
  id?: string;
  option_values: Record<string, string>;
  sku: string;
  barcode: string;
  measure: string;
  amount: number;
  quantity: number;
  low_stock_level: number;
  reorder_quantity: number;
  supply_price: number;
  retail_price: number;
  markup: number;
  image_url: string;
  sort_order?: number;
}

export interface VariantOptionType {
  name: string;
  values: string[];
}

export interface ProductItem {
  id: string;
  name: string;
  barcode?: string | null;
  brand?: string | null;
  measure?: string | null;
  amount?: number | null;
  short_description?: string | null;
  description?: string | null;
  category?: string | null;
  supplier?: string | null;
  sku?: string | null;
  quantity?: number;
  low_stock_level?: number;
  reorder_quantity?: number;
  supply_price?: number;
  retail_price?: number;
  retail_sales_enabled?: boolean;
  markup?: number | null;
  tax_rate?: number;
  team_member_commission_enabled?: boolean;
  track_stock_quantity?: boolean;
  receive_low_stock_notifications?: boolean;
  image_urls?: string[];
  is_active?: boolean;
  has_variants?: boolean;
  variant_option_types?: VariantOptionType[];
  variants?: ProductVariantRow[];
  effective_quantity?: number;
  created_at?: string;
}

export interface ProductFormState {
  name: string;
  barcode: string;
  brand: string;
  measure: string;
  amount: string;
  short_description: string;
  description: string;
  category: string;
  supplier: string;
  sku: string;
  quantity: string;
  low_stock_level: string;
  reorder_quantity: string;
  supply_price: string;
  retail_price: string;
  markup: string;
  tax_rate: string;
  retail_sales_enabled: boolean;
  team_member_commission_enabled: boolean;
  track_stock_quantity: boolean;
  receive_low_stock_notifications: boolean;
  is_active: boolean;
  image_urls: string[];
  hasVariants: boolean;
  variantOptionTypes: VariantOptionType[];
  variantRows: ProductVariantRow[];
}

export type StockMovementType =
  | "manual_in"
  | "manual_out"
  | "stock_count"
  | "damaged"
  | "returned"
  | "received"
  | "sale"
  | "sale_refund"
  | "booking"
  | "booking_revert"
  | "initial";

export interface StockMovement {
  id: string;
  product_id: string;
  product_variant_id?: string | null;
  movement_type: StockMovementType;
  quantity_delta: number;
  quantity_after: number;
  reason?: string | null;
  note?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  actor_user_id?: string | null;
  created_at: string;
  actor?: { full_name?: string; display_name?: string } | null;
}

export interface ProductSection {
  sectionKey: string;
  title: string;
  sortOrder: number;
  items: ProductItem[];
}

export const OTHER_PRODUCTS_KEY = "other";
export const OTHER_PRODUCTS_SORT_ORDER = 9999;
export const UNCATEGORIZED_PRODUCT_LABEL = "Other Products";

export const STOCK_ADJUST_REASONS = [
  { value: "stock_count", label: "Stock count" },
  { value: "received", label: "Received from supplier" },
  { value: "returned", label: "Returned" },
  { value: "damaged", label: "Damaged" },
  { value: "manual_in", label: "Manual add" },
  { value: "manual_out", label: "Manual remove" },
] as const;
