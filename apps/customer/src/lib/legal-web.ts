import type { Router } from "expo-router";
import { APP_URL } from "@/config/public-env";

function webOrigin(): string {
  return APP_URL.replace(/\/$/, "");
}

/** Use with `Linking.openURL` from `(auth)` routes — `(app)` is not mounted before sign-in. */
export function webPrivacyPolicyUrl(): string {
  return `${webOrigin()}/privacy-policy`;
}

export function webTermsOfServiceUrl(): string {
  return `${webOrigin()}/terms-and-condition`;
}

export function webCookiePolicyUrl(): string {
  return `${webOrigin()}/cookie-policy`;
}

type LegalParams = { url: string; title: string };

function privacyParams(): LegalParams {
  return {
    url: encodeURIComponent(webPrivacyPolicyUrl()),
    title: encodeURIComponent("Privacy policy"),
  };
}

function termsParams(): LegalParams {
  return {
    url: encodeURIComponent(webTermsOfServiceUrl()),
    title: encodeURIComponent("Terms of service"),
  };
}

function cookieParams(): LegalParams {
  return {
    url: encodeURIComponent(webCookiePolicyUrl()),
    title: encodeURIComponent("Cookie policy"),
  };
}

/** In-app WebView: canonical marketing-site privacy policy. */
export function pushWebPrivacyPolicy(router: Router): void {
  const { url, title } = privacyParams();
  router.push({ pathname: "/(app)/in-app-browser", params: { url, title } } as never);
}

/** Replace current screen (e.g. stub route) with the same WebView. */
export function replaceWebPrivacyPolicy(router: Router): void {
  const { url, title } = privacyParams();
  router.replace({ pathname: "/(app)/in-app-browser", params: { url, title } } as never);
}

export function pushWebTermsOfService(router: Router): void {
  const { url, title } = termsParams();
  router.push({ pathname: "/(app)/in-app-browser", params: { url, title } } as never);
}

export function replaceWebTermsOfService(router: Router): void {
  const { url, title } = termsParams();
  router.replace({ pathname: "/(app)/in-app-browser", params: { url, title } } as never);
}

export function pushWebCookiePolicy(router: Router): void {
  const { url, title } = cookieParams();
  router.push({ pathname: "/(app)/in-app-browser", params: { url, title } } as never);
}
