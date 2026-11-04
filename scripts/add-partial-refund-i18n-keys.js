/**
 * Ensures partial-refund UX strings exist in all package i18n locale files.
 * Uses English copy for every locale (API messages remain English).
 */
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "../packages/i18n/src/locales");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

const COPY = {
  partiallyRefundedContactProvider:
    "This order was partially refunded. Contact the provider to refund the remaining balance.",
  partiallyRefundedRefundRemaining:
    "This order was partially refunded. Mark it refunded for the remaining amount — cancel is not available.",
  refundRemainingHint: "Refund remaining",
  paymentPartiallyRefunded: "Partially refunded",
};

function setDeep(obj, keys, value) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  if (cur[last] === undefined) cur[last] = value;
}

const PATHS = [
  ["web", "accountSettings", "orderDetail", "partiallyRefundedContactProvider"],
  ["web", "accountSettings", "orderDetail", "paymentPartiallyRefunded"],
  ["customer", "mobile", "screens", "productOrderDetail", "partiallyRefundedContactProvider"],
  ["provider", "mobile", "screens", "productOrders", "partiallyRefundedRefundRemaining"],
  ["provider", "mobile", "screens", "productOrders", "refundRemainingHint"],
  ["web", "provider", "pages", "ecommerce/orders", "partiallyRefundedRefundRemaining"],
  ["web", "provider", "pages", "ecommerce/orders", "refundRemainingHint"],
];

const KEY_BY_PATH = {
  "web.accountSettings.orderDetail.partiallyRefundedContactProvider": COPY.partiallyRefundedContactProvider,
  "web.accountSettings.orderDetail.paymentPartiallyRefunded": COPY.paymentPartiallyRefunded,
  "customer.mobile.screens.productOrderDetail.partiallyRefundedContactProvider":
    COPY.partiallyRefundedContactProvider,
  "provider.mobile.screens.productOrders.partiallyRefundedRefundRemaining":
    COPY.partiallyRefundedRefundRemaining,
  "provider.mobile.screens.productOrders.refundRemainingHint": COPY.refundRemainingHint,
  "web.provider.pages.ecommerce/orders.partiallyRefundedRefundRemaining":
    COPY.partiallyRefundedRefundRemaining,
  "web.provider.pages.ecommerce/orders.refundRemainingHint": COPY.refundRemainingHint,
};

for (const file of files) {
  const fp = path.join(dir, file);
  const json = JSON.parse(fs.readFileSync(fp, "utf8"));
  let changed = false;
  for (const keys of PATHS) {
    const pathKey = keys.join(".");
    const before = JSON.stringify(json);
    setDeep(json, keys, KEY_BY_PATH[pathKey]);
    if (JSON.stringify(json) !== before) changed = true;
  }
  if (changed) {
    fs.writeFileSync(fp, `${JSON.stringify(json, null, 2)}\n`);
    console.log("updated", file);
  }
}

console.log("done");
