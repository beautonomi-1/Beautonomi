export type PaycloudEnvironment = "sandbox" | "live";

/**
 * Gateway roots (paths /api/entry/{ecrorder|orderquery|ecrclose} are appended).
 * @see https://developers.paycloud.africa/docs/addpay/CloudAPI/create-order/
 * Sandbox example in PayCloud docs: https://addpay-op.wangtest.cn
 */
export const PAYCLOUD_API_BASE: Record<PaycloudEnvironment, string> = {
  sandbox: "https://addpay-op.wangtest.cn",
  live: process.env.PAYCLOUD_API_BASE_LIVE ?? "https://api.paycloud.africa",
};

/** Official Cloud Mode entry paths */
export const PAYCLOUD_ENTRY_PATH = {
  order: "ecrorder",
  query: "orderquery",
  close: "ecrclose",
} as const;

export type PaycloudEntryKind = keyof typeof PAYCLOUD_ENTRY_PATH;

export function getPaycloudEntryPath(kind: PaycloudEntryKind): (typeof PAYCLOUD_ENTRY_PATH)[PaycloudEntryKind] {
  return PAYCLOUD_ENTRY_PATH[kind];
}

/** OpenAPI `method` field values (flat body, not biz_content) */
export const PAYCLOUD_METHODS = {
  CREATE_ORDER: "wisehub.cloud.pay.order",
  CLOSE_ORDER: "wisehub.cloud.pay.close",
  QUERY_ORDER: "order.query",
} as const;

export const PAYCLOUD_TRANS_TYPE = {
  SALE: 1,
  VOID: 2,
  REFUND: 3,
  SALE_WITH_CASHBACK: 11,
} as const;

export const PAYCLOUD_PAY_SCENARIO = {
  SWIPE_CARD: "SWIPE_CARD",
  SCANQR_PAY: "SCANQR_PAY",
  BSCANQR_PAY: "BSCANQR_PAY",
} as const;

/**
 * trans_status from Cloud Mode docs:
 * 9 = created (cancellable via ecrclose), 0 = processing, 2 = completed, 3 = cancelled
 */
export const PAYCLOUD_TRANS_STATUS = {
  CREATED: "9",
  PROCESSING: "0",
  CLOSED: "1",
  COMPLETED: "2",
  CANCELLED: "3",
} as const;

export function getPaycloudApiBase(environment: PaycloudEnvironment): string {
  const override =
    environment === "sandbox"
      ? process.env.PAYCLOUD_API_BASE_SANDBOX
      : process.env.PAYCLOUD_API_BASE_LIVE;
  return (override ?? PAYCLOUD_API_BASE[environment]).replace(/\/$/, "");
}

export function buildMerchantOrderNo(prefix = "BN"): string {
  // PayCloud merchant_order_no typically <= 32 chars
  const raw = `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  return raw.slice(0, 32);
}
