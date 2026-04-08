"use client";

import { useEffect, useMemo, useState } from "react";
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
  getMarketOverrideCookieMaxAgeSeconds,
} from "@/lib/seo/host-config";
import { readAllowsFunctionalFromStorage } from "@/lib/cookie-consent/guards";

type AvailabilityStatus = "allowed" | "unsupported" | "restricted";
const MARKET_OVERRIDE_KEY = "market_manual_override";
const MARKET_OVERRIDE_TTL_MS =
  Math.max(
    1,
    Number(
      process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS &&
      Number.isFinite(Number(process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS))
        ? process.env.NEXT_PUBLIC_MARKET_OVERRIDE_TTL_HOURS
        : "24",
    ),
  ) * 60 * 60 * 1000;

interface TenantContextResponse {
  data?: {
    tenant?: { slug?: string | null } | null;
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
  const { track } = useAmplitude();
  const [open, setOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [status, setStatus] = useState<AvailabilityStatus>("allowed");
  const [countryCode, setCountryCode] = useState<string>("");
  const [reason, setReason] = useState<string | null>(null);
  const [supportedCountries, setSupportedCountries] = useState<string[]>([]);
  const [defaultMarketTenantId, setDefaultMarketTenantId] = useState<string | null>(null);

  const defaultMarketHost = useMemo(
    () =>
      normalizeHost(process.env.NEXT_PUBLIC_DEFAULT_MARKET_HOST) ||
      "beautonomi.co.za",
    [],
  );
  const globalEntryHost = useMemo(
    () =>
      normalizeHost(process.env.NEXT_PUBLIC_GLOBAL_ENTRY_HOST) ||
      "beautonomi.com",
    [],
  );

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      try {
        const currentHost = normalizeHost(window.location.hostname);
        const isGlobalEntry =
          currentHost === globalEntryHost ||
          currentHost === `www.${globalEntryHost}`;
        if (!isGlobalEntry) return;

        const res = await fetch("/api/public/tenant-context", { cache: "no-store" });
        const body = (await res.json()) as TenantContextResponse;
        const tenantSlug = body?.data?.tenant?.slug ?? null;
        const availability = body?.data?.availability;
        const routing = body?.data?.routing;
        const nextStatus = availability?.status ?? "allowed";
        const manualOverrideActive = hasActiveManualOverride();

        // Only enforce popup at global entry context.
        if (tenantSlug && tenantSlug !== "global") return;

        if (!isMounted) return;
        setDefaultMarketTenantId(routing?.defaultMarketTenantId ?? null);

        // Automatic routing for confident allowed-country cases (global entry -> country market).
        if (
          nextStatus === "allowed" &&
          routing?.shouldAutoSwitch &&
          routing?.autoSwitchHost &&
          normalizeHost(routing.autoSwitchHost) !== currentHost &&
          manualOverrideActive
        ) {
          track("market_auto_switch_suppressed", {
            platform: "web",
            from_host: currentHost,
            to_host: normalizeHost(routing.autoSwitchHost),
            reason: "manual_override",
            country_code: (availability?.countryCode ?? "").toUpperCase(),
            source: routing.marketSource ?? "unknown",
            confidence: routing.confidence ?? "unknown",
          });
        }
        if (
          nextStatus === "allowed" &&
          routing?.shouldAutoSwitch &&
          routing?.autoSwitchHost &&
          normalizeHost(routing.autoSwitchHost) !== currentHost &&
          !manualOverrideActive
        ) {
          track("market_auto_switch_attempted", {
            platform: "web",
            from_host: currentHost,
            to_host: normalizeHost(routing.autoSwitchHost),
            country_code: (availability?.countryCode ?? "").toUpperCase(),
            source: routing.marketSource ?? "unknown",
            confidence: routing.confidence ?? "unknown",
          });
          // Guard against redirect loops within this browser session.
          const loopKey = `market-autoswitch:${currentHost}->${normalizeHost(routing.autoSwitchHost)}`;
          if (window.sessionStorage.getItem(loopKey) !== "1") {
            window.sessionStorage.setItem(loopKey, "1");
            void persistPreferredHomeTenant(routing?.recommendedTenantId);
            window.location.replace(`https://${normalizeHost(routing.autoSwitchHost)}`);
            return;
          }
        }

        setStatus(nextStatus);
        setCountryCode((availability?.countryCode ?? "").toUpperCase());
        setReason(availability?.reason ?? null);
        setSupportedCountries(availability?.supportedCountries ?? []);
        if (manualOverrideActive && nextStatus === "unsupported") {
          setOpen(false);
        } else {
          setOpen(nextStatus === "unsupported" || nextStatus === "restricted");
        }
      } catch {
        // Non-blocking: if tenant context fails, do not block browsing.
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, [globalEntryHost]);

  const switchToDefaultMarket = () => {
    setManualOverride(defaultMarketHost);
    void persistPreferredHomeTenant(defaultMarketTenantId);
    track("market_manual_switch", {
      platform: "web",
      from_host: normalizeHost(window.location.hostname),
      to_host: defaultMarketHost,
      reason: status,
      country_code: countryCode,
    });
    window.location.href = `https://${defaultMarketHost}`;
  };

  const stayOnCurrentMarket = () => {
    const currentHost = normalizeHost(window.location.hostname);
    setManualOverride(currentHost);
    track("market_switch_declined", {
      platform: "web",
      host: currentHost,
      reason: status,
      country_code: countryCode,
    });
    track("market_manual_switch", {
      platform: "web",
      from_host: currentHost,
      to_host: currentHost,
      reason: "manual",
      country_code: countryCode,
    });
    setOpen(false);
  };

  const title =
    status === "restricted"
      ? "Access unavailable in your country"
      : "Not available in your country yet";

  const description =
    status === "restricted"
      ? reason || "Access is unavailable in your country due to legal or regulatory restrictions."
      : reason || "Beautonomi is not available in your country yet. You can switch to an available market or join the waitlist.";

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {description}
              {countryCode ? ` (${countryCode})` : ""}
              {status === "unsupported" && supportedCountries.length > 0
                ? ` Available markets: ${supportedCountries.join(", ")}.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            {status === "unsupported" && (
              <Button variant="ghost" onClick={stayOnCurrentMarket}>
                Continue here
              </Button>
            )}
            {status === "unsupported" && (
              <Button variant="outline" onClick={() => setWaitlistOpen(true)}>
                Join waitlist
              </Button>
            )}
            <Button onClick={switchToDefaultMarket}>Switch to available market</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CityWaitlistModal
        open={waitlistOpen}
        onOpenChange={setWaitlistOpen}
        defaultCity=""
      />
    </>
  );
}
