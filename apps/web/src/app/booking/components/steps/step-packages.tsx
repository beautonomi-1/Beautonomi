"use client";

import { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Package, Check, Search } from "lucide-react";
import { BookingState } from "../booking-flow";
import { fetcher } from "@/lib/http/fetcher";
import { formatCurrency, cn } from "@/lib/utils";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { useTranslation } from "@beautonomi/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface StepPackagesProps {
  bookingState: BookingState;
  updateBookingState: (updates: Partial<BookingState>) => void;
  onNext: () => void;
  providerSlug: string;
}

interface ServicePackage {
  id: string;
  title: string;
  description?: string;
  price?: number;
  discount_percentage?: number;
  items?: Array<{ id: string; type?: string; title?: string }>;
  services: Array<{
    id: string;
    title: string;
  }>;
}

const PACKAGE_PAGE_SIZE = 16;
const MANY_PACKAGES = 8;

export default function StepPackages({
  bookingState,
  updateBookingState,
  onNext,
  providerSlug,
}: StepPackagesProps) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PACKAGE_PAGE_SIZE);
  const [scrollFocusPackageId, setScrollFocusPackageId] = useState<string | null>(null);
  const packageCardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const lastScrolledIdRef = useRef<string | null>(null);
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const pinnedPackageIdFromUrl = useMemo(
    () => (searchParams.get("package") || searchParams.get("package_id") || "").trim(),
    [searchParams],
  );

  const orderedPackages = useMemo(() => {
    if (!pinnedPackageIdFromUrl || packages.length <= 1) return packages;
    const idx = packages.findIndex((p) => p.id === pinnedPackageIdFromUrl);
    if (idx <= 0) return packages;
    const next = [...packages];
    const [pick] = next.splice(idx, 1);
    return [pick, ...next];
  }, [packages, pinnedPackageIdFromUrl]);

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orderedPackages;
    return orderedPackages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        Boolean(p.description?.toLowerCase().includes(q)),
    );
  }, [orderedPackages, searchQuery]);

  const pagedPackages = useMemo(
    () => searchFiltered.slice(0, visibleCount),
    [searchFiltered, visibleCount],
  );

  const hasMore = visibleCount < searchFiltered.length;
  const showSearch = packages.length >= MANY_PACKAGES;

  useEffect(() => {
    setVisibleCount(PACKAGE_PAGE_SIZE);
  }, [searchQuery]);

  useLayoutEffect(() => {
    if (!pinnedPackageIdFromUrl || packages.length === 0) return;
    const idx = searchFiltered.findIndex((p) => p.id === pinnedPackageIdFromUrl);
    if (idx >= visibleCount) {
      setVisibleCount((prev) => Math.min(searchFiltered.length, Math.max(prev, idx + 4)));
    }
  }, [pinnedPackageIdFromUrl, packages.length, searchFiltered, visibleCount]);

  useLayoutEffect(() => {
    if (!scrollFocusPackageId) return;
    const idx = searchFiltered.findIndex((p) => p.id === scrollFocusPackageId);
    if (idx >= visibleCount) {
      setVisibleCount((prev) => Math.min(searchFiltered.length, Math.max(prev, idx + 4)));
      return;
    }
    const el = packageCardRefs.current.get(scrollFocusPackageId);
    if (!el) return;
    if (lastScrolledIdRef.current === scrollFocusPackageId) return;
    lastScrolledIdRef.current = scrollFocusPackageId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => {
      setScrollFocusPackageId(null);
      lastScrolledIdRef.current = null;
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [scrollFocusPackageId, searchFiltered, visibleCount, pagedPackages.length]);

  const requestScrollToPackage = useCallback((id: string | null) => {
    if (id) {
      lastScrolledIdRef.current = null;
      setScrollFocusPackageId(id);
    }
  }, []);

  useEffect(() => {
    if (!pinnedPackageIdFromUrl || packages.length === 0) return;
    if (packages.some((p) => p.id === pinnedPackageIdFromUrl)) {
      requestScrollToPackage(pinnedPackageIdFromUrl);
    }
  }, [pinnedPackageIdFromUrl, packages, requestScrollToPackage]);

  useEffect(() => {
    loadPackages();
  }, [providerSlug]);

  const loadPackages = async () => {
    if (!providerSlug) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      let response: { data: ServicePackage[] };
      try {
        response = await fetcher.get<{ data: ServicePackage[] }>(
          `/api/public/providers/${encodeURIComponent(providerSlug)}/packages`,
        );
      } catch {
        response = await fetcher.get<{ data: ServicePackage[] }>(
          `/api/public/offerings?provider_slug=${encodeURIComponent(providerSlug)}&type=package`,
        );
      }
      setPackages(response.data || []);
    } catch {
      console.log("No packages available or endpoint not found");
      setPackages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePackageSelect = (pkg: ServicePackage) => {
    if (bookingState.selectedPackage?.id === pkg.id) {
      updateBookingState({ selectedPackage: undefined });
    } else {
      const servicesTotal = bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0);
      const discount = pkg.price
        ? servicesTotal - pkg.price
        : pkg.discount_percentage
          ? (servicesTotal * pkg.discount_percentage) / 100
          : 0;

      updateBookingState({
        selectedPackage: {
          id: pkg.id,
          title: pkg.title,
          price: pkg.price || servicesTotal - discount,
          discount,
        },
      });
    }
  };

  const handleSkip = () => {
    updateBookingState({ selectedPackage: undefined });
    onNext();
  };

  useEffect(() => {
    if (!isLoading && packages.length === 0) {
      const timer = setTimeout(() => {
        onNextRef.current();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, packages.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading packages...</div>
      </div>
    );
  }

  if (packages.length === 0) {
    return null;
  }

  const currency = bookingState.selectedServices[0]?.currency || tenantCurrency;
  const servicesTotal = bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0);

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Select Package</h2>
        <p className="text-gray-600">Choose a package to save on your selected services</p>
      </div>

      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("booking.searchPackagesPlaceholder")}
            className="pl-9 h-10 placeholder:text-gray-400 border border-gray-200 bg-white"
            autoComplete="off"
            aria-label={t("booking.searchPackagesPlaceholder")}
          />
        </div>
      )}

      {searchFiltered.length > 0 && pagedPackages.length < searchFiltered.length && (
        <p className="text-xs text-gray-500">
          {t("booking.servicesPaginationSummary", {
            shown: pagedPackages.length,
            total: searchFiltered.length,
          })}
        </p>
      )}

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleSkip}
        className={`w-full p-4 rounded-xl border-2 text-left transition-all touch-target ${
          !bookingState.selectedPackage ? "border-primary bg-pink-50" : "border-gray-200 bg-white hover:border-gray-300"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">No Package</h3>
            <p className="text-sm text-gray-600 mt-1">Book services individually</p>
          </div>
          {!bookingState.selectedPackage && <Check className="w-6 h-6 text-primary" />}
        </div>
      </motion.button>

      <div className="space-y-3">
        {pagedPackages.map((pkg) => {
          const isSelected = bookingState.selectedPackage?.id === pkg.id;
          const discount = pkg.price
            ? servicesTotal - pkg.price
            : pkg.discount_percentage
              ? (servicesTotal * pkg.discount_percentage) / 100
              : 0;
          const packagePrice = pkg.price || servicesTotal - discount;
          return (
            <motion.button
              key={pkg.id}
              ref={(el) => {
                if (el) packageCardRefs.current.set(pkg.id, el);
                else packageCardRefs.current.delete(pkg.id);
              }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handlePackageSelect(pkg)}
              className={cn(
                "w-full p-4 rounded-xl border-2 text-left transition-all touch-target",
                isSelected ? "border-primary bg-pink-50" : "border-gray-200 bg-white hover:border-gray-300",
                scrollFocusPackageId === pkg.id && "ring-2 ring-primary ring-offset-2 ring-offset-white",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-gray-900">{pkg.title}</h3>
                  </div>
                  {pkg.description && <p className="text-sm text-gray-600 mb-2">{pkg.description}</p>}
                  <div className="text-sm text-gray-600">
                    {pkg.items && pkg.items.length > 0 ? (
                      <div>
                        <p className="mb-1">
                          Includes {pkg.items.filter((item: any) => item.type === "service").length} service(s)
                          {pkg.items.filter((item: any) => item.type === "product").length > 0 && (
                            <> and {pkg.items.filter((item: any) => item.type === "product").length} product(s)</>
                          )}
                        </p>
                        <ul className="text-xs text-gray-500 mt-1 space-y-0.5">
                          {pkg.items.slice(0, 3).map((item: any, idx: number) => (
                            <li key={idx}>
                              • {item.title} {item.quantity > 1 && `(x${item.quantity})`}
                            </li>
                          ))}
                          {pkg.items.length > 3 && <li>... and {pkg.items.length - 3} more</li>}
                        </ul>
                      </div>
                    ) : (
                      <p>Includes {pkg.services?.length || 0} service(s)</p>
                    )}
                    {discount > 0 && (
                      <p className="text-green-600 font-medium mt-1">Save {formatCurrency(discount, currency)}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(packagePrice, currency)}</p>
                  {pkg.price && servicesTotal > pkg.price && (
                    <p className="text-sm text-gray-500 line-through">{formatCurrency(servicesTotal, currency)}</p>
                  )}
                  {isSelected && <Check className="w-6 h-6 text-primary mt-2" />}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {hasMore && (
        <Button
          type="button"
          variant="outline"
          className="w-full max-w-sm touch-target mx-auto block"
          onClick={() => setVisibleCount((c) => Math.min(c + PACKAGE_PAGE_SIZE, searchFiltered.length))}
        >
          {t("booking.loadMorePackages")}
        </Button>
      )}

      {searchFiltered.length === 0 && (
        <p className="text-center py-8 text-sm text-gray-500">{t("common.noResults")}</p>
      )}
    </div>
  );
}
