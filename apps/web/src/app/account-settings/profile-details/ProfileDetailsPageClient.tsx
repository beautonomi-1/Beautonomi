"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Heart, Loader2, MessageCircle, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChipCombobox } from "@/components/ui/chip-combobox";
import { deleteFetcherGetCacheEntriesMatching, fetcher } from "@/lib/http/fetcher";
import {
  ALLERGY_SUGGESTION_KEYS,
  APPOINTMENT_STYLE_OPTIONS,
  DECADE_BORN_OPTIONS,
  HAIR_TYPE_OPTIONS,
  INTEREST_SUGGESTION_KEYS,
  PRODUCT_PREFERENCE_OPTIONS,
  PROFILE_DETAILS_SECTION_IDS,
  PROFILE_QUESTION_FIELDS,
  SKIN_TYPE_OPTIONS,
  THINGS_TO_AVOID_OPTIONS,
  buildBeautyPreferencesPatch,
  buildProfileDataPatch,
  countAnsweredQuestions,
  mergeSavedBaseline,
  profileDetailsFormFromApi,
  type ProfileDetailsFormState,
} from "@/lib/profile/profile-details-form";
import AccountPageFrame from "../components/account-page-frame";

function Section({
  id,
  icon: Icon,
  title,
  hint,
  highlighted,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  hint?: string;
  highlighted: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-32 rounded-2xl border bg-white p-4 sm:p-6 transition-shadow ${
        highlighted ? "border-[#FF0077] ring-2 ring-[#FF0077]/30" : "border-gray-100"
      }`}
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
        <Icon className="h-5 w-5 text-[#FF0077]" aria-hidden />
        {title}
      </h2>
      {hint ? <p className="mt-1 text-sm text-gray-500">{hint}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function ChoiceGroup({
  label,
  options,
  value,
  onChange,
  labelFor,
  clearLabel,
}: {
  label: string;
  options: readonly { value: string; labelKey: string }[];
  value: string;
  onChange: (v: string) => void;
  labelFor: (key: string) => string;
  clearLabel: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-gray-700">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? "" : opt.value)}
              className={`min-h-11 rounded-xl border-2 px-3.5 text-sm font-medium transition-colors ${
                selected ? "border-[#FF0077] bg-pink-50 text-[#FF0077]" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              {labelFor(opt.labelKey)}
            </button>
          );
        })}
        {value && !options.some((o) => o.value === value) ? (
          <button
            type="button"
            aria-pressed
            onClick={() => onChange("")}
            className="min-h-11 rounded-xl border-2 border-[#FF0077] bg-pink-50 px-3.5 text-sm font-medium text-[#FF0077]"
            title={clearLabel}
          >
            {value} ×
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}

export default function ProfileDetailsPageClient() {
  const { t } = useTranslation();
  const pd = useCallback(
    (key: string, opts?: Record<string, string | number>) =>
      t(`customer.mobile.screens.profileDetails.${key}`, opts ?? {}) as string,
    [t],
  );
  const pp = useCallback((key: string) => t(`web.accountSettings.profileDetailsPage.${key}`) as string, [t]);

  const [initial, setInitial] = useState<ProfileDetailsFormState | null>(null);
  const [form, setForm] = useState<ProfileDetailsFormState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [beautyWarning, setBeautyWarning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    const [profileRes, beautyRes] = await Promise.allSettled([
      fetcher.get<{ data: Record<string, unknown> | null }>("/api/me/profile-data", { staleTimeMs: 0 }),
      fetcher.get<{ data: Record<string, unknown> | null }>("/api/me/beauty-preferences", { staleTimeMs: 0 }),
    ]);
    if (profileRes.status === "rejected") {
      setLoadError(true);
      return;
    }
    setBeautyWarning(beautyRes.status === "rejected");
    const state = profileDetailsFormFromApi(
      profileRes.value?.data,
      beautyRes.status === "fulfilled" ? beautyRes.value?.data : null,
    );
    setInitial(state);
    setForm(state);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loaded = form != null;
  useEffect(() => {
    if (!loaded) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!(PROFILE_DETAILS_SECTION_IDS as readonly string[]).includes(hash)) return;
    setHighlight(hash);
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const timer = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  const update = <K extends keyof ProfileDetailsFormState>(key: K, value: ProfileDetailsFormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (!form || !initial || saving) return;
    const profileBody = buildProfileDataPatch(initial, form);
    const beautyBody = beautyWarning ? {} : buildBeautyPreferencesPatch(initial, form);
    const hasProfile = Object.keys(profileBody).length > 0;
    const hasBeauty = Object.keys(beautyBody).length > 0;
    if (!hasProfile && !hasBeauty) {
      toast.message(pp("noChanges"));
      return;
    }
    setSaving(true);
    const [profileRes, beautyRes] = await Promise.allSettled([
      hasProfile ? fetcher.post("/api/me/profile-data", profileBody) : Promise.resolve(null),
      hasBeauty ? fetcher.patch("/api/me/beauty-preferences", beautyBody) : Promise.resolve(null),
    ]);
    setSaving(false);
    deleteFetcherGetCacheEntriesMatching("/api/me/profile");

    const errors: string[] = [];
    if (profileRes.status === "rejected") {
      errors.push(pd("saveErrorProfile", { message: (profileRes.reason as Error)?.message || pd("saveFailedGeneric") }));
    }
    if (beautyRes.status === "rejected") {
      errors.push(pd("saveErrorBeauty", { message: (beautyRes.reason as Error)?.message || pd("saveFailedGeneric") }));
    }
    setInitial(
      mergeSavedBaseline(initial, form, {
        profile: hasProfile && profileRes.status === "fulfilled",
        beauty: hasBeauty && beautyRes.status === "fulfilled",
      }),
    );
    if (errors.length) toast.error(pd("saveFailed"), { description: errors.join("\n") });
    else toast.success(pd("savedTitle"), { description: pd("savedBody") });
  };

  return (
    <AccountPageFrame
      title={t("customer.accountSettings.profileDetailsTitle") as string}
      subtitle={t("customer.accountSettings.profileDetailsDesc") as string}
    >
      {loadError ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <p>{pd("loadFailed")}</p>
          <Button variant="outline" className="mt-3 min-h-11" onClick={() => void load()}>
            {t("web.accountSettings.safety.retry")}
          </Button>
        </div>
      ) : !form ? (
        <div className="flex justify-center py-12" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-[#FF0077]" />
        </div>
      ) : (
        <>
          <Section id="about" icon={UserRound} title={pp("aboutSection")} hint={pp("aboutHint")} highlighted={highlight === "about"}>
            <Textarea
              aria-label={pp("aboutSection")}
              value={form.about}
              onChange={(e) => update("about", e.target.value)}
              placeholder={pp("aboutPlaceholder")}
              rows={4}
              className="text-base sm:text-sm"
            />
          </Section>

          <Section
            id="profile-questions"
            icon={MessageCircle}
            title={pd("profileQuestionsSection")}
            hint={pd("profileQuestionsHint", { answered: String(countAnsweredQuestions(form)) })}
            highlighted={highlight === "profile-questions"}
          >
            {PROFILE_QUESTION_FIELDS.map(({ key, labelKey }) =>
              key === "decade_born" ? (
                <ChoiceGroup
                  key={key}
                  label={pd(labelKey)}
                  options={DECADE_BORN_OPTIONS}
                  value={form.questions[key]}
                  onChange={(v) => update("questions", { ...form.questions, [key]: v })}
                  labelFor={pd}
                  clearLabel={pp("clearChoice")}
                />
              ) : (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`pd-${key}`}>{pd(labelKey)}</Label>
                  <Input
                    id={`pd-${key}`}
                    value={form.questions[key]}
                    onChange={(e) => update("questions", { ...form.questions, [key]: e.target.value })}
                    className="min-h-11 text-base sm:text-sm"
                  />
                </div>
              ),
            )}
          </Section>

          <Section
            id="interests"
            icon={Heart}
            title={pd("interestsSection")}
            hint={pd("interestsSubtitle")}
            highlighted={highlight === "interests"}
          >
            <ChipCombobox
              value={form.interests}
              onChange={(v) => update("interests", v)}
              staticSuggestions={INTEREST_SUGGESTION_KEYS.map((k) => ({ value: pd(k), label: pd(k) }))}
              allowFreeForm
              placeholder={pd("interestsPlaceholder")}
              aria-label={pd("interestsA11y")}
            />
          </Section>

          <Section
            id="beauty-preferences"
            icon={Sparkles}
            title={pd("beautySection")}
            hint={pd("beautySubtitle")}
            highlighted={highlight === "beauty-preferences"}
          >
            {beautyWarning ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {pd("beautyPrefsLoadFailed")}
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <ChoiceGroup
                    label={pd("hairType")}
                    options={HAIR_TYPE_OPTIONS}
                    value={form.hairType}
                    onChange={(v) => update("hairType", v)}
                    labelFor={pd}
                    clearLabel={pp("clearChoice")}
                  />
                  <ChoiceGroup
                    label={pd("skinType")}
                    options={SKIN_TYPE_OPTIONS}
                    value={form.skinType}
                    onChange={(v) => update("skinType", v)}
                    labelFor={pd}
                    clearLabel={pp("clearChoice")}
                  />
                </div>
                <ChoiceGroup
                  label={pd("appointmentStyle")}
                  options={APPOINTMENT_STYLE_OPTIONS}
                  value={form.appointmentStyle}
                  onChange={(v) => update("appointmentStyle", v)}
                  labelFor={pd}
                  clearLabel={pp("clearChoice")}
                />
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-gray-700">{pd("thingsToAvoid")}</p>
                  <ChipCombobox
                    value={form.thingsToAvoid}
                    onChange={(v) => update("thingsToAvoid", v)}
                    staticSuggestions={THINGS_TO_AVOID_OPTIONS.map((o) => ({ value: o.value, label: pd(o.labelKey) }))}
                    allowFreeForm
                    placeholder={pd("thingsToAvoidPlaceholder")}
                    aria-label={pd("thingsToAvoidA11y")}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-gray-700">{pd("productPreferences")}</p>
                  <ChipCombobox
                    value={form.productPreferences}
                    onChange={(v) => update("productPreferences", v)}
                    staticSuggestions={PRODUCT_PREFERENCE_OPTIONS.map((o) => ({ value: o.value, label: pd(o.labelKey) }))}
                    allowFreeForm
                    placeholder={pd("productPreferencesPlaceholder")}
                    aria-label={pd("productPreferencesA11y")}
                  />
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-gray-700">{pd("allergies")}</p>
                  <ChipCombobox
                    value={form.allergies}
                    onChange={(v) => update("allergies", v)}
                    staticSuggestions={ALLERGY_SUGGESTION_KEYS.map((k) => ({ value: pd(k), label: pd(k) }))}
                    allowFreeForm
                    placeholder={pd("allergiesPlaceholder")}
                    aria-label={pd("allergiesA11y")}
                  />
                </div>
              </>
            )}
          </Section>

          <Button
            onClick={() => void save()}
            disabled={saving}
            className="min-h-11 w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565]"
            aria-label={pd("saveAllA11y")}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : pd("saveAll")}
          </Button>
        </>
      )}
    </AccountPageFrame>
  );
}
