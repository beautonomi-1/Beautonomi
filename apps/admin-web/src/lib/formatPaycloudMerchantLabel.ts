export function formatPaycloudMerchantOptionLabel(merchant: {
  label: string;
  merchant_no: string;
  store_no?: string;
  environment?: string;
}): string {
  const env =
    merchant.environment === "sandbox"
      ? "Test"
      : merchant.environment === "live"
        ? "Live"
        : merchant.environment ?? "—";
  return `${merchant.label} · ${env} · ${merchant.merchant_no}`;
}
