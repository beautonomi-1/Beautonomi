"use client";

import { useTranslation } from "@beautonomi/i18n";
import React from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ServicesMenuSettings() {
  const { t } = useTranslation();
  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.services.items.servicesMenu.title")}
      subtitle={t("web.provider.settings.categories.services.items.servicesMenu.description")}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.categories.services.items.servicesMenu.title") },
      ]}
    >
      <SectionCard>
        <p className="text-gray-600 mb-4">
          {t("web.provider.settings.pages.services/menu.body")}
        </p>
        <Link href="/provider/catalogue/services">
          <Button className="bg-primary hover:bg-primary-hover">
            {t("web.provider.settings.pages.services/menu.manageCatalogue")}
          </Button>
        </Link>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
