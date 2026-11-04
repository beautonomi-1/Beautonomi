/** Whether product-order checkout should include online platform fees (quote + create). */
export function isOnlineProductOrderCheckout(paymentMethod?: string | null): boolean {
  return !["cash", "yoco", "paycloud", "card_on_delivery"].includes(paymentMethod ?? "paystack");
}
