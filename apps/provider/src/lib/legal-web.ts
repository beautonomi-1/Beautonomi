import type { Router } from "expo-router";
import { APP_URL } from "@/config/public-env";
import { pushInAppBrowser } from "@/lib/in-app-web";

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

export function webAgeSuitabilityUrl(): string {
  return `${webOrigin()}/age-suitability`;
}

/** Marketing-site guides & articles (parity with web Help → Learning Center). */
export function webLearningCenterUrl(): string {
  return `${webOrigin()}/learn`;
}

export function pushWebPrivacyPolicy(router: Router): void {
  pushInAppBrowser(router, webPrivacyPolicyUrl(), "Privacy policy");
}

export function pushWebAgeSuitability(router: Router): void {
  pushInAppBrowser(router, webAgeSuitabilityUrl(), "Age suitability");
}

export function pushWebLearningCenter(router: Router): void {
  pushInAppBrowser(router, webLearningCenterUrl(), "Learning Centre");
}
