"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Package, Search, Sparkles } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@beautonomi/i18n";

type PackageRow = {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  currency: string;
  discount_percentage?: number | null;
  services?: Array<{ id: string; title?: string; duration_minutes?: number }>;
  items?: Array<{ id?: string; type?: string; title?: string }>;
};

interface PartnerPackagesProps {
  slug?: string;
}

const PACKAGE_PAGE_SIZE = 12;
const MANY_PACKAGES = 8;

export default function PartnerPackages({ slug }: PartnerPackagesProps) {
  const { t } = useTranslation();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [packageSearch, setPackageSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PACKAGE_PAGE_SIZE);

  useEffect(() => {
    if (!slug) {
      setError("Provider identifier is required");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetcher.get<{ data?: PackageRow[] } | PackageRow[]>(
          `/api/public/providers/${encodeURIComponent(slug)}/packages`,
          { timeoutMs: 15000 }
        );
        if (cancelled) return;
        const raw = (res as { data?: PackageRow[] })?.data ?? res;
        const list = Array.isArray(raw) ? raw : [];
        setPackages(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof FetchTimeoutError) {
          setError("Request timed out. Please try again.");
        } else if (err instanceof FetchError) {
          setError(err.message || "Failed to load packages");
        } else {
          setError("Failed to load packages");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const filteredPackages = useMemo(() => {
    const q = packageSearch.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(q) ||
        (pkg.description && pkg.description.toLowerCase().includes(q)),
    );
  }, [packages, packageSearch]);

  const visiblePackages = useMemo(
    () => filteredPackages.slice(0, visibleCount),
    [filteredPackages, visibleCount],
  );

  const hasMore = visibleCount < filteredPackages.length;
  const showSearch = packages.length >= MANY_PACKAGES || filteredPackages.length >= MANY_PACKAGES;

  useEffect(() => {
    setVisibleCount(PACKAGE_PAGE_SIZE);
  }, [packageSearch]);

  if (isLoading) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-12">
        <LoadingTimeout loadingMessage="Loading packages..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8 text-center text-sm text-red-600" role="alert">
        {error}
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <EmptyState
          title="No packages yet"
          description="This provider has not published any service bundles."
          icon={Package}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-6 md:py-8">
      <h2 className="text-xl md:text-2xl font-semibold mb-2 md:mb-3">Packages</h2>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 md:mb-8">
        <Sparkles className="h-4 w-4 text-[#FF0077] shrink-0" />
        <span>Book a bundle at a set price — same flow as choosing services.</span>
      </div>
      {showSearch && (
        <div className="relative max-w-md mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
          <Input
            type="search"
            value={packageSearch}
            onChange={(e) => setPackageSearch(e.target.value)}
            placeholder={t("booking.searchPackagesPlaceholder")}
            className="pl-9 h-10 placeholder:text-gray-400 border border-gray-200 bg-white"
            aria-label={t("booking.searchPackagesPlaceholder")}
          />
        </div>
      )}
      {filteredPackages.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No packages match your search.</p>
      ) : (
        <>
          {visiblePackages.length < filteredPackages.length && (
            <p className="text-xs text-gray-500 mb-3">
              {t("booking.servicesPaginationSummary", { shown: visiblePackages.length, total: filteredPackages.length })}
            </p>
          )}
      <ul className="rounded-3xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-4 md:p-6 space-y-5 md:space-y-6 list-none">
        {visiblePackages.map((pkg) => {
          const svcCount =
            pkg.services?.length ??
            (pkg.items?.filter((i) => (i as { type?: string }).type === "service").length ?? 0);
          const discount = pkg.discount_percentage ?? 0;
          return (
            <li
              key={pkg.id}
              className="rounded-2xl border border-gray-200/90 bg-white p-5 md:p-6 shadow-sm hover:shadow-md hover:border-gray-300/80 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-5 w-5 text-[#FF0077] shrink-0" />
                    <h3 className="font-semibold text-gray-900 text-lg">{pkg.name}</h3>
                  </div>
                  {pkg.description ? (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-3">{pkg.description}</p>
                  ) : null}
                  <p className="text-xs text-gray-500">
                    {svcCount > 0 ? `${svcCount} service${svcCount === 1 ? "" : "s"} included` : "Bundle"}
                    {discount > 0 ? ` · Save ${discount}%` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0">
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(pkg.price, pkg.currency)}
                  </p>
                  <Link
                    href={`/booking?slug=${encodeURIComponent(slug ?? "")}&package=${encodeURIComponent(pkg.id)}`}
                    className="inline-flex items-center justify-center rounded-full bg-[#FF0077] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#e6006c] transition-colors shadow-sm shadow-pink-500/25 min-h-[44px]"
                  >
                    Book this package
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
          {hasMore && (
            <div className="flex justify-center mt-6">
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] px-8"
                onClick={() =>
                  setVisibleCount((c) => Math.min(c + PACKAGE_PAGE_SIZE, filteredPackages.length))
                }
              >
                {t("booking.loadMorePackages")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
