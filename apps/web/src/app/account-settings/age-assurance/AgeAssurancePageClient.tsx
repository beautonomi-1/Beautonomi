"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleX, Loader2, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import { formatLegalDobDisplay } from "@beautonomi/utils";
import { fetcher } from "@/lib/http/fetcher";
import {
  VIEWER_SAFETY_SETTINGS_EVENT,
  fetchSafetySettings,
  type SafetySettingsSnapshot,
} from "@/lib/safety/safety-settings-client";
import { DateOfBirthSection } from "../personal-info/DateOfBirthSection";
import AccountPageFrame from "../components/account-page-frame";

function BandCard({ icon: Icon, accent, title, body }: { icon: LucideIcon; accent: string; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}18` }}>
        <Icon className="h-5 w-5" style={{ color: accent }} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-gray-600">{body}</p>
      </div>
    </div>
  );
}

export default function AgeAssurancePageClient() {
  const { t } = useTranslation();
  const aa = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`customer.mobile.screens.ageAssurance.${key}`, opts ?? {}) as string,
    [t],
  );

  const [dob, setDob] = useState<string | null | undefined>(undefined);
  const [safety, setSafety] = useState<SafetySettingsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [profile, settings] = await Promise.allSettled([
        fetcher.get<{ data: { date_of_birth?: string | null } | null }>("/api/me/profile", { staleTimeMs: 0 }),
        fetchSafetySettings(),
      ]);
      if (cancelled) return;
      const iso = profile.status === "fulfilled" ? profile.value?.data?.date_of_birth : null;
      setDob(typeof iso === "string" && iso ? iso : null);
      if (settings.status === "fulfilled") setSafety(settings.value);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<SafetySettingsSnapshot>).detail;
      if (detail?.settings) setSafety(detail);
    };
    window.addEventListener(VIEWER_SAFETY_SETTINGS_EVENT, onUpdate);
    return () => window.removeEventListener(VIEWER_SAFETY_SETTINGS_EVENT, onUpdate);
  }, []);

  const sourceLabel =
    safety?.age_source === "verified_dob"
      ? aa("sourceVerified")
      : safety?.age_source === "declared_dob"
        ? aa("sourceDeclared")
        : aa("sourceNone");

  return (
    <AccountPageFrame
      title={aa("title")}
      subtitle={aa("intro")}
      backHref="/account-settings/safety"
      parents={[{ label: t("customer.mobile.screens.safetyHub.title") as string, href: "/account-settings/safety" }]}
    >
      {dob === undefined ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-[#FF0077]" />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-pink-200 bg-pink-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#FF0077]">{aa("yourAgeBand")}</p>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {safety
                ? (t(`customer.mobile.screens.safetyHub.ageBand.${safety.age_band}`, { defaultValue: safety.age_band }) as string)
                : "—"}
            </p>
            <p className="mt-1 text-sm text-gray-600">{aa("sourceLabel", { source: sourceLabel })}</p>
            {dob ? (
              <p className="mt-1 text-sm font-semibold text-gray-700">{aa("dobOnFile", { date: formatLegalDobDisplay(dob) })}</p>
            ) : (
              <p className="mt-1 text-sm font-semibold text-[#FF0077]">{aa("addDobHint")}</p>
            )}
          </div>

          <DateOfBirthSection initialIso={dob} onSaved={(iso) => setDob(iso)} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <BandCard icon={CircleX} accent="#DC2626" title={aa("bandUnder13Title")} body={aa("bandUnder13Body")} />
            <BandCard icon={Users} accent="#2563EB" title={aa("bandTeenTitle")} body={aa("bandTeenBody")} />
            <BandCard icon={ShieldCheck} accent="#059669" title={aa("bandAdultTitle")} body={aa("bandAdultBody")} />
          </div>

          <p className="text-sm text-gray-500">{aa("kycPrecedence")}</p>
          <Link href="/age-suitability" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#FF0077] underline">
            {aa("learnMore")}
          </Link>
        </>
      )}
    </AccountPageFrame>
  );
}
