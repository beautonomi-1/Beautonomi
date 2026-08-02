/**
 * PayCloud UAT / sandbox fixtures (Beautonomi non-live environment).
 * Served only via superadmin API — never bundle into client SPAs.
 * Gateway: https://open-uat.paycloud.africa
 */
export const PAYCLOUD_SANDBOX_FIXTURES = {
  api_base_url: "https://open-uat.paycloud.africa",
  app_id: "wz56242bd3c170b130",
  merchant_no: "322600014105",
  store_no: "4226000567",
  /** Bantu UAT Wiseasy device — enrolled under store 4226000567. */
  terminal_sn: "WPHK002434000635",
  /** PayCloud gateway public key (UAT Key Management — update if webhook signature verify fails). */
  gateway_rsa_public_key:
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2m4nkQKyQAxJc8VVsz/L6qVbtDWRTBolUK8Dwhi9wH6aygA6363PVNEPM8eRI5W19ssCyfdtNFy6DRAureoYV053ETPUefEA5bHDOQnjbb9PuNEfT651v8cqwEaTptaxj2zujsWI8Ad3R50EyQHsskQWms/gv2aB36XUM4vyOIk4P1f3dxtqigH0YROEYiuwFFqsyJuNSjJzNbCmfgqlQv/+pE/pOV9MIQe0CAdD26JF10QpSssEwKgvKvnXPUynVu09cjSEipev5cLJSApKSDZxrRjSFBXrh6nzg8JK05ehkI8wdsryRUneh0PGN0PgYLP/wjKiqlgTJaItxnb/JQIDAQAB",
  /** SPKI public key paired with app_rsa_private_key_pkcs8 (register in PayCloud UAT key management). */
  app_rsa_public_key:
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuQr3+sjt0DfDeTGeyc0Y7ldb+RUq3DpeCH+jPxhbwYOntlJmTda3E175F2bH+C0Rsgmvwq0f14+RRxmxaOCLAEayw4LjNOeqxNERLqOwxSOnL5gIW98EZfSJOFgQdnPcTh9IeQd0h1E/u+aKA2utEcqgcqgwiTXgo1aW4wyY7tMyf2EA1Et/7G+g2vuap035D2Z3Nv2g2LewDG/y/2vYV2iCO/sC0B4ZNmyhWjZg39arGKxnNZM3CMk1jYA43KNuA+yZWdCih/RiAeGfxm6vQpbTLXUUbi4u05T7ifKnCZYxEJkH+Iny0wR9RvzjpjeNCMp+SrKgNG8phxoD6zliKwIDAQAB",
  /** PKCS#8 app private key (Beautonomi UAT — never save to live). */
  app_rsa_private_key_pkcs8:
    "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5Cvf6yO3QN8N5MZ7JzRjuV1v5FSrcOl4If6M/GFvBg6e2UmZN1rcTXvkXZsf4LRGyCa/CrR/Xj5FHGbFo4IsARrLDguM056rE0REuo7DFI6cvmAhb3wRl9Ik4WBB2c9xOH0h5B3SHUT+75ooDa60RyqByqDCJNeCjVpbjDJju0zJ/YQDUS3/sb6Da+5qnTfkPZnc2/aDYt7AMb/L/a9hXaII7+wLQHhk2bKFaNmDf1qsYrGc1kzcIyTWNgDjco24D7JlZ0KKH9GIB4Z/Gbq9CltMtdRRuLi7TlPuJ8qcJljEQmQf4ifLTBH1G/OOmN40Iyn5KsqA0bymHGgPrOWIrAgMBAAECggEAIXMpJq2Bx9z8ugDNSn+H3TXvi1RXPh5S90hTc0ls9Mte2ueEVNfWmmrVrnRG+8bx5vQ3UILJOcdbJLYxStskZXViRVN4zQx/4zpD1+GBR/HM/B6IjEsBWYjd8VCCEVeaYIjpKe++EeQPGGFxW3Lwg0HUxUVAGN2jcQNrHToevzUhJwintEhGSNm/QLooCcwAvgFdCNj+KexoCtoOjmZr3pgYQJXPoA4pS0UTDAsmVWNf529ZrmSxmJaqVtwDzIhKPPIeQQ/CW0p/92TfwG8HQGau7YEfk7zgwcwJIbjQOvMGwrUkdbc6NpRBO+dBsfPjHLqB/7e21uzIcX12YGF0oQKBgQD2NZj4gQJOb2E4Apkf3PHD1KFykTwdwMZ9GjJBaujirsVRXBStf+IBkUEJYKwvGW+F+aYnhAw4t3ZhAvIcAoJaNYh5VHJCnSLd9F1fborYCzG36IzJMiCzHMhOsFXFzaPY2fu6C8KqZp9wpsNxzDIRsBUkUL3eC4H1q1Peo70B8QKBgQDAZrK7WyFgqGyvzGeQE4FXhcsRWVMnzEb8ozylyx4a9IzUPpEU8YykgQK+/29ODKNRv2DPGGYgaQtfEG+WN5XmVgszSswuijrgAC/5Q+KNC6j5CWVBjougAJkjv0XXJeDkElBO9xe2aqfpP6/kOQXej5/r39vaXpxxPkpwF6tJ2wKBgBxj38i/74kl1LsFqax/6KzhJuC0GI+BvCGO1L6wWjxRVNVl3ciH14LAwhQXvqMLts1nFR63XkVn+lGDanGKZIeMZrk+4JIH1o5rcBzh/UaeO9RuD1Xf3t9ocTyJnspZRQxrTliMpJzLipUN1bmYhyl8+WMfoFUrVIgEgn5IuTGxAoGAD/V0xc2dSyMtQLe3r1+uzs+uNFYwa5CqIrJ3iVj7ukimlcRKzG3suIhq7eTKGrM5qMIzCXqAnheYdd4rI06hBGYGr854eTPGBmZ9lDNpS0G4Vk/NMk7cjfz+ttRauqnNqZ1LRAGC2gKmwtYhhNCmB/vpy+rZlZdbapk8G2gbMRkCgYEApcvvYUhptuvImSToekuATUOaA0BbKjLXEEnLECzfmaBYWquaI/VMX736ABgcIkC6i4HmPl5SJJziWP6pWJC2phMp7bQbeQebSknH8hnE3dYG5EWF6Ur8M+Gn44HgjLsKHzoXlcLt5zC9LkE3Aj2O/Vf4NvE6V3O8U8N7GnuHCD0=",
} as const;

const SANDBOX_GATEWAY_HOST = "open-uat.paycloud.africa";

export function isPaycloudSandboxFixtureValue(
  environment: "live" | "sandbox",
  field: "app_id" | "merchant_no" | "gateway_rsa_public_key" | "api_base_url",
  value: string | null | undefined,
): boolean {
  if (environment !== "live") return false;
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (field === "app_id") return trimmed === PAYCLOUD_SANDBOX_FIXTURES.app_id;
  if (field === "merchant_no") return trimmed === PAYCLOUD_SANDBOX_FIXTURES.merchant_no;
  if (field === "api_base_url") {
    // Host comparison so any path/scheme form of the sandbox gateway is caught.
    try {
      return new URL(trimmed).hostname.toLowerCase() === SANDBOX_GATEWAY_HOST;
    } catch {
      return trimmed === PAYCLOUD_SANDBOX_FIXTURES.api_base_url;
    }
  }
  if (field === "gateway_rsa_public_key") {
    return trimmed === PAYCLOUD_SANDBOX_FIXTURES.gateway_rsa_public_key;
  }
  return false;
}

export function paycloudSandboxFixtureMatchesLiveSave(payload: {
  app_id?: string;
  merchant_no?: string;
  gateway_rsa_public_key?: string;
  api_base_url?: string;
}): string | null {
  for (const field of ["app_id", "gateway_rsa_public_key", "api_base_url"] as const) {
    if (isPaycloudSandboxFixtureValue("live", field, payload[field])) {
      return `Sandbox test ${field} cannot be saved to the live environment.`;
    }
  }
  return null;
}
