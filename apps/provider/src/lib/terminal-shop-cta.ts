export type TerminalShopOrderCta =
  | { kind: "order"; enabled: true }
  | { kind: "out_of_stock"; enabled: false; message: string }
  | { kind: "checkout_disabled"; enabled: false; message: string }
  | { kind: "no_options"; enabled: false; message: string }
  | { kind: "staff_restricted"; enabled: false; message: string };

export function resolveTerminalShopOrderCta(input: {
  ecommerceEnabled: boolean;
  stockStatus: string;
  checkoutOptionsCount: number;
  isOwner?: boolean;
}): TerminalShopOrderCta {
  if (input.stockStatus === "out_of_stock") {
    return { kind: "out_of_stock", enabled: false, message: "Out of stock" };
  }
  if (input.isOwner === false) {
    return {
      kind: "staff_restricted",
      enabled: false,
      message: "Only the business owner can place terminal orders",
    };
  }
  if (!input.ecommerceEnabled) {
    return {
      kind: "checkout_disabled",
      enabled: false,
      message: "Checkout isn't enabled yet — contact Beautonomi support",
    };
  }
  if (input.checkoutOptionsCount === 0) {
    return {
      kind: "no_options",
      enabled: false,
      message: "This product isn't configured for checkout",
    };
  }
  return { kind: "order", enabled: true };
}

export function canConfirmTerminalCheckout(input: {
  selectedOption: unknown;
  checkoutOptionsCount: number;
  fulfillmentType: string;
  collectionLocationsCount: number;
  collectionLocationId: string;
  addressLine1: string;
  city: string;
  postalCode: string;
}): { ok: boolean; message?: string } {
  if (input.checkoutOptionsCount === 0) {
    return { ok: false, message: "This product isn't configured for checkout" };
  }
  if (!input.selectedOption) {
    return { ok: false, message: "Select a checkout option" };
  }
  if (input.fulfillmentType === "collection") {
    if (input.collectionLocationsCount === 0) {
      return { ok: false, message: "No pickup locations are configured yet" };
    }
    if (!input.collectionLocationId) {
      return { ok: false, message: "Select a pickup location" };
    }
  }
  if (input.fulfillmentType === "shipping" || input.fulfillmentType === "courier") {
    if (!input.addressLine1.trim() || !input.city.trim() || !input.postalCode.trim()) {
      return { ok: false, message: "Enter a delivery address (line 1, city, and postal code)" };
    }
  }
  return { ok: true };
}
