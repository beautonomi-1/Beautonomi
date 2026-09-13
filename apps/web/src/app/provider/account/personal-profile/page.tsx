"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";

const SOFT_LIMIT = 200;
const HARD_LIMIT = 1000;

type MeProfile = {
  full_name?: string | null;
  preferred_name?: string | null;
  about?: string | null;
  biography_title?: string | null;
};

export default function ProviderPersonalProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [about, setAbout] = useState("");
  const [biographyTitle, setBiographyTitle] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data: MeProfile }>("/api/me/profile");
        if (cancelled) return;
        const profile = res.data ?? {};
        setAbout(typeof profile.about === "string" ? profile.about : "");
        setBiographyTitle(
          typeof profile.biography_title === "string" ? profile.biography_title : "",
        );
        setDisplayName(
          profile.preferred_name?.trim() ||
            profile.full_name?.trim() ||
            t("web.provider.pages.account/personal-profile.fallbackName"),
        );
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof FetchError ? err.message : t("web.provider.pages.account/personal-profile.loadFailed"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleSave = useCallback(async () => {
    const trimmed = about.trim();
    if (!trimmed) {
      toast.error(t("web.provider.pages.account/personal-profile.bioRequired"));
      return;
    }
    if (trimmed.length > HARD_LIMIT) {
      toast.error(t("web.provider.pages.account/personal-profile.bioTooLong", { max: HARD_LIMIT }));
      return;
    }

    setSaving(true);
    try {
      await fetcher.patch("/api/me/profile", {
        about: trimmed,
        biography_title: biographyTitle.trim() || null,
      });
      toast.success(t("web.provider.pages.account/personal-profile.saved"));
      if (returnTo) {
        router.push(returnTo);
      } else {
        router.back();
      }
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.account/personal-profile.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [about, biographyTitle, returnTo, router, t]);

  if (loading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.pages.account/personal-profile.title")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.settings.tabs.account"), href: "/provider/account/profile" },
          { label: t("web.provider.pages.account/personal-profile.title") },
        ]}
      >
<LoadingTimeout loadingMessage={t("web.provider.pages.account/personal-profile.loading")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.pages.account/personal-profile.title")}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.settings.tabs.account"), href: "/provider/account/profile" },
        { label: t("web.provider.pages.account/personal-profile.title") },
      ]}
    >
      <div className="max-w-2xl space-y-6">
<SectionCard title={displayName || t("web.provider.pages.account/personal-profile.fallbackName")} description={t("web.provider.pages.account/personal-profile.subtitle")}>
          <div className="space-y-4">
            <div>
<Label htmlFor="biography_title">{t("web.provider.pages.account/personal-profile.headline")}</Label>
              <Input
                id="biography_title"
                value={biographyTitle}
                onChange={(e) => setBiographyTitle(e.target.value)}
placeholder={t("web.provider.pages.account/personal-profile.headlinePlaceholder")}
                className="mt-1"
              />
            </div>
            <div>
<Label htmlFor="about">{t("web.provider.pages.account/personal-profile.aboutYou")}</Label>
              <Textarea
                id="about"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
placeholder={t("web.provider.pages.account/personal-profile.aboutPlaceholder")}
                rows={6}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
{t("web.provider.pages.account/personal-profile.charCount", { count: about.trim().length, limit: HARD_LIMIT })}
                {about.trim().length > 0 && about.trim().length < SOFT_LIMIT
                  ? t("web.provider.pages.account/personal-profile.softLimitHint")
                  : ""}
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSave} disabled={saving}>
{saving ? t("web.provider.common.savingEllipsis") : t("web.provider.pages.account/personal-profile.saveProfile")}
              </Button>
              {returnTo ? (
                <Button variant="outline" onClick={() => router.push(returnTo)}>
{t("web.provider.pages.account/personal-profile.backToChecklist")}
                </Button>
              ) : null}
            </div>
          </div>
        </SectionCard>
      </div>
    </SettingsDetailLayout>
  );
}
