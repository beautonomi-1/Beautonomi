#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const settingsDir = path.join(
  __dirname,
  "../../../apps/provider/app/(app)/(tabs)/more/settings",
);

function patchSubscription() {
  const p = path.join(settingsDir, "subscription.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { pushWebPrivacyPolicy, pushWebPartnerEula } from "@/lib/legal-web";',
      'import { pushWebPrivacyPolicy, pushWebPartnerEula } from "@/lib/legal-web";\nimport { useTranslation } from "@beautonomi/i18n";',
    );
  }
  if (!s.includes("const sub = useCallback")) {
    s = s.replace(
      /export default function SubscriptionScreen\(\) \{\n/,
      `export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const sub = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(\`provider.mobile.screens.subscriptionSettings.\${key}\`, opts) as string,
    [t],
  );

`,
    );
    if (!s.includes("const sub = useCallback")) {
      s = s.replace(
        /export default function \w+\(\) \{\n  const router/,
        `export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const sub = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(\`provider.mobile.screens.subscriptionSettings.\${key}\`, opts) as string,
    [t],
  );
  const router`,
      );
    }
  }
  if (!s.includes("useCallback") && s.includes("const sub = useCallback")) {
    s = s.replace(
      'import { useState, useCallback, useEffect, useRef, useMemo } from "react";',
      'import { useState, useCallback, useEffect, useRef, useMemo } from "react";',
    );
  }

  const pairs = [
    ['Alert.alert("Error", err)', 'Alert.alert(sub("errorTitle"), err)'],
    ['Alert.alert("Done", "Subscription will be cancelled at the end of the period.")', 'Alert.alert(sub("doneTitle"), sub("cancelSuccess"))'],
    ['Alert.alert("Done", d.message ?? "Plan renewed.")', 'Alert.alert(sub("doneTitle"), d.message ?? sub("renewSuccess"))'],
    ['Alert.alert("No payment link", "Unable to start renewal. Please try again or contact support.")', 'Alert.alert(sub("noPaymentLink"), sub("noPaymentLinkBody"))'],
    ['Alert.alert("Error", "Could not generate card update link. You can also try completing payment below.")', 'Alert.alert(sub("errorTitle"), sub("cardUpdateFailed"))'],
    ['Alert.alert("Error", "Failed to get manage link.")', 'Alert.alert(sub("errorTitle"), sub("manageLinkFailed"))'],
    ['getApiErrorMessage(linkErr, "Could not generate a card update link. Please try again.")', 'getApiErrorMessage(linkErr, sub("cardUpdateFailed"))'],
    ['Alert.alert("Error", "Could not generate a card update link. Please try again.")', 'Alert.alert(sub("errorTitle"), sub("cardUpdateFailed"))'],
    ['Alert.alert("Success", "Free plan activated!")', 'Alert.alert(sub("successTitle"), sub("freePlanActivated"))'],
    ['Alert.alert("Could not activate plan", "Please try again or contact support.")', 'Alert.alert(sub("activatePlanFailed"), sub("activatePlanFailedBody"))'],
    ['Alert.alert("Error", "Your business account is still loading. Try again in a moment.")', 'Alert.alert(sub("errorTitle"), sub("accountLoading"))'],
    ['Alert.alert("Success", "Subscription updated!")', 'Alert.alert(sub("successTitle"), sub("subscriptionUpdated"))'],
    ['Alert.alert("Success", "Subscription activated through the App Store.")', 'Alert.alert(sub("successTitle"), sub("subscriptionActivatedAppStore"))'],
    ['<LoadingState message="Loading subscription..." />', '<LoadingState message={sub("loading")} />'],
    ['title="Subscription" showBack subtitle="Plan & billing"', 'title={sub("title")} showBack subtitle={sub("subtitle")}'],
    ['Alert.alert("Restore complete", "Your App Store purchases were synced.")', 'Alert.alert(sub("restoreComplete"), sub("restoreCompleteBody"))'],
    ['Alert.alert("Restore failed", result.error ?? "Could not restore purchases.")', 'Alert.alert(sub("restoreFailed"), result.error ?? sub("restoreFailedBody"))'],
    ['Alert.alert("Offer code", result.error ?? "Could not open the App Store offer-code sheet.")', 'Alert.alert(sub("offerCodeTitle"), result.error ?? sub("offerCodeFailed"))'],
    ['<SectionHeader title="Your plan" />', '<SectionHeader title={sub("yourPlan")} />'],
    ['<SectionHeader title="All plans" />', '<SectionHeader title={sub("allPlans")} />'],
    ['title="No plans" description="Subscription plans will appear here."', 'title={sub("noPlansTitle")} description={sub("noPlansDesc")}'],
    ['{ text: "Keep subscription", style: "cancel" }', '{ text: sub("keepSubscription"), style: "cancel" }'],
    ['text: "Cancel subscription",', 'text: sub("cancelSubscription"),'],
    ['"Cancel subscription",\n      "Your plan will remain active until the end of the current period. After that you will be moved to the free plan."', 'sub("cancelAtPeriodEndTitle"),\n      sub("cancelAtPeriodEndBody")'],
  ];
  for (const [from, to] of pairs) {
    if (s.includes(from)) s = s.replaceAll(from, to);
  }
  fs.writeFileSync(p, s);
  console.log("subscription.tsx patched");
}

function patchBusiness() {
  const p = path.join(settingsDir, "business.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("const bs = useCallback")) {
    s = s.replace(
      /export default function BusinessDetailsScreen\(\) \{\n  const router = useRouter\(\);\n  const \{ t \} = useTranslation\(\);/,
      `export default function BusinessDetailsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const bs = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(\`provider.mobile.screens.businessSettings.\${key}\`, opts) as string,
    [t],
  );`,
    );
  }
  const fieldMap = {
    business_name: "fieldBusinessName",
    email: "fieldEmail",
    phone: "fieldPhone",
    description: "fieldDescription",
    website: "fieldWebsite",
    address_line1: "fieldAddress",
    city: "fieldCity",
    state: "fieldState",
    postal_code: "fieldPostalCode",
    country: "fieldCountry",
  };
  s = s.replace(
    /const FIELD_LABELS: Record<string, string> = \{[\s\S]*?\};/,
    `const FIELD_LABELS: Record<string, string> = {
${Object.entries(fieldMap).map(([k, v]) => `  ${k}: bs("${v}"),`).join("\n")}
};`,
  );
  // Move FIELD_LABELS inside component - the above won't work as module level uses bs
  // Instead patch alerts and headers only
  s = fs.readFileSync(p, "utf8");
  if (!s.includes("const bs = useCallback")) {
    s = s.replace(
      /export default function BusinessDetailsScreen\(\) \{\n  const router = useRouter\(\);\n  const \{ t \} = useTranslation\(\);/,
      `export default function BusinessDetailsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const bs = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      t(\`provider.mobile.screens.businessSettings.\${key}\`, opts) as string,
    [t],
  );`,
    );
  }
  const pairs = [
    ['Alert.alert("Upload failed", "Could not read image. Try another photo.")', 'Alert.alert(bs("uploadFailedTitle"), bs("uploadReadFailed"))'],
    ['Alert.alert("Upload failed", res.error.message)', 'Alert.alert(bs("uploadFailedTitle"), res.error.message)'],
    ['e instanceof Error ? e.message : "Something went wrong."', 'e instanceof Error ? e.message : bs("uploadGenericFailed")'],
    ['Alert.alert("Upload failed",', 'Alert.alert(bs("uploadFailedTitle"),'],
    ['Alert.alert("Error", res.error.message)', 'Alert.alert(bs("errorTitle"), res.error.message)'],
    ['Alert.alert("Saved", "Business details updated.")', 'Alert.alert(bs("savedTitle"), bs("savedBody"))'],
    ['Alert.alert("Error", "Something went wrong. Please check your connection and try again.")', 'Alert.alert(bs("errorTitle"), bs("saveFailedBody"))'],
    ['<ScreenHeader title="Business details"', '<ScreenHeader title={bs("title")}'],
    ['accessibilityLabel="Change logo"', 'accessibilityLabel={bs("changeLogoA11y")}'],
    ['placeholder="Your business name"', 'placeholder={bs("businessNamePlaceholder")}'],
    ['placeholder="What you offer (shown to clients)"', 'placeholder={bs("descriptionPlaceholder")}'],
    ['accessibilityLabel="Select country code"', 'accessibilityLabel={bs("selectCountryCodeA11y")}'],
    ['accessibilityLabel="Business phone number without country code"', 'accessibilityLabel={bs("phoneNationalA11y")}'],
    ['accessibilityLabel="Years in business"', 'accessibilityLabel={bs("yearsInBusinessA11y")}'],
    ['placeholder="Start typing address…"', 'placeholder={bs("addressPlaceholder")}'],
    ['placeholder="City"', 'placeholder={bs("cityPlaceholder")}'],
    ['placeholder="Country"', 'placeholder={bs("countryPlaceholder")}'],
    ['label="Save changes"', 'label={bs("saveChanges")}'],
    ['label: "Instagram"', 'label: bs("instagram")'],
    ['label: "Facebook"', 'label: bs("facebook")'],
    ['label: "TikTok"', 'label: bs("tiktok")'],
    ['placeholder: "https://instagram.com/yourhandle"', 'placeholder: bs("instagramPlaceholder")'],
    ['placeholder: "https://facebook.com/yourpage"', 'placeholder: bs("facebookPlaceholder")'],
    ['placeholder: "https://tiktok.com/@yourhandle"', 'placeholder: bs("tiktokPlaceholder")'],
  ];
  for (const [from, to] of pairs) {
    if (s.includes(from)) s = s.replaceAll(from, to);
  }
  fs.writeFileSync(p, s);
  console.log("business.tsx patched");
}

function patchVerification() {
  const p = path.join(settingsDir, "verification.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes("useTranslation")) {
    s = s.replace(
      'import { LoadingState } from "@/components/ui/LoadingState";',
      'import { LoadingState } from "@/components/ui/LoadingState";\nimport { useTranslation } from "@beautonomi/i18n";',
    );
    s = s.replace(
      "export default function VerificationScreen() {\n  const router = useRouter();",
      `export default function VerificationScreen() {
  const { t } = useTranslation();
  const vs = (key: string) => t(\`provider.mobile.screens.verificationSettings.\${key}\`) as string;
  const router = useRouter();`,
    );
    s = s.replace(
      'title="Verification"',
      'title={vs("title")}',
    );
    s = s.replace(
      '<LoadingState message="Loading verification…" />',
      '<LoadingState message={vs("loading")} />',
    );
  }
  fs.writeFileSync(p, s);
  console.log("verification.tsx patched");
}

patchSubscription();
patchBusiness();
patchVerification();
