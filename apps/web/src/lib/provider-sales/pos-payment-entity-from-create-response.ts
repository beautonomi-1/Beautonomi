export function posPaymentEntityFromCreateResponse(data: {
  id: string;
  migrated_to_product_order?: boolean;
  product_order_id?: string | null;
}): { entityType: "sale" | "product_order"; entityId: string } {
  if (data.migrated_to_product_order && data.product_order_id) {
    return { entityType: "product_order", entityId: data.product_order_id };
  }
  return { entityType: "sale", entityId: data.id };
}
