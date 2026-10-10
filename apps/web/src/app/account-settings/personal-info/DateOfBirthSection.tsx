"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import {
  composeLegalDobIso,
  daysInMonth,
  formatLegalDobDisplay,
  legalDobYearRange,
  parseLegalDobIso,
  validateLegalDobParts,
} from "@beautonomi/utils";

export function DateOfBirthSection({ initialIso }: { initialIso: string | null }) {
  const { t } = useTranslation();
  const dobPrefix = "web.accountSettings.identityVerification.legalDob";
  const piPrefix = "web.accountSettings.personalInfo";

  const [iso, setIso] = useState(initialIso ?? "");
  const parts = parseLegalDobIso(iso || null);
  const [day, setDay] = useState<number | null>(parts.day);
  const [month, setMonth] = useState<number | null>(parts.month);
  const [year, setYear] = useState<number | null>(parts.year);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIso(initialIso ?? "");
    const p = parseLegalDobIso(initialIso);
    setDay(p.day);
    setMonth(p.month);
    setYear(p.year);
  }, [initialIso]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.replace(/^#/, "") !== "date-of-birth-section") return;
    requestAnimationFrame(() => {
      document.getElementById("date-of-birth-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const years = useMemo(() => legalDobYearRange({ minAge: 13, maxAge: 100 }), []);
  const maxDay = year != null && month != null ? daysInMonth(year, month) : 31;
  const draftIso = composeLegalDobIso({ day, month, year });

  const save = useCallback(async () => {
    const err = validateLegalDobParts(
      { day: day ?? 0, month: month ?? 0, year: year ?? 0 },
      { minAge: 13 },
    );
    if (!draftIso || err) {
      toast.error(err || t(`${piPrefix}.dateOfBirthInvalid`));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_of_birth: draftIso }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        throw new Error(json?.error?.message || t(`${piPrefix}.dateOfBirthSaveFailed`));
      }
      setIso(draftIso);
      toast.success(t(`${piPrefix}.dateOfBirthSaved`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(`${piPrefix}.dateOfBirthSaveFailed`));
    } finally {
      setSaving(false);
    }
  }, [day, draftIso, month, piPrefix, t, year]);

  return (
    <section id="date-of-birth-section" className="rounded-xl border border-gray-100 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{t(`${dobPrefix}.dateOfBirth`)}</h2>
      <p className="mt-1 text-sm text-gray-600">{t(`${piPrefix}.dateOfBirthSafetyHint`)}</p>
      {iso ? (
        <p className="mt-3 text-sm font-medium text-gray-800">{formatLegalDobDisplay(iso)}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={day ?? ""}
          onChange={(e) => setDay(e.target.value ? Number(e.target.value) : null)}
          aria-label={t(`${dobPrefix}.day`)}
        >
          <option value="">{t(`${dobPrefix}.day`)}</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[8rem]"
          value={month ?? ""}
          onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}
          aria-label={t(`${dobPrefix}.month`)}
        >
          <option value="">{t(`${dobPrefix}.month`)}</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {t(`${dobPrefix}.month${m}`)}
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={year ?? ""}
          onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
          aria-label={t(`${dobPrefix}.year`)}
        >
          <option value="">{t(`${dobPrefix}.year`)}</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? t(`${piPrefix}.saving`) : t(`${piPrefix}.save`)}
        </button>
      </div>
    </section>
  );
}
