"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AppointmentService, AppointmentProduct } from "@/components/appointments/types";
import type { ServiceItem } from "@/lib/provider-portal/types";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

type PackageRow = {
  id: string;
  name: string;
  price?: number;
  items?: Array<{
    offering_id?: string;
    product_id?: string;
    offering?: { id: string; title?: string; name?: string; duration_minutes?: number; price?: number };
    product?: { id: string; name?: string; retail_price?: number };
  }>;
};

interface PackagePickerSectionProps {
  locationId: string;
  catalogServices: ServiceItem[];
  selectedPackageId: string | null;
  onPackageApplied: (args: {
    packageId: string;
    services: AppointmentService[];
    products: AppointmentProduct[];
  }) => void;
  onClearPackage: () => void;
}

export function PackagePickerSection({
  locationId,
  catalogServices,
  selectedPackageId,
  onPackageApplied,
  onClearPackage,
}: PackagePickerSectionProps) {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const url = locationId
          ? `/api/provider/packages?location_id=${encodeURIComponent(locationId)}`
          : "/api/provider/packages";
        const res = await fetcher.get<{ data?: { packages?: PackageRow[] }; packages?: PackageRow[] }>(
          url,
        );
        const list = res.data?.packages ?? res.packages ?? res.data ?? [];
        if (!cancelled) setPackages(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setPackages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const applyPackage = (pkgId: string) => {
    const pkg = packages.find((p) => p.id === pkgId);
    if (!pkg?.items?.length) return;

    const services: AppointmentService[] = [];
    const products: AppointmentProduct[] = [];

    for (const item of pkg.items) {
      if (item.offering_id || item.offering) {
        const off = item.offering;
        const svcId = item.offering_id || off?.id || "";
        const catalog = catalogServices.find((s) => s.id === svcId);
        services.push({
          id: `pkg-svc-${services.length}`,
          serviceId: svcId,
          serviceName: off?.title || off?.name || catalog?.name || "Service",
          duration: off?.duration_minutes ?? catalog?.duration_minutes ?? 60,
          price: off?.price ?? catalog?.price ?? 0,
        });
      } else if (item.product_id || item.product) {
        const prod = item.product;
        const pid = item.product_id || prod?.id || "";
        const price = Number(prod?.retail_price ?? 0);
        products.push({
          id: `pkg-prod-${products.length}`,
          productId: pid,
          productName: prod?.name || "Product",
          quantity: 1,
          unitPrice: price,
          totalPrice: price,
        });
      }
    }

    if (services.length === 0 && products.length === 0) {
      toast.error("Package has no valid items for this location");
      return;
    }

    onPackageApplied({ packageId: pkg.id, services, products });
    toast.success(`Package "${pkg.name}" added`);
  };

  if (loading) {
    return (
      <BookingSectionCard className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </BookingSectionCard>
    );
  }

  if (packages.length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">Package</BookingSectionLabel>
      <Select
        value={selectedPackageId ?? ""}
        onValueChange={(v) => {
          if (!v) {
            onClearPackage();
            return;
          }
          applyPackage(v);
        }}
      >
        <SelectTrigger className="rounded-xl min-h-[44px]">
          <SelectValue placeholder="Add a package…" />
        </SelectTrigger>
        <SelectContent>
          {selectedPackageId ? (
            <SelectItem value="">Clear package</SelectItem>
          ) : null}
          {packages.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.price != null ? ` · ${Number(p.price).toFixed(2)}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </BookingSectionCard>
  );
}
