"use client";

import React from "react";
import { Button } from "../ui/button";
import Link from "next/link";
import { useTranslation } from "@beautonomi/i18n";

const Navbar4 = () => {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-10 border-b border-zinc-200/80 bg-white">
    <div className="container">
      <div className="flex justify-between items-center py-3">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-xl font-bold" style={{ color: "#FF0077" }}>{t("web.seo.siteName")}</span>
      </Link>
        <div className="hidden md:flex items-center gap-5">
          <Link href="/account-settings/payments" className="text-secondary text-base font-normal underline">
            {t("web.layout.navbar.redeem")}
          </Link>
          <Button asChild variant="secondary" size="rounded">
            <Link href="/gift-card/purchase">{t("web.layout.navbar.buyNow")}</Link>
          </Button>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white p-4 shadow-lg flex items-center justify-between z-10">
        <Link href="/account-settings/payments" className="text-secondary text-base font-normal underline">
          {t("web.layout.navbar.redeem")}
        </Link>
        <Button asChild variant="secondary" size="rounded">
          <Link href="/gift-card/purchase">{t("web.layout.navbar.buyNow")}</Link>
        </Button>
      </div>
    </div>
    </div>
  );
};

export default Navbar4;
