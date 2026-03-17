"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlatformSettings } from "@/providers/PlatformSettingsProvider";
import type { PublicMaintenanceResponse } from "@/lib/maintenance-types";

const FALLBACK_LOGO = "/images/logo.svg";

function parseEndAt(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function Countdown({ endAtMs, label }: { endAtMs: number; label?: string | null }) {
  const [left, setLeft] = useState(endAtMs - Date.now());

  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => {
      const next = endAtMs - Date.now();
      setLeft(next <= 0 ? 0 : next);
    }, 1000);
    return () => clearInterval(id);
  }, [endAtMs, left]);

  if (left <= 0) return null;

  const d = Math.floor(left / 86400 / 1000);
  const h = Math.floor((left / 3600 / 1000) % 24);
  const m = Math.floor((left / 60 / 1000) % 60);
  const s = Math.floor((left / 1000) % 60);

  return (
    <div className="mt-8 space-y-2">
      {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
      <div className="flex justify-center gap-3 sm:gap-4">
        {[
          [d, "Days"],
          [h, "Hours"],
          [m, "Min"],
          [s, "Sec"],
        ].map(([v, lbl]) => (
          <div key={lbl} className="flex flex-col items-center rounded-lg bg-muted/80 px-3 py-2 min-w-[64px]">
            <span className="text-2xl font-semibold tabular-nums">{String(v).padStart(2, "0")}</span>
            <span className="text-xs text-muted-foreground">{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface MaintenanceViewProps {
  config: PublicMaintenanceResponse;
  /** Optional: use when outside PlatformSettingsProvider (e.g. preview iframe) */
  siteName?: string;
  logoUrl?: string;
  /** Scope for "notify me" sign-up; defaults to public_site */
  scope?: "public_site" | "provider_web" | "customer_app" | "provider_app";
}

export default function MaintenanceView({ config, siteName: siteNameProp, logoUrl: logoUrlProp, scope = "public_site" }: MaintenanceViewProps) {
  const { branding } = usePlatformSettings();
  const siteName = siteNameProp ?? branding?.site_name ?? "Beautonomi";
  const logoUrl = logoUrlProp ?? branding?.logo_url ?? FALLBACK_LOGO;

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endAtMs = parseEndAt(config.countdown_end_at ?? undefined);
  const showCta = Boolean(config.cta_label?.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/maintenance-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), scope }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isExternalLogo = typeof logoUrl === "string" && (logoUrl.startsWith("http://") || logoUrl.startsWith("https://"));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        {isExternalLogo ? (
          <img src={logoUrl} alt={siteName} className="h-12 w-auto object-contain mb-8" />
        ) : (
          <Image
            src={logoUrl}
            alt={siteName}
            width={176}
            height={80}
            className="h-12 w-auto object-contain mb-8"
            priority
          />
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
        <p className="mt-3 text-muted-foreground whitespace-pre-line">{config.message}</p>

        {endAtMs !== null && <Countdown endAtMs={endAtMs} label={config.countdown_label} />}

        {showCta && (
          <div className="mt-8 w-full max-w-sm">
            {!submitted ? (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <Input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full"
                  aria-label="Email for notifications"
                  disabled={submitting}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Sending…" : config.cta_label}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">Thanks! We&apos;ll notify you when we&apos;re back.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
