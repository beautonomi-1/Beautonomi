"use client";

import Link from "next/link";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCookieConsent } from "@/providers/CookieConsentProvider";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";

const COPY = {
  bannerTitle: "Cookies help us keep Beautonomi running smoothly",
  bannerBody:
    "We use a small set of cookies and similar tools to keep you signed in, remember your choices, and—only if you’re happy with it—see what’s working so we can make booking and discovery better. No surprises: you choose what’s optional.",
  acceptAll: "Accept all",
  rejectNonEssential: "Reject non-essential",
  managePreferences: "Choose categories",
  modalTitle: "Your cookie choices",
  modalIntro:
    "Essential cookies stay on—they’re what keeps the site safe and usable. Everything else is up to you, and you can change your mind anytime. The details live in our",
  save: "Save choices",
  cancel: "Close",
  necessaryTitle: "Essential",
  necessaryDesc:
    "Needed for things like security, sign-in, basic performance, and fraud prevention. Without these, Beautonomi can’t work as intended.",
  analyticsTitle: "Analytics & performance",
  analyticsDesc:
    "Helps us understand what’s slow, what’s confusing, and what people actually use—so we can fix bugs and improve flows instead of guessing.",
  functionalTitle: "Preferences & convenience",
  functionalDesc:
    "Lets us remember things like language or UI choices between visits, so the experience feels a little more like you left it.",
  marketingTitle: "Marketing & measurement",
  marketingDesc:
    "Only used if we run optional promotional or partner measurement tools. Off by default until you switch it on.",
  alwaysOn: "Always on",
  linkCookiePolicy: "cookie policy",
  regionLabel: "Cookie categories",
};

export default function CookieConsentExperience() {
  const {
    showBanner,
    preferencesOpen,
    openPreferences,
    closePreferences,
    acceptAll,
    rejectNonEssential,
    saveCustom,
    consent,
    takeReturnFocusTarget,
  } = useCookieConsent();

  const [draft, setDraft] = useState({
    analytics: true,
    functional: true,
    marketing: false,
  });

  useEffect(() => {
    if (!preferencesOpen) return;
    setDraft({
      analytics: consent?.categories.analytics ?? false,
      functional: consent?.categories.functional ?? false,
      marketing: consent?.categories.marketing ?? false,
    });
  }, [preferencesOpen, consent]);

  const baseId = useId();
  const idAnalytics = `${baseId}-analytics`;
  const idFunctional = `${baseId}-functional`;
  const idMarketing = `${baseId}-marketing`;
  const headingId = `${baseId}-dialog-title`;

  const bannerVisible = showBanner && !preferencesOpen;

  return (
    <>
      {bannerVisible ? (
        <div
          data-nosnippet
          className={cn(
            "fixed bottom-0 left-0 right-0 z-[10000] border-t border-gray-200/90 bg-white/95 shadow-[0_-12px_40px_rgba(15,23,42,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90",
            "pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1",
          )}
          role="region"
          aria-label="Cookie consent notice"
        >
          <div className="mx-auto flex max-w-[2340px] flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:items-end md:justify-between md:gap-8 lg:px-20">
            <div className="flex min-w-0 gap-3 md:max-w-[min(100%,40rem)] lg:max-w-[min(100%,48rem)]">
              <div
                className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-pink-100/80 bg-gradient-to-br from-pink-50 to-white sm:flex"
                aria-hidden
              >
                <Cookie className="h-5 w-5 text-[#FF0077]" />
              </div>
              <div className="min-w-0">
                <h2 id={`${baseId}-banner-heading`} className="text-base font-semibold leading-snug text-gray-900">
                  {COPY.bannerTitle}
                </h2>
                <p className="mt-1.5 text-sm font-light leading-relaxed text-gray-600">{COPY.bannerBody}</p>
                <p className="mt-2 text-xs leading-snug text-gray-500">
                  <Link
                    href="/cookie-policy"
                    className="font-medium text-[#FF0077] underline underline-offset-[3px] decoration-[#FF0077]/30 transition-colors hover:text-[#D60565] hover:decoration-[#D60565]/40"
                  >
                    Read our {COPY.linkCookiePolicy}
                  </Link>
                </p>
              </div>
            </div>

            {/* Mobile: primary first; md+: horizontal with emphasis on accept */}
            <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[min(100%,22rem)] md:flex-shrink-0">
              <Button
                type="button"
                className="h-12 w-full shrink-0 rounded-xl bg-gray-900 text-[15px] font-medium text-white hover:bg-gray-800 md:order-none"
                onClick={acceptAll}
              >
                {COPY.acceptAll}
              </Button>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-xl border-gray-300 text-[15px] font-medium"
                  onClick={rejectNonEssential}
                >
                  {COPY.rejectNonEssential}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-xl border-gray-200 text-[15px] font-medium text-gray-800"
                  onClick={(e) => openPreferences(e.currentTarget)}
                >
                  {COPY.managePreferences}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={preferencesOpen}
        onOpenChange={(open) => {
          if (!open) closePreferences();
        }}
      >
        <DialogContent
          data-nosnippet
          suppressFallbackTitle
          className={cn(
            "flex max-h-[min(88dvh,calc(100svh-1.5rem))] w-[min(100vw-1rem,28rem)] flex-col gap-0 overflow-hidden rounded-2xl border-gray-200/80 p-0 shadow-2xl",
            "left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]",
          )}
          aria-describedby={`${baseId}-modal-desc`}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => {
              const el = document.getElementById(headingId);
              el?.focus();
            });
          }}
          onCloseAutoFocus={(e) => {
            const target = takeReturnFocusTarget();
            if (target && typeof target.focus === "function") {
              e.preventDefault();
              target.focus();
            }
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="space-y-2 px-4 pb-2 pt-5 text-left sm:px-6 sm:pt-6">
              <DialogTitle
                id={headingId}
                tabIndex={-1}
                className="pr-10 text-xl font-semibold tracking-tight text-gray-900 outline-none"
              >
                {COPY.modalTitle}
              </DialogTitle>
              <DialogDescription id={`${baseId}-modal-desc`} className="text-left text-sm leading-relaxed text-gray-600">
                {COPY.modalIntro}{" "}
                <Link
                  href="/cookie-policy"
                  className="font-medium text-[#FF0077] underline underline-offset-[3px] decoration-[#FF0077]/30 hover:text-[#D60565]"
                >
                  {COPY.linkCookiePolicy}
                </Link>
                .
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 sm:px-6">
              <fieldset className="space-y-3 border-0 p-0">
                <legend className="sr-only">{COPY.regionLabel}</legend>
                <CategoryBlock
                  title={COPY.necessaryTitle}
                  description={COPY.necessaryDesc}
                  mode="locked"
                  labelId={`${baseId}-nec`}
                  switchLabel="Essential cookies"
                />
                <CategoryBlock
                  title={COPY.analyticsTitle}
                  description={COPY.analyticsDesc}
                  checked={draft.analytics}
                  on={(v) => setDraft((d) => ({ ...d, analytics: v }))}
                  labelId={idAnalytics}
                  switchLabel="Allow analytics and performance cookies"
                />
                <CategoryBlock
                  title={COPY.functionalTitle}
                  description={COPY.functionalDesc}
                  checked={draft.functional}
                  on={(v) => setDraft((d) => ({ ...d, functional: v }))}
                  labelId={idFunctional}
                  switchLabel="Allow preference and convenience cookies"
                />
                <CategoryBlock
                  title={COPY.marketingTitle}
                  description={COPY.marketingDesc}
                  checked={draft.marketing}
                  on={(v) => setDraft((d) => ({ ...d, marketing: v }))}
                  labelId={idMarketing}
                  switchLabel="Allow marketing and measurement cookies"
                />
              </fieldset>
            </div>

            <div className="sticky bottom-0 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur-sm sm:px-6 sm:pb-5 sm:pt-4">
              <DialogFooter className="w-full flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 w-full rounded-xl sm:min-w-[7rem]"
                  onClick={closePreferences}
                >
                  {COPY.cancel}
                </Button>
                <Button
                  type="button"
                  className="h-12 w-full rounded-xl bg-gray-900 text-white hover:bg-gray-800 sm:min-w-[9rem]"
                  onClick={() => saveCustom(draft)}
                >
                  {COPY.save}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CategoryBlock({
  title,
  description,
  checked,
  on,
  mode = "toggle",
  labelId,
  switchLabel,
}: {
  title: string;
  description: string;
  checked?: boolean;
  on?: (v: boolean) => void;
  mode?: "toggle" | "locked";
  labelId: string;
  switchLabel: string;
}) {
  const isLocked = mode === "locked";
  return (
    <div className="rounded-2xl border border-gray-100/90 bg-gray-50/90 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 id={labelId} className="text-sm font-semibold text-gray-900">
            {title}
          </h3>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-600 sm:text-[13px]">{description}</p>
          {isLocked ? (
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{COPY.alwaysOn}</p>
          ) : null}
        </div>
        <div className="shrink-0 pt-1">
          {isLocked ? (
            <span className="sr-only">{switchLabel}</span>
          ) : (
            <Switch
              checked={checked}
              onCheckedChange={on}
              className="data-[state=checked]:bg-[#FF0077]"
              aria-labelledby={labelId}
              aria-label={switchLabel}
            />
          )}
        </div>
      </div>
    </div>
  );
}
