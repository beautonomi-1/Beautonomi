"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useEffect, useState } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import Link from "next/link";

export default function TipsSettings() {
  const { t } = useTranslation();
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetcher.get<{ data: { tips_enabled: boolean } }>(
          "/api/provider/settings/sales/tips"
        );
        setTipsEnabled(Boolean(res.data.tips_enabled));
      } catch {
        toast.error(t("web.provider.settings.pages.sales/tips.failedToLoadTipSettings"));
      }
    };
    load();
  }, []);

  const onSave = async () => {
    try {
      setIsSaving(true);
      const res = await fetcher.patch<{ data: { tips_enabled: boolean } }>(
        "/api/provider/settings/sales/tips",
        { tips_enabled: Boolean(tipsEnabled) }
      );
      setTipsEnabled(Boolean(res.data.tips_enabled));
      toast.success(t("web.provider.settings.pages.sales/tips.tipSettingsSaved"));
    } catch (e: any) {
      toast.error(e?.message || t("web.provider.settings.pages.sales/tips.failedToSave"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.sales.items.tips.title")}
      subtitle={t("web.provider.settings.categories.sales.items.tips.description")}
      onSave={onSave}
      isSaving={isSaving}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.sales/tips.sales"), href: "/provider/settings/sales/yoco-integration" },
        { label: t("web.provider.settings.pages.sales/tips.tips") },
      ]}
    >

      <SectionCard>
        <div className="space-y-5">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-950">{t("web.provider.settings.pages.sales/tips.onByDefault")}</p>
            <p className="mt-1 text-sm text-emerald-800">
{t("web.provider.settings.pages.sales/tips.onByDefaultBody")}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">{t("web.provider.settings.pages.sales/tips.enableTips")}</Label>
              <p className="text-sm text-gray-600">{t("web.provider.settings.pages.sales/tips.enableHint")}</p>
            </div>
            <Switch checked={tipsEnabled} onCheckedChange={setTipsEnabled} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/provider/settings/tips/distribution"
              className="rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-800 hover:border-primary hover:text-primary"
            >
{t("web.provider.settings.pages.sales/tips.tipDistribution")}
              <span className="mt-1 block text-xs font-normal text-gray-500">
                {t("web.provider.settings.pages.sales/tips.tipDistributionHint")}
              </span>
            </Link>
            <Link
              href="/provider/settings/payments"
              className="rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-800 hover:border-primary hover:text-primary"
            >
{t("web.provider.settings.pages.sales/tips.paymentSettings")}
              <span className="mt-1 block text-xs font-normal text-gray-500">
                {t("web.provider.settings.pages.sales/tips.paymentSettingsHint")}
              </span>
            </Link>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
