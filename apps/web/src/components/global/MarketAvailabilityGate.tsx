"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CityWaitlistModal from "@/components/city-waitlist-modal";
import { useAmplitude } from "@/hooks/useAmplitude";
import {
  MARKET_GEO_OPT_OUT_COOKIE,
  getConfiguredZaMarketHost,
  getMarketOverrideCookieMaxAgeSeconds,
  isZaMarketHost,
} from "@/lib/seo/host-config";
import { readAllowsFunctionalFromStorage } from "@/lib/cookie-consent/guards";
import { X } from "lucide-react";

type AvailabilityStatus = "allowed" | "unsupported" | "restricted";

const MARKET_OVERRIDE_KEY = "market_manual_override";
const ZA_SUGGEST_DISMISS_KEY = "beautonomi_market_banner_za_suggest_v1";
const UNSUPPORTED_GLOBAL_DISMISS_KEY = "beautonomi_market_banner_unsupported_global_v1";
const REGIONAL_FOREIGN_DISMISS_KEY = "beautonomi_market_banner_regional_foreign_v1";

const MARKET_OVERRIDE_TTL_MS =
  Math.max(
    1,
    Number(
      process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS &&
        Number.isFinite(Number(process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS))
        ? process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS
        : "24",
    ),
  ) *
  60 *
  60 *
  1000;

/** “Don’t show again” for ZA suggestion — aligned with typical cookie persistence (~90d). */
const ZA_BANNER_LONG_DISMISS_MS = 90 * 24 * 60 * 60 * 1000;

interface MarketCatalogPayload {
  transactionalHostnames: string[];
  distinctMarkets: { hostname: string; countryCode: string }[];
  globalEntryVariants: string[];
  defaultMarketHost: string;
}

interface TenantContextResponse {
  data?: {
    tenant?: {
      slug?: string | null;
      name?: string | null;
      regionCode?: string | null;
      defaultCurrency?: string | null;
    } | null;
    marketCatalog?: MarketCatalogPayload | null;
    market?: { countryCode?: string | null } | null;
    availability?: {
      status?: AvailabilityStatus;
      countryCode?: string;
      reason?: string | null;
      supportedCountries?: string[];
    } | null;
    routing?: {
      currentHost?: string;
      marketSource?: "query" | "host" | "header_hint" | "geo_header" | "default" | "user_preference";
      confidence?: "high" | "medium" | "low";
      recommendedHost?: string | null;
      recommendedTenantId?: string | null;
      defaultMarketTenantId?: string | null;
      autoSwitchHost?: string | null;
      shouldAutoSwitch?: boolean;
    } | null;
  } | null;
}

function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/^https?:\/\//, "");
}

function regionDisplayName(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return code.trim() || code;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

function flagEmojiFromIso2(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "\u{1F310}";
  const ord = (ch: string) => 0x1f1e6 + (ch.charCodeAt(0) - 0x41);
  try {
    return String.fromCodePoint(ord(c[0]), ord(c[1]));
  } catch {
    return "\u{1F310}";
  }
}

function readTimedDismiss(key: string): boolean {
  if (!readAllowsFunctionalFromStorage()) return false;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { until?: number };
    if (typeof parsed?.until !== "number" || Date.now() >= parsed.until) {
      window.localStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function writeTimedDismiss(key: string, ttlMs: number): void {
  if (!readAllowsFunctionalFromStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ until: Date.now() + ttlMs }));
  } catch {
    // ignore
  }
}

function readSessionDismiss(sessionKey: string): boolean {
  try {
    return window.sessionStorage.getItem(sessionKey) === "1";
  } catch {
    return false;
  }
}

function writeSessionDismiss(sessionKey: string): void {
  try {
    window.sessionStorage.setItem(sessionKey, "1");
  } catch {
    // ignore
  }
}

function setGeoOptOutCookie(): void {
  try {
    const maxAge = getMarketOverrideCookieMaxAgeSeconds();
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "; Secure"
        : "";
    document.cookie = `${MARKET_GEO_OPT_OUT_COOKIE}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  } catch {
    // best effort only
  }
}

function setManualOverride(host: string): void {
  if (!readAllowsFunctionalFromStorage()) return;
  try {
    const until = Date.now() + MARKET_OVERRIDE_TTL_MS;
    window.localStorage.setItem(
      MARKET_OVERRIDE_KEY,
      JSON.stringify({ host: normalizeHost(host), until }),
    );
    setGeoOptOutCookie();
  } catch {
    // best effort only
  }
}

function hasActiveManualOverride(): boolean {
  if (!readAllowsFunctionalFromStorage()) return false;
  try {
    const raw = window.localStorage.getItem(MARKET_OVERRIDE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { until?: number };
    if (typeof parsed?.until !== "number") return false;
    if (Date.now() >= parsed.until) {
      window.localStorage.removeItem(MARKET_OVERRIDE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function persistPreferredHomeTenant(tenantId: string | null | undefined): Promise<void> {
  if (!tenantId) return;
  try {
    await fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ preferred_home_tenant_id: tenantId }),
    });
  } catch {
    // best effort only
  }
}

export default function MarketAvailabilityGate() {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";

  const { track } = useAmplitude();
  const [restrictedModalOpen, setRestrictedModalOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [zaSuggestVisible, setZaSuggestVisible] = useState(false);
  const [unsupportedGlobalVisible, setUnsupportedGlobalVisible] = useState(false);
  const [regionalForeignVisible, setRegionalForeignVisible] = useState(false);

  const [status, setStatus] = useState<AvailabilityStatus>("allowed");
  const [countryCode, setCountryCode] = useState<string>("");
  const [reason, setReason] = useState<string | null>(null);
  const [supportedCountries, setSupportedCountries] = useState<string[]>([]);
  const [defaultMarketTenantId, setDefaultMarketTenantId] = useState<string | null>(null);
  const [recommendedTenantId, setRecommendedTenantId] = useState<string | null>(null);
  const [resolvedAutoSwitchHost, setResolvedAutoSwitchHost] = useState<string | null>(null);
  const [catalogDefaultMarketHost, setCatalogDefaultMarketHost] = useState<string | null>(null);
  const [regionalStorefrontLabel, setRegionalStorefrontLabel] = useState("");
  const [tenantCurrencyCode, setTenantCurrencyCode] = useState("");
  const [liveHost, setLiveHost] = useState("");

  const defaultMarketHost = useMemo(
    () =>
      normalizeHost(process.env.NEXT_PUBLIC_DEFAULT_MARKET_HOST) ||
      getConfiguredZaMarketHost(),
    [],
  );
  const globalEntryHost = useMemo(
    () =>
      normalizeHost(process.env.NEXT_PUBLIC_GLOBAL_ENTRY_HOST) ||
      "beautonomi.com",
    [],
  );

  const globalUrl = useMemo(() => {
    const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
    const qs = searchString ? `?${searchString}` : "";
    return `https://${globalEntryHost}${path}${qs}`;
  }, [globalEntryHost, pathname, searchString]);

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        const currentHost = normalizeHost(window.location.hostname);
        setLiveHost(currentHost);

        const res = await fetch("/api/public/tenant-context", { cache: "no-store" });
        const body = (await res.json()) as TenantContextResponse;
        const mc = body?.data?.marketCatalog;
        const tenantRow = body?.data?.tenant;

        const onRegionalMarket =
          (mc?.transactionalHostnames?.includes(currentHost) ?? false) ||
          (!(mc?.transactionalHostnames?.length ?? 0) && isZaMarketHost(currentHost));

        const isGlobalEntry =
          currentHost === globalEntryHost || currentHost === `www.${globalEntryHost}`;

        if (!isGlobalEntry && !onRegionalMarket) {
          return;
        }

        const availability = body?.data?.availability;
        const routing = body?.data?.routing;
        const nextStatus = availability?.status ?? "allowed";
        const manualOverrideActive = hasActiveManualOverride();

        if (!isMounted) return;

        setCatalogDefaultMarketHost(mc?.defaultMarketHost ? normalizeHost(mc.defaultMarketHost) : null);
        const catalogRow = (mc?.distinctMarkets ?? []).find((r) => {
          const h = normalizeHost(r.hostname);
          return h === currentHost || `www.${h}` === currentHost || h === `www.${currentHost}`;
        });
        const title =
          tenantRow?.name?.trim() ||
          (catalogRow?.countryCode ? regionDisplayName(catalogRow.countryCode) : "") ||
          "this region";
        setRegionalStorefrontLabel(title);
        setTenantCurrencyCode(tenantRow?.defaultCurrency?.trim() || "");

        setDefaultMarketTenantId(routing?.defaultMarketTenantId ?? null);
        setRecommendedTenantId(routing?.recommendedTenantId ?? null);
        const switchHost = routing?.autoSwitchHost ? normalizeHost(routing.autoSwitchHost) : null;
        setResolvedAutoSwitchHost(switchHost);

        setStatus(nextStatus);
        setCountryCode((availability?.countryCode ?? "").toUpperCase());
        setReason(availability?.reason ?? null);
        setSupportedCountries(availability?.supportedCountries ?? []);

        setZaSuggestVisible(false);
        setUnsupportedGlobalVisible(false);
        setRegionalForeignVisible(false);
        setRestrictedModalOpen(false);

        const dismissZa =
          readTimedDismiss(ZA_SUGGEST_DISMISS_KEY) ||
          readSessionDismiss(`${ZA_SUGGEST_DISMISS_KEY}:session`);
        const dismissUnsupportedGlobal =
          readTimedDismiss(UNSUPPORTED_GLOBAL_DISMISS_KEY) ||
          readSessionDismiss(`${UNSUPPORTED_GLOBAL_DISMISS_KEY}:session`);
        const dismissRegional =
          readTimedDismiss(REGIONAL_FOREIGN_DISMISS_KEY) ||
          readSessionDismiss(`${REGIONAL_FOREIGN_DISMISS_KEY}:session`);

        if (nextStatus === "restricted") {
          setRestrictedModalOpen(true);
          track("market_restricted_modal_shown", {
            platform: "web",
            host: currentHost,
            country_code: (availability?.countryCode ?? "").toUpperCase(),
          });
          return;
        }

        if (
          isGlobalEntry &&
          nextStatus === "allowed" &&
          routing?.shouldAutoSwitch &&
          switchHost &&
          switchHost !== currentHost &&
          manualOverrideActive
        ) {
          track("market_auto_switch_suppressed", {
            platform: "web",
            from_host: currentHost,
            to_host: switchHost,
            reason: "manual_override",
            country_code: (availability?.countryCode ?? "").toUpperCase(),
            source: routing?.marketSource ?? "unknown",
            confidence: routing?.confidence ?? "unknown",
          });
        }

        if (
          isGlobalEntry &&
          nextStatus === "allowed" &&
          routing?.shouldAutoSwitch &&
          switchHost &&
          switchHost !== currentHost &&
          !manualOverrideActive &&
          !dismissZa
        ) {
          track("market_geo_banner_shown", {
            platform: "web",
            variant: "za_suggest",
            from_host: currentHost,
            to_host: switchHost,
            country_code: (availability?.countryCode ?? "").toUpperCase(),
            source: routing?.marketSource ?? "unknown",
          });
          setZaSuggestVisible(true);
          return;
        }

        if (isGlobalEntry && nextStatus === "unsupported") {
          if (manualOverrideActive) {
            track("market_unsupported_banner_suppressed", {
              platform: "web",
              reason: "manual_override",
              country_code: (availability?.countryCode ?? "").toUpperCase(),
            });
          } else if (!dismissUnsupportedGlobal) {
            track("market_geo_banner_shown", {
              platform: "web",
              variant: "unsupported_global",
              host: currentHost,
              country_code: (availability?.countryCode ?? "").toUpperCase(),
            });
            setUnsupportedGlobalVisible(true);
          }
          return;
        }

        if (onRegionalMarket && !isGlobalEntry && nextStatus === "unsupported" && !dismissRegional) {
          track("market_geo_banner_shown", {
            platform: "web",
            variant: "regional_foreign",
            host: currentHost,
            country_code: (availability?.countryCode ?? "").toUpperCase(),
          });
          setRegionalForeignVisible(true);
        }
      } catch {
        // Non-blocking
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, [globalEntryHost]); // eslint-disable-line react-hooks/exhaustive-deps -- geo gate keyed by globalEntryHost; omit unstable `track`

  const targetZaHost = resolvedAutoSwitchHost || defaultMarketHost;
  const defaultMarketSwitchHost = catalogDefaultMarketHost || defaultMarketHost;

  const detectedCountryLabel = regionDisplayName(countryCode);
  const goToZaMarket = () => {
    void persistPreferredHomeTenant(recommendedTenantId ?? defaultMarketTenantId);
    track("market_manual_switch", {
      platform: "web",
      from_host: normalizeHost(window.location.hostname),
      to_host: targetZaHost,
      reason: "za_banner",
      country_code: countryCode,
    });
    window.location.href = `https://${targetZaHost}`;
  };

  const stayOnGlobalEntry = () => {
    const currentHost = normalizeHost(window.location.hostname);
    setManualOverride(currentHost);
    track("market_switch_declined", {
      platform: "web",
      host: currentHost,
      reason: "za_banner_stay",
      country_code: countryCode,
    });
    setZaSuggestVisible(false);
  };

  const dismissZaLater = () => {
    writeSessionDismiss(`${ZA_SUGGEST_DISMISS_KEY}:session`);
    track("market_geo_banner_dismissed", {
      platform: "web",
      variant: "za_suggest",
      dismiss: "session",
      country_code: countryCode,
    });
    setZaSuggestVisible(false);
  };

  const dismissZaLong = () => {
    writeTimedDismiss(ZA_SUGGEST_DISMISS_KEY, ZA_BANNER_LONG_DISMISS_MS);
    setManualOverride(globalEntryHost);
    track("market_geo_banner_dismissed", {
      platform: "web",
      variant: "za_suggest",
      dismiss: "long",
      country_code: countryCode,
    });
    setZaSuggestVisible(false);
  };

  const switchToDefaultMarket = () => {
    const dest = defaultMarketSwitchHost;
    setManualOverride(dest);
    void persistPreferredHomeTenant(defaultMarketTenantId);
    track("market_manual_switch", {
      platform: "web",
      from_host: normalizeHost(window.location.hostname),
      to_host: dest,
      reason: status,
      country_code: countryCode,
    });
    window.location.href = `https://${dest}`;
  };

  const restrictedTitle = "Access unavailable in your country";

  const restrictedDescription =
    reason || "Access is unavailable in your country due to legal or regulatory restrictions.";

  return (
    <>
      {zaSuggestVisible ? (
        <div
          role="region"
          aria-label="Regional storefront suggestion"
          className="fixed left-0 right-0 top-0 z-[120] border-b border-indigo-800 bg-indigo-950 px-3 py-2.5 text-white shadow-md sm:px-4"
        >
          <div className="relative mx-auto flex max-w-[2340px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pr-10">
            <button
              type="button"
              className="absolute right-0 top-0 rounded p-1 text-indigo-200 hover:bg-indigo-900 hover:text-white sm:right-0 sm:top-1/2 sm:-translate-y-1/2"
              aria-label="Dismiss suggestion for this session"
              onClick={dismissZaLater}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-2 pr-7 sm:pr-0">
              <span className="text-lg leading-none" aria-hidden>
                {flagEmojiFromIso2(countryCode)}
              </span>
              <p className="text-sm leading-snug text-indigo-50">
                Looks like you&apos;re in{" "}
                <strong className="font-semibold text-white">{detectedCountryLabel}</strong>.
                Continue on{" "}
                <strong className="font-semibold text-white">{targetZaHost}</strong> for{" "}
                {tenantCurrencyCode ? `${tenantCurrencyCode} pricing and ` : "local pricing and "}
                checkout.
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              <Button size="sm" className="bg-white text-indigo-950 hover:bg-indigo-100" onClick={goToZaMarket}>
                Go to {targetZaHost}
              </Button>
              <Button size="sm" variant="ghost" className="text-indigo-100 hover:bg-indigo-900 hover:text-white" onClick={stayOnGlobalEntry}>
                Stay on {globalEntryHost}
              </Button>
              <Button size="sm" variant="ghost" className="text-indigo-200 hover:bg-indigo-900 hover:text-white" onClick={dismissZaLater}>
                Later
              </Button>
              <Button size="sm" variant="ghost" className="text-indigo-200 hover:bg-indigo-900 hover:text-white" onClick={dismissZaLong}>
                Don&apos;t show again
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {unsupportedGlobalVisible ? (
        <div
          role="region"
          aria-label="Market availability"
          className="fixed left-0 right-0 top-0 z-[120] border-b border-amber-900/40 bg-amber-950 px-3 py-2.5 text-amber-50 shadow-md sm:px-4"
        >
          <div className="relative mx-auto flex max-w-[2340px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pr-10">
            <button
              type="button"
              className="absolute right-0 top-0 rounded p-1 text-amber-200 hover:bg-amber-900 hover:text-white sm:right-0 sm:top-1/2 sm:-translate-y-1/2"
              aria-label="Dismiss for this session"
              onClick={() => {
                writeSessionDismiss(`${UNSUPPORTED_GLOBAL_DISMISS_KEY}:session`);
                setUnsupportedGlobalVisible(false);
              }}
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-sm leading-snug pr-7 sm:pr-0">
              {reason || "Beautonomi isn’t available in your country yet."}
              {countryCode ? ` (${countryCode})` : ""}
              {supportedCountries.length > 0 ? ` Available: ${supportedCountries.join(", ")}.` : ""}
            </p>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" className="bg-white text-amber-950 hover:bg-amber-100" onClick={() => setWaitlistOpen(true)}>
                Join waitlist
              </Button>
              <Button size="sm" variant="outline" className="border-amber-400/60 bg-transparent text-white hover:bg-amber-900" onClick={switchToDefaultMarket}>
                Switch to {defaultMarketSwitchHost}
              </Button>
              <Button size="sm" variant="ghost" className="text-amber-100 hover:bg-amber-900 hover:text-white" onClick={stayOnGlobalEntry}>
                Continue browsing
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {regionalForeignVisible ? (
        <div
          role="region"
          aria-label="Regional storefront notice"
          className="fixed left-0 right-0 top-0 z-[120] border-b border-sky-900/40 bg-sky-950 px-3 py-2.5 text-sky-50 shadow-md sm:px-4"
        >
          <div className="relative mx-auto flex max-w-[2340px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pr-10">
            <button
              type="button"
              className="absolute right-0 top-0 rounded p-1 text-sky-200 hover:bg-sky-900 hover:text-white sm:right-0 sm:top-1/2 sm:-translate-y-1/2"
              aria-label="Dismiss for this session"
              onClick={() => {
                writeSessionDismiss(`${REGIONAL_FOREIGN_DISMISS_KEY}:session`);
                setRegionalForeignVisible(false);
              }}
            >
              <X className="h-4 w-4" />
            </button>
            <p className="text-sm leading-snug pr-7 sm:pr-0">
              You&apos;re on the <strong className="font-semibold text-white">{regionalStorefrontLabel}</strong>{" "}
              storefront{liveHost ? ` (${liveHost})` : ""}.{" "}
              {tenantCurrencyCode
                ? `Pricing and checkout follow ${tenantCurrencyCode}. `
                : "Pricing and checkout follow this regional storefront. "}
              {countryCode
                ? `Your connection suggests you may be in ${detectedCountryLabel} — we may not operate there yet.`
                : ""}
            </p>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" className="bg-white text-sky-950 hover:bg-sky-100" asChild>
                <a href={globalUrl}>Open international site</a>
              </Button>
              <Button size="sm" variant="outline" className="border-sky-400/60 bg-transparent text-white hover:bg-sky-900" onClick={() => setWaitlistOpen(true)}>
                Join waitlist
              </Button>
              <Button size="sm" variant="ghost" className="text-sky-100 hover:bg-sky-900 hover:text-white" onClick={() => setRegionalForeignVisible(false)}>
                Continue here
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={restrictedModalOpen} onOpenChange={setRestrictedModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{restrictedTitle}</DialogTitle>
            <DialogDescription>
              {restrictedDescription}
              {countryCode ? ` (${countryCode})` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setRestrictedModalOpen(false)}>
              Close
            </Button>
            <Button onClick={switchToDefaultMarket}>Switch to available market</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CityWaitlistModal open={waitlistOpen} onOpenChange={setWaitlistOpen} defaultCity="" />
    </>
  );
}
