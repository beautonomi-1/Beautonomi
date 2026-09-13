"use client";

import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye } from "lucide-react";

type RecentlyAddProps = {
  thumbnails?: string[];
  subtitle?: string;
};

const RecentlyAdd = ({ thumbnails = [], subtitle }: RecentlyAddProps) => {
  const { t } = useTranslation();
  const tiles = [...thumbnails].filter(Boolean).slice(0, 4);
  const hasRecentViews = tiles.length > 0;

  return (
    <div className="mb-6">
      <h3 className="text-lg font-medium text-gray-900 mb-3">{t("customer.recentlyViewed")}</h3>
      {hasRecentViews ? (
        <Link
          href="/account-settings/wishlists/recently-viewed"
          className="block"
          aria-label={t("web.accountSettings.wishlists.viewRecentlyViewedAria")}
        >
          <div className="border rounded-3xl grid grid-cols-2 p-2 max-w-sm gap-3 hover:border-[#FF0077] transition-colors cursor-pointer">
            {tiles.map((src, idx) => {
              const corner =
                idx === 0
                  ? "rounded-tl-3xl"
                  : idx === 1
                  ? "rounded-tr-3xl"
                  : idx === 2
                  ? "rounded-bl-3xl"
                  : "rounded-br-3xl";
              return (
                <div key={`${src}-${idx}`} className={`relative h-32 md:h-44 overflow-hidden ${corner}`}>
                  <Image
                    src={src}
                    alt={t("web.accountSettings.wishlists.recentlyViewedProviderAlt", { n: idx + 1 })}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                  />
                </div>
              );
            })}
          </div>
        </Link>
      ) : (
        <Link
          href="/account-settings/wishlists/recently-viewed"
          className="block max-w-sm rounded-3xl border border-dashed border-gray-200 bg-gray-50/70 p-6 transition-colors hover:border-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF0077]"
          aria-label={t("web.accountSettings.wishlists.viewRecentlyViewedAria")}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
            <Eye className="h-6 w-6" aria-hidden />
          </div>
          <p className="mt-4 text-sm font-medium text-gray-900">{t("web.accountSettings.wishlists.noRecentViews")}</p>
          <p className="mt-1 text-sm text-gray-600">{t("web.accountSettings.wishlists.browseToAppear")}</p>
        </Link>
      )}
      <p className="text-sm text-gray-600 mt-2">
        {subtitle || (hasRecentViews ? t("web.accountSettings.wishlists.clickToViewAll") : t("web.accountSettings.wishlists.startBrowsing"))}
      </p>
    </div>
  );
};

export default RecentlyAdd;
