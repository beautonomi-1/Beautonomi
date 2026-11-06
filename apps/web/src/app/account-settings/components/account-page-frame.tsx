"use client";

import type { ReactNode } from "react";
import { useTranslation } from "@beautonomi/i18n";
import Breadcrumb from "./breadcrumb";
import BackButton from "./back-button";

interface AccountPageFrameProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  /** Crumbs between "Account" and the current page. */
  parents?: { label: string; href: string }[];
  children: ReactNode;
}

/** Content frame for pages rendered inside the account-settings layout (which owns nav, footer, and bottom nav). */
export default function AccountPageFrame({
  title,
  subtitle,
  backHref = "/account-settings",
  parents = [],
  children,
}: AccountPageFrameProps) {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-8">
      <BackButton href={backHref} label={t("common.back", { defaultValue: "Back" }) as string} />
      <Breadcrumb
        items={[
          { label: t("web.accountSettings.account") as string, href: "/account-settings" },
          ...parents,
          { label: title },
        ]}
      />
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-gray-900">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm md:text-base text-gray-600">{subtitle}</p> : null}
      </header>
      <div className="space-y-6">{children}</div>
    </div>
  );
}
