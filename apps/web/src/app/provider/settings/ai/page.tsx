"use client";

import { useTranslation } from "@beautonomi/i18n";
import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";

type ProfilePatch = {
  headline?: string;
  bio?: string;
  specialties?: string[];
  faq?: string[];
  policies?: string[];
};

type ContentStudio = {
  post_captions?: string[];
  hashtags?: string[];
  short_description?: string;
};



export default function ProviderAiStudioPage() {
  const { t } = useTranslation();
  const [extra, setExtra] = useState("");
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfilePatch | null>(null);
  const [content, setContent] = useState<ContentStudio | null>(null);
  const [streamPreview, setStreamPreview] = useState("");
  const [genericResult, setGenericResult] = useState<Record<string, unknown> | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [applying, setApplying] = useState(false);
  const features = [
    {
      key: "ai.provider.profile_completion",
      title: t("web.provider.settings.pages.ai.profileSuggestions"),
      description: t("web.provider.settings.pages.ai.profileSuggestionsDesc"),
    },
    {
      key: "ai.provider.content_studio",
      title: t("web.provider.settings.pages.ai.contentStudio"),
      description: t("web.provider.settings.pages.ai.contentStudioDesc"),
    },
    {
      key: "ai.provider.smart_replies",
      title: t("web.provider.settings.pages.ai.smartReplies"),
      description: t("web.provider.settings.pages.ai.smartRepliesDesc"),
    },
    {
      key: "ai.provider.pricing_assistant",
      title: t("web.provider.settings.pages.ai.pricingAssistant"),
      description: t("web.provider.settings.pages.ai.pricingAssistantDesc"),
    },
    {
      key: "ai.provider.booking_ops",
      title: t("web.provider.settings.pages.ai.bookingOps"),
      description: t("web.provider.settings.pages.ai.bookingOpsDesc"),
    },
    {
      key: "ai.provider.reputation_coach",
      title: t("web.provider.settings.pages.ai.reputationCoach"),
      description: t("web.provider.settings.pages.ai.reputationCoachDesc"),
    },
    {
      key: "ai.provider.look_describe",
      title: t("web.provider.settings.pages.ai.lookDescribe"),
      description: t("web.provider.settings.pages.ai.lookDescribeDesc"),
    },
  ] as const;

  async function runStream(featureKey: string) {
    if (featureKey !== "ai.provider.content_studio") return;
    setLoadingKey(featureKey);
    setStreamPreview("");
    setContent(null);
    setProfile(null);
    try {
      const res = await fetch(`/api/provider/ai/${encodeURIComponent(featureKey)}/stream`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: extra.trim() || undefined }),
        credentials: "include",
      });
      if (!res.ok || !res.body) {
        throw new FetchError("Stream failed", res.status);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setStreamPreview(acc);
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.settings.pages.ai.requestFailed"));
    } finally {
      setLoadingKey(null);
    }
  }

  async function run(featureKey: string) {
    setLoadingKey(featureKey);
    setStreamPreview("");
    setGenericResult(null);
    try {
      const body: Record<string, unknown> = { input: extra.trim() || undefined };
      if (featureKey === "ai.provider.look_describe" && imageUrl.trim()) {
        body.image_url = imageUrl.trim();
      }
      const res = await fetcher.post<{ data?: Record<string, unknown> }>(
        `/api/provider/ai/${encodeURIComponent(featureKey)}`,
        body,
      );
      const payload = ((res as { data?: Record<string, unknown> }).data ?? res) as Record<string, unknown>;
      setGenericResult(payload);
      if (featureKey === "ai.provider.profile_completion") {
        setProfile((payload.suggested_profile_patch as ProfilePatch) ?? null);
        setContent(null);
      } else if (featureKey === "ai.provider.content_studio") {
        setContent(payload as ContentStudio);
        setProfile(null);
      } else {
        setProfile(null);
        setContent(null);
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.settings.pages.ai.requestFailed"));
    } finally {
      setLoadingKey(null);
    }
  }

  function renderGenericResult(data: Record<string, unknown>) {
    const list = (key: string) =>
      Array.isArray(data[key]) ? (data[key] as string[]).map((item) => (
        <li key={item} className="flex items-start justify-between gap-2 text-sm">
          <span>{item}</span>
          <Button variant="outline" size="sm" onClick={() => void copyText(item)}>
            {t("web.provider.common.copy")}
          </Button>
        </li>
      )) : null;

    return (
      <div className="mt-6 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm">
        {data.fallback ? (
          <p className="text-xs text-amber-700">
            Template fallback ({String(data.fallback_reason ?? "budget")})
          </p>
        ) : null}
        {data.replies ? <ul className="space-y-2">{list("replies")}</ul> : null}
        {data.suggestions ? (
          <ul className="space-y-2">
            {(data.suggestions as Array<{ offering_name: string; suggested_price: number; rationale: string }>).map((s) => (
              <li key={s.offering_name}>
                <strong>{s.offering_name}</strong>: {s.suggested_price} — {s.rationale}
              </li>
            ))}
          </ul>
        ) : null}
        {data.reminder_sms ? <p><strong>Reminder:</strong> {String(data.reminder_sms)}</p> : null}
        {data.no_show_sms ? <p><strong>No-show:</strong> {String(data.no_show_sms)}</p> : null}
        {data.reschedule_message ? <p><strong>Reschedule:</strong> {String(data.reschedule_message)}</p> : null}
        {data.review_replies ? <ul className="space-y-2">{list("review_replies")}</ul> : null}
        {data.recovery_tips ? <ul className="list-disc pl-5">{list("recovery_tips")}</ul> : null}
        {data.caption ? <p><strong>Caption:</strong> {String(data.caption)}</p> : null}
        {data.alt_text ? <p><strong>Alt text:</strong> {String(data.alt_text)}</p> : null}
        {data.tags ? <p><strong>Tags:</strong> {(data.tags as string[]).join(", ")}</p> : null}
      </div>
    );
  }

  async function applyBio() {
    const bio = profile?.bio?.trim();
    if (!bio) {
      toast.error(t("web.provider.settings.pages.ai.generateABioFirst"));
      return;
    }
    setApplying(true);
    try {
      await fetcher.patch("/api/provider/profile", { description: bio });
      toast.success(t("web.provider.settings.pages.ai.businessDescriptionUpdated"));
    } catch (err) {
toast.error(err instanceof FetchError ? err.message : t("web.provider.settings.pages.ai.couldNotApplyBio"));
    } finally {
      setApplying(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("web.provider.settings.pages.ai.copied"));
    } catch {
      toast.error(t("web.provider.settings.pages.ai.couldNotCopy"));
    }
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]} redirectTo="/provider/dashboard">
      <div className="w-full max-w-3xl">
        <PageHeader
          title={t("web.provider.settings.categories.marketingIntegrations.items.aiStudio.title")}
          subtitle={t("web.provider.settings.categories.marketingIntegrations.items.aiStudio.description")}
          breadcrumbs={[
            { label: t("web.provider.common.breadcrumbHome"), href: "/" },
            { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
            { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
            { label: t("web.provider.settings.pages.ai.aiStudio") },
          ]}
        />

<label className="mb-2 block text-sm font-medium text-gray-700">{t("web.provider.settings.pages.ai.optionalContext")}</label>
        <Textarea
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder={t("web.provider.settings.pages.ai.eGFocusOnBridalMakeup")}
          className="mb-4 min-h-[88px]"
        />
        <label className="mb-6 block text-sm font-medium text-gray-700">
          {t("web.provider.settings.pages.ai.imageUrlOptional")}
        </label>
        <input
          type="url"
          className="mb-6 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://… (for Look describe)"
        />

        <div className="grid gap-4 md:grid-cols-2">
{features.map((f) => (
            <div key={f.key} className="rounded-2xl border border-gray-100 bg-white p-4">
              <h2 className="text-base font-semibold text-gray-900">{f.title}</h2>
              <p className="mt-1 text-sm text-gray-500">{f.description}</p>
              <div className="mt-3 flex flex-col gap-2">
                <Button className="w-full" disabled={loadingKey !== null} onClick={() => void run(f.key)}>
                  {loadingKey === f.key ? t("web.provider.settings.pages.ai.generating") : t("web.provider.common.generate")}
                </Button>
                {f.key === "ai.provider.content_studio" ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={loadingKey !== null}
                    onClick={() => void runStream(f.key)}
                  >
                    {loadingKey === f.key ? t("web.provider.settings.pages.ai.generating") : t("web.provider.settings.pages.ai.stream")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {profile ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            {profile.headline ? (
              <p>
<span className="text-xs font-semibold uppercase text-gray-500">{t("web.provider.settings.pages.ai.headline")}</span>
                <br />
                {profile.headline}
              </p>
            ) : null}
            {profile.bio ? (
              <p>
<span className="text-xs font-semibold uppercase text-gray-500">{t("web.provider.settings.pages.ai.bio")}</span>
                <br />
                {profile.bio}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void applyBio()} disabled={applying || !profile.bio}>
{applying ? t("web.provider.settings.pages.ai.applying") : t("web.provider.settings.pages.ai.applyBio")}
              </Button>
              <Button variant="outline" asChild>
<Link href="/provider/settings/business-description">{t("web.provider.settings.pages.ai.openBusinessDescription")}</Link>
              </Button>
            </div>
          </div>
        ) : null}

        {streamPreview ? (
          <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="whitespace-pre-wrap text-sm text-gray-800">{streamPreview}</p>
          </div>
        ) : null}

        {content ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            {(content.post_captions ?? []).map((c) => (
              <div key={c} className="flex items-start justify-between gap-3">
                <p className="text-sm text-gray-800">{c}</p>
                <Button variant="outline" size="sm" onClick={() => void copyText(c)}>
                  {t("web.provider.common.copy")}
                </Button>
              </div>
            ))}
            {content.hashtags?.length ? (
              <p className="text-sm text-gray-600">{content.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>
            ) : null}
          </div>
        ) : null}

        {genericResult && !profile && !content?.post_captions?.length ? renderGenericResult(genericResult) : null}
      </div>
    </RoleGuard>
  );
}
