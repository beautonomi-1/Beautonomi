/**
 * Parity with apps/web `lib/express-booking/prefill` for express-link → book query params.
 */

export type ProductCartLine = {
  product_id: string;
  quantity: number;
  product_variant_id?: string | null;
};

export function productCartToQueryParam(cart: ProductCartLine[]): string {
  return encodeURIComponent(JSON.stringify(cart));
}
