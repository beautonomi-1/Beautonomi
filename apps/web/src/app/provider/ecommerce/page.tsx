"use client";

import { useTranslation } from "@beautonomi/i18n";
import React from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { Store, Truck, ShoppingBag, Undo2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EcommerceHubPage() {
  const { t } = useTranslation();
  const items = [
    { label: t("web.provider.sidebar.items.orders"), href: "/provider/ecommerce/orders", icon: ShoppingBag, description: t("web.provider.pages.ecommerce.ordersDesc") },
    { label: t("web.provider.sidebar.items.returns"), href: "/provider/ecommerce/returns", icon: Undo2, description: t("web.provider.pages.ecommerce.returnsDesc") },
    { label: t("web.provider.sidebar.items.products"), href: "/provider/ecommerce/products", icon: Store, description: t("web.provider.pages.ecommerce.productsDesc") },
    { label: t("web.provider.pages.ecommerce/shipping.title"), href: "/provider/ecommerce/shipping", icon: Truck, description: t("web.provider.pages.ecommerce.shippingDesc") },
    { label: t("web.provider.sidebar.items.walkInSale"), href: "/provider/ecommerce/walk-in", icon: Store, description: t("web.provider.pages.ecommerce.walkInDesc") },
  ];
  return (
    <div>
      <PageHeader
title={t("web.provider.pages.ecommerce.title")}
subtitle={t("web.provider.pages.ecommerce.subtitle")}
        breadcrumbs={[
{ label: t("web.provider.common.breadcrumbHome"), href: "/provider/dashboard" },
{ label: t("web.provider.pages.ecommerce.title") },
        ]}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between p-6 rounded-xl border border-gray-200",
                "bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <span className="font-semibold text-gray-900">{item.label}</span>
                  <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
