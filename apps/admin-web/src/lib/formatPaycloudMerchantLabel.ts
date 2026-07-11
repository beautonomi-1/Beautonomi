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
  const store = merchant.store_no?.trim() ? ` / ${merchant.store_no.trim()}` : "";
  return `${merchant.label} · ${env} · ${merchant.merchant_no}${store}`;
}
