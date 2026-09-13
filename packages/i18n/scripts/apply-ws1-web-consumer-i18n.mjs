#!/usr/bin/env node
/** Apply useTranslation(t) replacements to WS1 consumer web files */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function patch(file, replacements) {
  const p = path.join(root, file);
  let s = fs.readFileSync(p, "utf8");
  let n = 0;
  for (const [from, to] of replacements) {
    if (s.includes(from)) {
      s = s.replace(from, to);
      n++;
    }
  }
  fs.writeFileSync(p, s);
  console.log(`${file}: ${n} replacements`);
}

// BeautonomiGateModal - toast and UI strings
patch("apps/web/src/app/book/components/BeautonomiGateModal.tsx", [
  ['toast.error(err instanceof Error ? err.message : "Sign in failed");', 'toast.error(err instanceof Error ? err.message : t("web.book.gate.signInFailed"));'],
  ['toast.error("Email sign-in is not available for this platform.");', 'toast.error(t("web.book.gate.emailSignInUnavailable"));'],
  ['toast.error("Please enter your email");', 'toast.error(t("web.book.gate.enterEmail"));'],
  ['toast.error(err instanceof Error ? err.message : "Failed to send email");', 'toast.error(err instanceof Error ? err.message : t("web.book.gate.emailSendFailed"));'],
  ['toast.error("Phone sign-in is not available for this platform.");', 'toast.error(t("web.book.gate.phoneSignInUnavailable"));'],
  ['toast.error("Please enter your phone number");', 'toast.error(t("web.book.gate.enterPhone"));'],
  ['toast.error("Please enter a valid phone number with country code.");', 'toast.error(t("web.book.gate.enterValidPhone"));'],
  ['toast.error(err instanceof Error ? err.message : "Failed to send code");', 'toast.error(err instanceof Error ? err.message : t("web.book.gate.smsSendFailed"));'],
  ['toast.error(err instanceof Error ? err.message : "Invalid code");', 'toast.error(err instanceof Error ? err.message : t("web.book.gate.invalidCode"));'],
  ['Secure your slot', '{t("web.book.gate.title")}'],
  ['Great choice! To secure this slot and save your booking history, please sign in or create your Beautonomi profile.', '{t("web.book.gate.description")}'],
  ['This slot hold has expired. Close and choose another time.', '{t("web.book.gate.holdExpired")}'],
  ['Slot held for{" "}', '{t("web.book.gate.slotHeldFor")}{" "}'],
  ['. Finish signing in to continue.', '. {t("web.book.gate.finishSigningIn")}'],
  ['Continue with Google', '{t("web.book.gate.continueGoogle")}'],
  ['Continue with Apple', '{t("web.book.gate.continueApple")}'],
  ['>Or<', '>{t("web.book.gate.or")}<'],
  ['Email ({emailOtpLen}-digit code)', '{t("web.book.gate.emailOtpLabel", { digits: emailOtpLen })}'],
  ["We'll email you a {emailOtpLen}-digit verification code", '{t("web.book.gate.emailOtpHint", { digits: emailOtpLen })}'],
  ['Phone (SMS code)', '{t("web.book.gate.phoneSmsLabel")}'],
  ['placeholder="Phone number"', 'placeholder={t("web.book.gate.phonePlaceholder")}'],
  ['Enter verification code', '{t("web.book.gate.enterVerificationCode")}'],
  ['label="SMS verification code"', 'label={t("web.book.gate.smsVerificationLabel")}'],
  ['label="Email verification code"', 'label={t("web.book.gate.emailVerificationLabel")}'],
  ['{loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}', '{loading === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : t("web.book.gate.verify")}'],
  ['Use different method', '{t("web.book.gate.useDifferentMethod")}'],
]);

// OnlineBookingFlow
patch("apps/web/src/app/book/components/OnlineBookingFlow.tsx", [
  ['export default function OnlineBookingFlow({', 'export default function OnlineBookingFlow({'],
]);

// Add t hook after router in OnlineBookingFlow
{
  const p = path.join(root, "apps/web/src/app/book/components/OnlineBookingFlow.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes('const { t } = useTranslation()')) {
    s = s.replace(
      'const router = useRouter();\n  const { user } = useAuth();',
      'const router = useRouter();\n  const { t } = useTranslation();\n  const { user } = useAuth();'
    );
  }
  const anyone = 't("web.book.engine.anyoneAvailable")';
  s = s.replaceAll('"Anyone available"', anyone);
  s = s.replace('aria-label="Beautonomi home"', 'aria-label={t("web.a11y.beautonomiHome")}');
  s = s.replace('Book with {provider.business_name}', '{t("web.book.legacyFlow.bookWith", { providerName: provider.business_name })}');
  s = s.replace('<h2 className="font-medium">Select a service</h2>', '<h2 className="font-medium">{t("web.book.legacyFlow.selectService")}</h2>');
  s = s.replace('<p className="text-muted-foreground">No services available</p>', '<p className="text-muted-foreground">{t("web.book.legacyFlow.noServices")}</p>');
  s = s.replace('<ChevronLeft className="h-4 w-4" /> Back', '<ChevronLeft className="h-4 w-4" /> {t("web.book.legacyFlow.back")}');
  s = s.replace('<h2 className="font-medium">Where?</h2>', '<h2 className="font-medium">{t("web.book.legacyFlow.where")}</h2>');
  s = s.replace('>At salon<', '>{t("web.book.legacyFlow.atSalon")}<');
  s = s.replace('>At my location<', '>{t("web.book.legacyFlow.atMyLocation")}<');
  s = s.replace('This provider has no locations. Please choose &quot;At my location&quot; or select another provider.', '{t("web.book.legacyFlow.noLocations")}');
  s = s.replace('<Label>Address (required for at-home bookings)</Label>', '<Label>{t("web.book.legacyFlow.addressRequired")}</Label>');
  s = s.replace('placeholder="Street address"', 'placeholder={t("web.book.legacyFlow.streetAddress")}');
  s = s.replace('placeholder="City"', 'placeholder={t("web.book.legacyFlow.city")}');
  s = s.replace('placeholder="Country"', 'placeholder={t("web.book.legacyFlow.country")}');
  s = s.replace('>Next<', '>{t("web.book.legacyFlow.next")}<');
  s = s.replace('<h2 className="font-medium">Who?</h2>', '<h2 className="font-medium">{t("web.book.legacyFlow.who")}</h2>');
  s = s.replace('<h2 className="font-medium">Pick a date</h2>', '<h2 className="font-medium">{t("web.book.legacyFlow.pickDate")}</h2>');
  s = s.replace('<h2 className="font-medium">Pick a time</h2>', '<h2 className="font-medium">{t("web.book.legacyFlow.pickTime")}</h2>');
  s = s.replace('<p className="text-muted-foreground">No slots available for this date</p>', '<p className="text-muted-foreground">{t("web.book.legacyFlow.noSlots")}</p>');
  s = s.replace('toast.error("Please enter your address for at-home booking");', 'toast.error(t("web.book.legacyFlow.enterAddress"));');
  s = s.replace('toast.error("Unable to secure this slot. Please select a specific staff member.");', 'toast.error(t("web.book.legacyFlow.secureSlotStaff"));');
  s = s.replace(': "Failed to load");', ': t("web.book.legacyFlow.failedLoad"));');
  s = s.replace('toast.error("Failed to secure slot");', 'toast.error(t("web.book.legacyFlow.failedSecureSlot"));');
  s = s.replace(': "Failed to secure slot");', ': t("web.book.legacyFlow.failedSecureSlot"));');
  fs.writeFileSync(p, s);
  console.log("OnlineBookingFlow.tsx: patched");
}

// OnlineBookingFlowNew - add t hook and key strings
{
  const p = path.join(root, "apps/web/src/app/book/components/OnlineBookingFlowNew.tsx");
  let s = fs.readFileSync(p, "utf8");
  if (!s.includes('const { t } = useTranslation()')) {
    s = s.replace(
      'const router = useRouter();\n  const { user } = useAuth();',
      'const router = useRouter();\n  const { t } = useTranslation();\n  const { user } = useAuth();'
    );
  }
  s = s.replace('toast.error("No available slots in the next two weeks");', 'toast.error(t("web.book.flow.noSlotsTwoWeeks"));');
  s = s.replace('toast.error("Please choose a date and time to continue.");', 'toast.error(t("web.book.flow.chooseDateTime"));');
  s = s.replace('toast.error("Please accept the cancellation policy to continue.");', 'toast.error(t("web.book.flow.acceptCancellationPolicy"));');
  s = s.replace('toast.error("Please enter your address for at-home booking");', 'toast.error(t("web.book.flow.enterAddress"));');
  s = s.replace(': "Failed to secure slot. Please try again.";', ': t("web.book.flow.failedSecureSlot");');
  s = s.replace(': "Failed to load");', ': t("web.book.flow.failedLoad"));');
  s = s.replace('name: "Any Professional",\n        role: "Fastest availability",', 'name: t("web.book.flow.anyProfessional"),\n        role: t("web.book.flow.fastestAvailability"),');
  s = s.replace('seen.set("_other", { id: "_other", name: "Other Services", description: null, display_order: 999 });', 'seen.set("_other", { id: "_other", name: t("web.book.flow.otherServices"), description: null, display_order: 999 });');
  s = s.replace('if (list.length === 0) return [{ id: "_all", name: "Services", description: "All services" }];', 'if (list.length === 0) return [{ id: "_all", name: t("web.book.flow.services"), description: t("web.book.flow.allServices") }];');
  fs.writeFileSync(p, s);
  console.log("OnlineBookingFlowNew.tsx: patched");
}

console.log("Done");
