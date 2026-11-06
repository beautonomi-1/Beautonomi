"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Ban,
  BookOpen,
  CalendarCheck,
  ChevronRight,
  FileText,
  Flag,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@beautonomi/i18n";
import { fetcher } from "@/lib/http/fetcher";
import {
  countActiveSafetyRestrictions,
  fetchSafetySettings,
  type SafetySettingsSnapshot,
} from "@/lib/safety/safety-settings-client";
import AccountPageFrame from "../components/account-page-frame";

type EmergencyContact = { name?: string | null; phone?: string | null } | null;

function maskPhone(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return raw;
  const last4 = digits.slice(-4);
  if (raw.startsWith("+")) {
    return `+${digits.slice(0, Math.min(3, digits.length - 4))} ••• ••• ${last4}`;
  }
  return `••• ••• ${last4}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {children}
      </ul>
    </section>
  );
}

function Row({ icon: Icon, label, subtitle, href }: { icon: LucideIcon; label: string; subtitle?: string; href: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 p-4 hover:bg-gray-50 active:bg-gray-100">
        <Icon className="h-5 w-5 shrink-0 text-[#FF0077]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-gray-900">{label}</span>
          {subtitle ? <span className="mt-0.5 block text-sm text-gray-500">{subtitle}</span> : null}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  );
}

export default function SafetyHubPageClient() {
  const { t } = useTranslation();
  const ph = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`customer.mobile.screens.safetyHub.${key}`, opts ?? {}) as string,
    [t],
  );

  const [safety, setSafety] = useState<SafetySettingsSnapshot | null>(null);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);
  const [emergency, setEmergency] = useState<EmergencyContact>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, blocks, profile] = await Promise.allSettled([
        fetchSafetySettings(),
        fetcher.get<{ data: unknown[] | null }>("/api/me/blocks", { staleTimeMs: 0 }),
        fetcher.get<{ data: { emergency_contact?: EmergencyContact } | null }>("/api/me/profile", { staleTimeMs: 0 }),
      ]);
      if (cancelled) return;
      if (s.status === "fulfilled") setSafety(s.value);
      if (blocks.status === "fulfilled") setBlockedCount(Array.isArray(blocks.value?.data) ? blocks.value.data.length : 0);
      if (profile.status === "fulfilled") setEmergency(profile.value?.data?.emergency_contact ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const restrictionCount = safety ? countActiveSafetyRestrictions(safety.settings) : null;
  const contentSafetySubtitle =
    restrictionCount == null
      ? undefined
      : restrictionCount === 0
        ? ph("contentSafetySummaryNone")
        : ph("contentSafetySummary", { count: restrictionCount });
  const blockedSubtitle =
    blockedCount == null
      ? undefined
      : blockedCount === 0
        ? ph("blockedUsersEmpty")
        : ph("blockedUsersCount", { count: blockedCount });
  const hasEmergency = Boolean(emergency?.name?.trim() && emergency?.phone?.trim());
  const emergencySubtitle = hasEmergency
    ? ph("emergencyContactSet", { phone: maskPhone(emergency?.phone) ?? "" })
    : ph("emergencyContactNotSet");
  const ageBandLabel = safety
    ? (t(`customer.mobile.screens.safetyHub.ageBand.${safety.age_band}`, { defaultValue: safety.age_band }) as string)
    : undefined;
  const showDobBanner = safety != null && (safety.age_band === "unknown" || safety.age_source === "none");

  return (
    <AccountPageFrame title={ph("title")} subtitle={ph("helpCardBody")}>
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="font-semibold text-red-800">{ph("emergencyNoticeTitle")}</p>
        <p className="mt-1 text-sm leading-relaxed text-red-900">{ph("emergencyNoticeBody")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <a
            href="tel:112"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 font-semibold text-white hover:bg-red-700"
          >
            <Phone className="h-4 w-4" aria-hidden />
            {ph("emergencyCallAction")}
          </a>
          <span className="text-sm font-medium text-red-800">{t("web.accountSettings.safety.emergencyNumber")}</span>
        </div>
      </div>

      {showDobBanner ? (
        <Link
          href="/account-settings/age-assurance"
          className="block rounded-xl border border-orange-200 bg-orange-50 p-4 hover:bg-orange-100"
          aria-label={ph("dobBannerA11y")}
        >
          <p className="font-bold text-orange-800">{ph("dobBannerTitle")}</p>
          <p className="mt-1 text-sm text-orange-800">{ph("dobBannerBody")}</p>
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={ph("getHelpTitle")}>
          <Row
            icon={Ticket}
            label={ph("contactTrustSafety")}
            subtitle={ph("contactTrustSafetyHint")}
            href="/help/submit-ticket?category=safety_emergency"
          />
          <Row
            icon={Flag}
            label={ph("reportUser")}
            subtitle={ph("reportUserHint")}
            href="/account-settings/safety/report-user"
          />
        </Section>

        <Section title={ph("yourProfileTitle")}>
          <Row
            icon={UserRound}
            label={ph("emergencyContact")}
            subtitle={emergencySubtitle}
            href="/account-settings/personal-info?focus=emergencyContact#personal-info-section"
          />
          <Row icon={CalendarCheck} label={ph("ageAssuranceLabel")} subtitle={ageBandLabel} href="/account-settings/age-assurance" />
          <Row icon={ShieldCheck} label={ph("ageBandLabel")} subtitle={ph("ageSuitabilityHint")} href="/age-suitability" />
        </Section>

        <Section title={ph("controlsTitle")}>
          <Row
            icon={SlidersHorizontal}
            label={t("customer.accountSettings.contentSafetyTitle") as string}
            subtitle={contentSafetySubtitle}
            href="/account-settings/content-and-safety"
          />
          <Row
            icon={Ban}
            label={t("customer.mobile.screens.blockedUsers.title") as string}
            subtitle={blockedSubtitle}
            href="/account-settings/blocked-users"
          />
        </Section>

        <Section title={ph("resourcesTitle")}>
          <Row icon={BookOpen} label={ph("learningCentre")} href="/learn" />
          <Row icon={FileText} label={ph("privacy")} href="/privacy-policy" />
        </Section>
      </div>
    </AccountPageFrame>
  );
}
