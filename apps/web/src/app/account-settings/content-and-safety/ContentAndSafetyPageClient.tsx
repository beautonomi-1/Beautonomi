"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FetchError } from "@/lib/http/fetcher";
import {
  SAFETY_SETTING_KEYS,
  canToggleSafetySetting,
  fetchSafetySettings,
  patchSafetySetting,
  type SafetySettingKey,
  type SafetySettingsSnapshot,
} from "@/lib/safety/safety-settings-client";
import AccountPageFrame from "../components/account-page-frame";

export default function ContentAndSafetyPageClient() {
  const { t } = useTranslation();
  const cs = useCallback((key: string) => t(`customer.mobile.screens.contentSafety.${key}`) as string, [t]);
  const sf = useCallback((key: string) => t(`web.accountSettings.safety.${key}`) as string, [t]);

  const [snapshot, setSnapshot] = useState<SafetySettingsSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [savingKey, setSavingKey] = useState<SafetySettingKey | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setSnapshot(await fetchSafetySettings());
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onToggle = async (key: SafetySettingKey, value: boolean) => {
    if (!snapshot || !canToggleSafetySetting(snapshot, key) || savingKey) return;
    const previous = snapshot;
    setSnapshot({ ...snapshot, settings: { ...snapshot.settings, [key]: value } });
    setSavingKey(key);
    try {
      setSnapshot(await patchSafetySetting(key, value));
      toast.success(sf("updated"));
    } catch (error) {
      setSnapshot(previous);
      const message =
        error instanceof FetchError && error.code === "SAFETY_SETTING_LOCKED" ? cs("lockedNote") : cs("updateErrorBody");
      toast.error(message);
    } finally {
      setSavingKey(null);
    }
  };

  const anyLocked = snapshot ? SAFETY_SETTING_KEYS.some((k) => snapshot.locked[k]) : false;

  return (
    <AccountPageFrame
      title={t("customer.accountSettings.contentSafetyTitle") as string}
      subtitle={t("customer.accountSettings.contentSafetyDesc") as string}
      backHref="/account-settings/safety"
      parents={[{ label: t("customer.mobile.screens.safetyHub.title") as string, href: "/account-settings/safety" }]}
    >
      {loadError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <p>{cs("loadFailed")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void load()}>
            {sf("retry")}
          </Button>
        </div>
      ) : !snapshot ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-[#FF0077]" />
        </div>
      ) : (
        <>
          {snapshot.age_band === "unknown" ? (
            <div className="rounded-xl bg-pink-50 p-4">
              <p className="text-sm text-gray-700">{cs("unknownAgeNotice")}</p>
              <Button asChild className="mt-3 min-h-11 bg-[#FF0077] hover:bg-[#D60565] w-full sm:w-auto">
                <Link href="/account-settings/age-assurance">{cs("addDateOfBirth")}</Link>
              </Button>
            </div>
          ) : null}
          {snapshot.age_band === "13_17" ? (
            <div className="rounded-xl bg-pink-50 p-4 text-sm text-gray-700">{cs("ageBandNote")}</div>
          ) : null}

          <ul className="space-y-3">
            {SAFETY_SETTING_KEYS.map((key) => {
              const locked = snapshot.locked[key];
              const id = `safety-toggle-${key}`;
              return (
                <li
                  key={key}
                  className={`flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-white p-4 ${locked ? "opacity-75" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="font-medium text-gray-900 flex items-center gap-2">
                      {cs(`toggle_${key}_label`)}
                      {locked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          <Lock className="h-3 w-3" aria-hidden />
                          {sf("managed")}
                        </span>
                      ) : null}
                    </label>
                    <p className="mt-0.5 text-sm text-gray-500">{cs(`toggle_${key}_desc`)}</p>
                    {key === "require_device_auth" ? (
                      <p className="mt-1 text-xs text-gray-400">{sf("deviceAuthWebNote")}</p>
                    ) : null}
                  </div>
                  <div className="flex h-11 w-12 shrink-0 items-center justify-end">
                    {savingKey === key ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[#FF0077]" />
                    ) : (
                      <Switch
                        id={id}
                        checked={snapshot.settings[key]}
                        disabled={locked || savingKey != null}
                        onCheckedChange={(v) => void onToggle(key, v)}
                        aria-describedby={locked ? "safety-locked-note" : undefined}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {anyLocked ? (
            <p id="safety-locked-note" className="text-sm text-gray-500">
              {cs("lockedNote")}
            </p>
          ) : null}

          <div className="space-y-3 text-sm">
            <Link href="/age-suitability" className="inline-flex min-h-11 items-center font-semibold text-[#FF0077] underline">
              {cs("linkAgeSuitability")}
            </Link>
            <p className="text-gray-500">{cs("reportingHint")}</p>
          </div>
        </>
      )}
    </AccountPageFrame>
  );
}
