#!/usr/bin/env node
/**
 * Wire leftover English copy in login + custom-request pages.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function replaceAll(file, replacements) {
  const abs = path.join(root, file);
  let src = fs.readFileSync(abs, "utf8");
  for (const [from, to] of replacements) {
    if (!src.includes(from)) {
      console.warn("MISS", file, JSON.stringify(from).slice(0, 80));
      continue;
    }
    src = src.split(from).join(to);
  }
  fs.writeFileSync(abs, src);
  console.log("patched", file);
}

replaceAll("apps/web/src/app/login/page.tsx", [
  [
    `const msg = "Please enter a valid phone number with country code (e.g. +27 82 345 6789).";`,
    `const msg = t("web.login.errors.validPhoneWithCountry");`,
  ],
  [
    `{spinner} Verifying…`,
    `{spinner} {t("web.login.verifying")}`,
  ],
  [
    `"Verify & continue"`,
    `t("web.login.verifyAndContinue")`,
  ],
  [
    `Use a different number`,
    `{t("web.login.useDifferentNumber")}`,
  ],
  [
    `                  We&apos;ll email you a {publicAuth.email_otp_length}-digit verification code (valid about{" "}
                  {emailExpiryMin} {emailExpiryMin === 1 ? "minute" : "minutes"}). No password needed.`,
    `                  {t("web.login.emailOtpHint", {
                    length: publicAuth.email_otp_length,
                    minutes: emailExpiryMin,
                    minuteLabel: emailExpiryMin === 1 ? t("web.global.loginModal.minute") : t("web.global.loginModal.minutes"),
                  })}`,
  ],
  [
    `              Use <span className="font-semibold text-primary">password</span> instead`,
    `              {t("web.login.usePasswordInstead")}`,
  ],
  [
    `                  Code valid for{" "}`,
    `                  {t("web.login.codeValidFor")}{" "}`,
  ],
  [
    `              Use a different email`,
    `{t("web.login.useDifferentEmail")}`,
  ],
  [
    `                  Caps Lock is on.`,
    `                  {t("web.login.capsLockOn")}`,
  ],
  [
    `{spinner} Signing in…`,
    `{spinner} {t("web.login.signingIn")}`,
  ],
  [
    `              Sign in with an <span className="font-semibold text-primary">email code</span> instead`,
    `              {t("web.login.signInWithEmailCode")}`,
  ],
  [
    `              By continuing, you agree to our{" "}
              <Link href="/terms-and-condition" className="font-medium text-gray-500 underline hover:text-gray-700">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy-policy" className="font-medium text-gray-500 underline hover:text-gray-700">
                Privacy Policy
              </Link>
              .`,
    `              {t("web.login.legalBefore")}{" "}
              <Link href="/terms-and-condition" className="font-medium text-gray-500 underline hover:text-gray-700">
                {t("web.login.legalTerms")}
              </Link>{" "}
              {t("web.login.legalAnd")}{" "}
              <Link href="/privacy-policy" className="font-medium text-gray-500 underline hover:text-gray-700">
                {t("web.login.legalPrivacy")}
              </Link>
              {t("web.login.legalAfter")}`,
  ],
]);

replaceAll("apps/web/src/app/partner-profile/components/request-custom-service-page.tsx", [
  [
    `toast.error("Please drop image files only (PNG, JPG, WebP, GIF).");`,
    `toast.error(pp("customDropImagesOnly"));`,
  ],
  [
    `toast.error(\`"\${f.name}" is over 5MB. Choose a smaller image.\`);`,
    `toast.error(pp("customImageTooLarge", { name: f.name }));`,
  ],
  [
    `toast.error("Maximum 6 images allowed");`,
    `toast.error(pp("customMaxImages"));`,
  ],
  [
    "`${response.data.count || response.data.urls.length} image${(response.data.count || response.data.urls.length) > 1 ? \"s\" : \"\"} uploaded successfully`",
    'pp("customImagesUploaded", { count: response.data.count || response.data.urls.length })',
  ],
  [
    `const msg = error instanceof FetchError ? error.message : "Failed to upload images";`,
    `const msg = error instanceof FetchError ? error.message : pp("customUploadFailed");`,
  ],
  [
    `toast.error("Please provide at least a street address and city for at-home services");`,
    `toast.error(pp("customNeedStreetCity"));`,
  ],
  [
    `toast.error("Maximum budget must be greater than or equal to minimum budget");`,
    `toast.error(pp("customBudgetOrder"));`,
  ],
  [
    `toast.success("Custom request sent");`,
    `toast.success(pp("customRequestSent"));`,
  ],
  [
    `toast.error(e instanceof FetchError ? e.message : "Failed to send request");`,
    `toast.error(e instanceof FetchError ? e.message : pp("customSendFailed"));`,
  ],
  [
    `{ label: "Wedding/Event", value: "I'm looking for services for my wedding/event. I need..." },
    { label: "Special Occasion", value: "I have a special occasion coming up and would like..." },
    { label: "Package Deal", value: "I'm interested in a custom package that includes..." },
    { label: "Group Booking", value: "I'd like to book services for a group of people..." },`,
    `{ label: pp("customTplWedding"), value: pp("customTplWeddingBody") },
    { label: pp("customTplOccasion"), value: pp("customTplOccasionBody") },
    { label: pp("customTplPackage"), value: pp("customTplPackageBody") },
    { label: pp("customTplGroup"), value: pp("customTplGroupBody") },`,
  ],
  [
    `                  What are you looking for? <span className="text-red-500">*</span>`,
    `                  {pp("customLookingFor")} <span className="text-red-500">*</span>`,
  ],
  [
    `{description.trim().length} characters`,
    `{pp("customCharCount", { count: description.trim().length })}`,
  ],
  [
    `{description.trim().length} / 10 chars min`,
    `{pp("customCharsMin", { count: description.trim().length })}`,
  ],
  [
    `placeholder="Example: I'm planning a wedding and need a complete bridal package including hair, makeup, and nails for myself and 3 bridesmaids. The wedding is on [date] and I prefer a natural, elegant look with soft pink tones..."`,
    `placeholder={pp("customDescriptionPlaceholder")}`,
  ],
  [
    `                💡 Tip: Include the occasion, number of people, preferred style/colors, and any special requirements`,
    `                {pp("customDescriptionTip")}`,
  ],
  [
    `                Budget Range <span className="text-xs font-normal text-gray-500">(Optional)</span>`,
    `                {pp("customBudgetRange")} <span className="text-xs font-normal text-gray-500">{pp("customOptional")}</span>`,
  ],
  [
    `                    Minimum ({currencyCode})`,
    `                    {pp("customBudgetMin", { currency: currencyCode })}`,
  ],
  [
    `                    Maximum ({currencyCode})`,
    `                    {pp("customBudgetMax", { currency: currencyCode })}`,
  ],
  [
    `              <p className="text-xs text-gray-500">💡 Helps the provider create a quote that fits your budget</p>`,
    `              <p className="text-xs text-gray-500">{pp("customBudgetTip")}</p>`,
  ],
  [
    `                When & How Long <span className="text-xs font-normal text-gray-500">(Optional)</span>`,
    `                {pp("customWhenHowLong")} <span className="text-xs font-normal text-gray-500">{pp("customOptional")}</span>`,
  ],
  [
    `                    Preferred Date & Time`,
    `                    {pp("customPreferredWhen")}`,
  ],
  [
    `                    Estimated Duration`,
    `                    {pp("customEstimatedDuration")}`,
  ],
  [
    `<span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">minutes</span>`,
    `<span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">{pp("customMinutes")}</span>`,
  ],
  [
    `              <p className="text-xs text-gray-500">💡 Flexible? Leave blank and the provider will suggest available times</p>`,
    `              <p className="text-xs text-gray-500">{pp("customFlexibleHint")}</p>`,
  ],
  [
    `                Service Location`,
    `                {pp("customServiceLocation")}`,
  ],
  [
    `                  At Salon
                </button>`,
    `                  {pp("atSalon")}
                </button>`,
  ],
  [
    `                  At Home
                </button>`,
    `                  {pp("atYourHome")}
                </button>`,
  ],
  [
    `                    label="Search address"
                    placeholder="Start typing your street address…"`,
    `                    label={pp("customSearchAddress")}
                    placeholder={pp("customSearchAddressPlaceholder")}`,
  ],
  [
    `                    Pick a suggestion for the best match, or finish typing and add city / postal code below.`,
    `                    {pp("customAddressHint")}`,
  ],
  [
    `                      Unit / suite (optional)`,
    `                      {pp("customUnitOptional")}`,
  ],
  [
    `                      placeholder="Apartment, floor, building…"`,
    `                      placeholder={pp("customUnitPlaceholder")}`,
  ],
  [
    `                        City <span className="text-red-500">*</span>`,
    `                        {pp("customCity")} <span className="text-red-500">*</span>`,
  ],
  [
    `                        placeholder="City"`,
    `                        placeholder={pp("customCity")}`,
  ],
  [
    `                        Postal code
                    </Label>`,
    `                        {pp("customPostal")}
                    </Label>`,
  ],
  [
    `                        placeholder="Postal code"`,
    `                        placeholder={pp("customPostal")}`,
  ],
  [
    `                      Province / state
                    </Label>`,
    `                      {pp("customProvince")}
                    </Label>`,
  ],
  [
    `                      placeholder="Province / state"`,
    `                      placeholder={pp("customProvince")}`,
  ],
  [
    `                Inspiration Photos
                <span className="text-xs font-normal text-gray-500">(Optional)</span>`,
    `                {pp("customInspiration")}
                <span className="text-xs font-normal text-gray-500">{pp("customOptional")}</span>`,
  ],
  [
    `                      <span className="text-sm text-gray-600">Uploading images...</span>`,
    `                      <span className="text-sm text-gray-600">{pp("customUploading")}</span>`,
  ],
  [
    `                          ? "Maximum 6 images reached"
                          : "Click to upload or drag and drop"}`,
    `                          ? pp("customMaxReached")
                          : pp("customClickUpload")}`,
  ],
  [
    `                      <span className="text-xs text-gray-500">PNG, JPG, WebP, GIF up to 5MB each</span>`,
    `                      <span className="text-xs text-gray-500">{pp("customImageTypes")}</span>`,
  ],
  [
    `                            alt={\`Inspiration \${index + 1}\`}`,
    `                            alt={pp("customInspirationAlt", { index: index + 1 })}`,
  ],
  [
    `                            aria-label="Remove image"`,
    `                            aria-label={pp("customRemoveImage")}`,
  ],
  [
    `                    Or paste image URLs (one per line or comma-separated)`,
    `                    {pp("customPasteUrls")}`,
  ],
  [
    `{imageUrls.length} / 6 {imageUrls.length === 1 ? "image" : "images"} added`,
    `{pp("customImagesAdded", { count: imageUrls.length })}`,
  ],
  [
    `                  Share up to 6 inspiration images to help us understand your vision`,
    `                  {pp("customShareVision")}`,
  ],
  [
    `                Cancel
              </Button>`,
    `                {pp("customCancel")}
              </Button>`,
  ],
  [
    `                    Sending Request...`,
    `                    {pp("customSending")}`,
  ],
  [
    `                    Send Request
                  </span>`,
    `                    {pp("customSend")}
                  </span>`,
  ],
]);

console.log("done leftover flow file patches");
