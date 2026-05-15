import { APP_URL } from "@/config/public-env";

function webOrigin(): string {
  return APP_URL.replace(/\/$/, "");
}

/** Public marketing-site URLs (use with Linking or in-app browser before sign-in). */
export function webPrivacyPolicyUrl(): string {
  return `${webOrigin()}/privacy-policy`;
}

export function webTermsOfServiceUrl(): string {
  return `${webOrigin()}/terms-and-condition`;
}

export function webCookiePolicyUrl(): string {
  return `${webOrigin()}/cookie-policy`;
}
