"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect } from "react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Package } from "lucide-react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { toast } from "sonner";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/ui/empty-state";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useTenantLocaleTag } from "@/hooks/useTenantLocaleTag";
import { unpackPackagesListPayload } from "@/lib/http/unpack-provider-fetch";

interface PackageItem {
  id: string;
  offering_id?: string | null;
  product_id?: string | null;
  product_variant_id?: string | null;
  quantity: number;
  offering?: {
    id: string;
    title: string;
    duration_minutes: number;
    price: number;
  } | null;
  product?: {
    id: string;
    name: string;
    retail_price: number;
    sku?: string | null;
    brand?: string | null;
  } | null;
  product_variant?: {
    id: string;
    option_values?: Record<string, string> | null;
    retail_price?: number | null;
    sku?: string | null;
  } | null;
}

interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  discount_percentage: number | null;
  is_active: boolean;
  items: PackageItem[];
  created_at: string;
}

export default function ProviderPackagesPage() {
  const { t } = useTranslation();
  const locale = useTenantLocaleTag();
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetcher.get<unknown>("/api/provider/packages", { timeoutMs: 30000 });
      const list = unpackPackagesListPayload(response) as ServicePackage[];
      setPackages(list);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : t("web.provider.packagesPage.loadFailed"));
      console.error("Error loading packages:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (packageId: string) => {
    if (!confirm(t("web.provider.packagesPage.deleteConfirm"))) {
      return;
    }

    try {
      await fetcher.delete(`/api/provider/packages/${packageId}`);
      toast.success(t("web.provider.packagesPage.deleted"));
      loadPackages();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.packagesPage.failedToDelete"));
      console.error("Error deleting package:", err);
    }
  };

  const formatCurrency = (amount: number, currency: string = LAST_RESORT_CURRENCY) => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatVariantLabel = (item: PackageItem) => {
    const optionValues = item.product_variant?.option_values;
    return optionValues ? Object.values(optionValues).filter(Boolean).join(" / ") : item.product_variant?.sku ?? "";
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.packages") },
        ]}
      >
<LoadingTimeout loadingMessage={t("web.provider.packagesPage.loading")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.packages") },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.packagesPage.title")}
          subtitle={t("web.provider.packagesPage.subtitle")}
          actions={
            <Link href="/provider/packages/new">
              <Button>
                <Plus className="w-4 h-4 me-2" />
{t("web.provider.packagesPage.createPackage")}
              </Button>
            </Link>
          }
        />

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {packages.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t("web.provider.packagesPage.emptyTitle")}
            description={t("web.provider.packagesPage.emptyDesc")}
            action={{
              label: t("web.provider.packagesPage.createFirst"),
              onClick: () => window.location.href = "/provider/packages/new",
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packages.map((pkg) => (
              <Card key={pkg.id} className={!pkg.is_active ? "opacity-60" : ""}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl">{pkg.name}</CardTitle>
                    {!pkg.is_active && (
<Badge variant="secondary">{t("web.provider.common.inactive")}</Badge>
                    )}
                  </div>
                  {pkg.description && (
                    <p className="text-sm text-gray-600 mt-2">{pkg.description}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <p className="text-2xl font-bold">
                      {formatCurrency(pkg.price, pkg.currency)}
                    </p>
                    {pkg.discount_percentage && (
                      <p className="text-sm text-green-600">
{t("web.provider.packagesPage.percentDiscount", { percent: pkg.discount_percentage })}
                      </p>
                    )}
                  </div>

                  <div className="mb-4">
<p className="text-sm font-semibold mb-2">{t("web.provider.packagesPage.itemsIncluded")}</p>
                    <ul className="space-y-1">
                      {pkg.items.map((item) => {
                        const variantLabel = formatVariantLabel(item);
                        const itemName = item.offering 
                          ? t("web.provider.packagesPage.itemService", { name: item.offering.title })
                          : item.product 
                          ? variantLabel
                            ? t("web.provider.packagesPage.itemProductVariant", { name: item.product.name, variant: variantLabel })
                            : t("web.provider.packagesPage.itemProduct", { name: item.product.name })
                          : item.offering_id
                          ? t("web.provider.packagesPage.serviceDeleted")
                          : item.product_id
                          ? t("web.provider.packagesPage.productDeleted")
                          : t("web.provider.packagesPage.unknownItem");
                        return (
                          <li key={item.id} className="text-sm text-gray-600">
                            • {itemName} {item.quantity > 1 && `(x${item.quantity})`}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    <Link href={`/provider/packages/${pkg.id}/edit`} className="flex-1">
                      <Button variant="outline" className="w-full" size="sm">
                        <Edit className="w-4 h-4 me-1" />
{t("web.provider.common.edit")}
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(pkg.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          }
          </div>
        )}
      </div>
    </SettingsDetailLayout>
  );
}
