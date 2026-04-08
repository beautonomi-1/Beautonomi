import { CONSENT_SCHEMA_VERSION } from "./constants";

export type CookieCategoryKey = "necessary" | "analytics" | "functional" | "marketing";

export interface CookieCategorySelection {
  /** Always true — required for security, session, and core operation. */
  necessary: true;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
}

export interface StoredCookieConsent {
  schemaVersion: typeof CONSENT_SCHEMA_VERSION;
  policyVersion: string;
  updatedAt: string;
  categories: CookieCategorySelection;
}
