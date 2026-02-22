"use client";

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

interface PackageItem {
  id: string;
  offering_id?: string | null;
  product_id?: string | null;
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
      const response = await fetcher.get<{ data: { packages: ServicePackage[] } }>(
        "/api/provider/packages",
        { timeoutMs: 30000 } // 30 second timeout
      );
      setPackages(response.data.packages || []);
    } catch (err) {
      setError(err instanceof FetchError ? err.message : "Failed to load packages");
      console.error("Error loading packages:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (packageId: string) => {
    if (!confirm("Are you sure you want to delete this package?")) {
      return;
    }

    try {
      await fetcher.delete(`/api/provider/packages/${packageId}`);
      toast.success("Package deleted successfully");
      loadPackages();
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to delete package");
      console.error("Error deleting package:", err);
    }
  };

  const formatCurrency = (amount: number, currency: string = "ZAR") => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Packages" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading packages..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Packages" },
      ]}
      showCloseButton={false}
    >
      <div className="space-y-6">
        <PageHeader
          title="Service Packages"
          subtitle="Create and manage service packages for your clients"
          actions={
            <Link href="/provider/packages/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Package
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
            title="No packages created yet"
            description="Create service packages to offer bundled services at discounted rates"
            action={{
              label: "Create Your First Package",
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
                      <Badge variant="secondary">Inactive</Badge>
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
                        {pkg.discount_percentage}% discount
                      </p>
                    )}
                  </div>

                  <div className="mb-4">
                    <p className="text-sm font-semibold mb-2">Items Included:</p>
                    <ul className="space-y-1">
                      {pkg.items.map((item) => {
                        const itemName = item.offering 
                          ? `${item.offering.title} (Service)`
                          : item.product 
                          ? `${item.product.name} (Product)`
                          : item.offering_id
                          ? "Service (deleted)"
                          : item.product_id
                          ? "Product (deleted)"
                          : "Unknown item";
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
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
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
