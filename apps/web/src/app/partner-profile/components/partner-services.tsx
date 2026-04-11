"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Info, Clock, ChevronDown, Layers } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import ServiceDetailModal from "./service-detail-modal";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PartnerProfileServiceCategoryInitial } from "@/types/partner-profile-services";

type PublicServiceVariant = {
  id: string;
  title: string;
  variant_name: string;
  description?: string | null;
  price: number;
  duration_minutes: number;
  currency: string;
};

type PublicService = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  duration_minutes: number;
  currency: string;
  supports_at_home: boolean;
  supports_at_salon: boolean;
  has_variants: boolean;
  variants: PublicServiceVariant[];
};

type ServiceCategory = {
  id: string;
  name: string;
  services: PublicService[];
};

function formatMoney(amount: number, currency: string) {
  const code = currency && currency.trim().length === 3 ? currency.trim() : "ZAR";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

function variantLabel(v: PublicServiceVariant) {
  return v.variant_name?.trim() || v.title;
}

function normalizeServiceCategories(
  cats: PartnerProfileServiceCategoryInitial[],
): ServiceCategory[] {
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    services: (c.services || []).map((s) => ({
      ...(s as PublicService),
      variants: Array.isArray((s as PublicService).variants) ? (s as PublicService).variants : [],
    })),
  }));
}

function buildVariantMaps(normalized: ServiceCategory[]) {
  const initialVariant: Record<string, string> = {};
  const variantSectionOpen: Record<string, boolean> = {};
  for (const cat of normalized) {
    for (const s of cat.services) {
      if (s.has_variants && s.variants.length > 0) {
        initialVariant[s.id] = s.variants[0].id;
      }
      if (s.variants.length > 0) {
        variantSectionOpen[s.id] = false;
      }
    }
  }
  return { initialVariant, variantSectionOpen };
}

interface PartnerServicesProps {
  slug?: string;
  id?: string;
  partnerId?: string;
  /** From RSC: skip client waterfall when present (null = server miss, fetch client) */
  initialServiceCategories?: PartnerProfileServiceCategoryInitial[] | null;
}

const PartnerServices: React.FC<PartnerServicesProps> = ({
  slug,
  id,
  partnerId,
  initialServiceCategories,
}) => {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState(0);
  const skipClientServicesFetch = Array.isArray(initialServiceCategories);
  const normalizedFromServer = skipClientServicesFetch
    ? normalizeServiceCategories(initialServiceCategories as PartnerProfileServiceCategoryInitial[])
    : null;
  const variantMaps = normalizedFromServer ? buildVariantMaps(normalizedFromServer) : null;

  const [categories, setCategories] = useState<ServiceCategory[]>(() => normalizedFromServer ?? []);
  const [isLoading, setIsLoading] = useState(
    () => normalizedFromServer === null && Boolean(slug || partnerId || id),
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<PublicService | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [openVariants, setOpenVariants] = useState<Record<string, boolean>>(
    () => variantMaps?.variantSectionOpen ?? {},
  );
  const [selectedVariantId, setSelectedVariantId] = useState<Record<string, string>>(
    () => variantMaps?.initialVariant ?? {},
  );

  const providerSlug = slug || partnerId || id;
  const pageParams = useSearchParams();
  const campaignId = pageParams.get("campaign_id");

  useEffect(() => {
    if (skipClientServicesFetch) return;

    const load = async () => {
      if (!providerSlug) {
        setError("Provider identifier is required");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: {
            categories: Array<{ id: string; name: string; services: PublicService[] }>;
          } | null;
        }>(`/api/public/providers/${encodeURIComponent(providerSlug)}/services`, { timeoutMs: 20000 });

        const cats = response.data?.categories ?? [];
        const normalized: ServiceCategory[] = cats.map((c) => ({
          id: c.id,
          name: c.name,
          services: (c.services || []).map((s) => ({
            ...s,
            variants: Array.isArray(s.variants) ? s.variants : [],
          })),
        }));
        setCategories(normalized);

        const { initialVariant, variantSectionOpen } = buildVariantMaps(normalized);
        setSelectedVariantId(initialVariant);
        setOpenVariants(variantSectionOpen);
      } catch (err) {
        if (err instanceof FetchTimeoutError || err instanceof FetchError) {
          setError(err.message);
        } else {
          console.error("Error loading services:", err);
          setCategories([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [providerSlug, skipClientServicesFetch]);

  const bookHrefForService = useCallback(
    (service: PublicService) => {
      if (!providerSlug) return "#";
      const q = new URLSearchParams();
      q.set("slug", providerSlug);
      if (service.has_variants && service.variants.length > 0) {
        const vid = selectedVariantId[service.id] || service.variants[0].id;
        q.set("service", vid);
      } else {
        q.set("service", service.id);
      }
      if (campaignId) q.set("campaign_id", campaignId);
      return `/booking?${q.toString()}`;
    },
    [providerSlug, selectedVariantId, campaignId]
  );

  const offeringIdForModalBooking = useCallback(
    (service: PublicService) => {
      if (service.has_variants && service.variants.length > 0) {
        return selectedVariantId[service.id] || service.variants[0].id;
      }
      return service.id;
    },
    [selectedVariantId]
  );

  const serviceCategories = useMemo(() => categories, [categories]);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -200 : 200;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <LoadingTimeout loadingMessage="Loading services..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <EmptyState title="Unable to load services" description={error} />
      </div>
    );
  }

  if (serviceCategories.length === 0) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <EmptyState title="No services available" description="This provider hasn't added bookable services yet" />
      </div>
    );
  }

  const currentCategory = serviceCategories[activeCategory];

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-6 md:py-8">
      <h2 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6">Services</h2>

      <div className="relative mb-6 md:mb-8">
        <div className="flex items-center">
          <div
            ref={scrollRef}
            className="flex space-x-2 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 md:mx-0 md:px-10"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {serviceCategories.map((category, index) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategory(index)}
                className={`py-2.5 px-5 rounded-full text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 border ${
                  index === activeCategory
                    ? "bg-[#FF0077] text-white border-[#FF0077] shadow-md shadow-pink-500/20"
                    : "bg-white text-gray-800 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => scroll("left")}
            className="absolute left-0 bg-white p-1 rounded-full shadow-md hidden md:block"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            className="absolute right-0 bg-white p-1 rounded-full shadow-md hidden md:block"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-100 bg-gradient-to-b from-gray-50/80 to-white p-4 md:p-6 space-y-5 md:space-y-6">
        {currentCategory?.services.map((service) => {
          const hasVariants = (service.variants?.length ?? 0) > 0;
          const prices = hasVariants ? service.variants.map((v) => Number(v.price)) : [Number(service.price)];
          const minP = Math.min(...prices);
          const maxP = Math.max(...prices);
          const currency = hasVariants ? service.variants[0]?.currency || service.currency : service.currency;
          const priceLabel =
            hasVariants && minP !== maxP
              ? `${formatMoney(minP, currency)} – ${formatMoney(maxP, currency)}`
              : formatMoney(minP, currency);
          const chosenId = hasVariants ? selectedVariantId[service.id] || service.variants[0]?.id : service.id;
          const chosen = hasVariants ? service.variants.find((v) => v.id === chosenId) : null;

          const goBook = () => {
            if (!providerSlug) return;
            router.push(bookHrefForService(service));
          };

          const variantSectionExpanded = openVariants[service.id] ?? false;

          return (
            <div
              key={service.id}
              onClick={goBook}
              className="rounded-2xl border border-gray-200/90 bg-white shadow-sm hover:shadow-md hover:border-gray-300/90 transition-all overflow-hidden cursor-pointer"
            >
              <div className="p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-base md:text-lg font-semibold text-gray-900">{service.title}</h3>
                      {hasVariants && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-800 text-xs font-semibold px-3 py-1 border border-violet-100">
                          <Layers className="h-3.5 w-3.5" />
                          {service.variants.length} options
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm">
                          {chosen ? `${chosen.duration_minutes} min` : `${service.duration_minutes} min`}
                        </span>
                      </div>
                      <span className="text-base md:text-lg font-bold text-gray-900">
                        {hasVariants ? <>From {priceLabel}</> : priceLabel}
                      </span>
                    </div>
                    {service.description && (
                      <p className="text-gray-600 text-sm line-clamp-2">{service.description}</p>
                    )}
                    {hasVariants && chosen && variantSectionExpanded && (
                      <p className="mt-2 text-xs text-gray-500">
                        Selected:{" "}
                        <span className="font-medium text-gray-800">{variantLabel(chosen)}</span>
                        {" · "}
                        {formatMoney(Number(chosen.price), chosen.currency)}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 md:flex-col md:gap-2 md:min-w-[160px] shrink-0" onClick={(e) => e.stopPropagation()}>
                    {service.description && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedService(service);
                          setIsModalOpen(true);
                        }}
                        className="px-4 py-2.5 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors text-sm font-semibold flex items-center justify-center gap-2 min-h-[44px] bg-white"
                      >
                        <Info className="w-4 h-4" />
                        <span>Details</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        goBook();
                      }}
                      className="flex-1 md:w-full px-6 py-2.5 bg-[#FF0077] text-white rounded-full hover:bg-[#e6006c] transition-colors text-sm font-semibold shadow-sm shadow-pink-500/25 items-center justify-center min-h-[44px] flex"
                    >
                      Book
                    </button>
                  </div>
                </div>

                {hasVariants && (
                  <div className="mt-5 border-t border-gray-100 pt-4" onClick={(e) => e.stopPropagation()}>
                  <Collapsible
                    open={variantSectionExpanded}
                    onOpenChange={(open) => setOpenVariants((prev) => ({ ...prev, [service.id]: open }))}
                  >
                    <CollapsibleTrigger
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-all",
                        variantSectionExpanded
                          ? "border-[#FF0077] bg-pink-50 text-[#FF0077]"
                          : "border-gray-200 bg-gray-50 text-gray-900 hover:border-[#FF0077]/40 hover:bg-pink-50/40"
                      )}
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <Layers className="h-4 w-4 shrink-0" />
                        <span>
                          {variantSectionExpanded ? "Hide options" : `Choose from ${service.variants.length} option${service.variants.length !== 1 ? "s" : ""}`}
                        </span>
                        {!variantSectionExpanded && chosen && (
                          <span className="text-xs font-medium text-gray-500 truncate max-w-[160px]">
                            · {variantLabel(chosen)}
                          </span>
                        )}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0 transition-transform duration-200",
                          variantSectionExpanded && "rotate-180"
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 space-y-3 overflow-hidden data-[state=closed]:hidden">
                      <p className="text-xs text-gray-500">
                        Pick the option that matches what you need — your booking will use this exact service.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {service.variants.map((v) => {
                          const selected = chosenId === v.id;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedVariantId((prev) => ({ ...prev, [service.id]: v.id }));
                              }}
                              className={cn(
                                "rounded-full border-2 px-4 py-2.5 text-left transition-all text-sm max-w-full",
                                selected
                                  ? "border-[#FF0077] bg-pink-50 text-gray-900 ring-2 ring-pink-200/60"
                                  : "border-gray-200 bg-white hover:border-gray-300 text-gray-800"
                              )}
                            >
                              <div className="font-semibold">{variantLabel(v)}</div>
                              {v.description && (
                                <p className="mt-1 text-xs text-gray-600 line-clamp-2">{v.description}</p>
                              )}
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {v.duration_minutes} min
                                </span>
                                <span className="font-semibold text-gray-900">
                                  {formatMoney(Number(v.price), v.currency)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            goBook();
                          }}
                          className="rounded-full bg-[#FF0077] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#e6006c] inline-flex items-center justify-center min-h-[44px] shadow-sm shadow-pink-500/25"
                        >
                          Book selected option
                        </button>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="text-gray-600 hover:text-gray-900 underline text-sm"
        >
          View all services
        </button>
      </div>

      {selectedService && providerSlug && (
        <ServiceDetailModal
          offeringIdForBooking={offeringIdForModalBooking(selectedService)}
          service={{
            id: selectedService.id,
            title: selectedService.title,
            description: selectedService.description,
            duration: `${selectedService.duration_minutes} min`,
            price: formatMoney(Number(selectedService.price), selectedService.currency),
            category: currentCategory?.name,
            supports_at_home: selectedService.supports_at_home,
            supports_at_salon: selectedService.supports_at_salon,
            variants: selectedService.has_variants
              ? selectedService.variants.map((v) => ({
                  id: v.id,
                  label: variantLabel(v),
                  description: v.description,
                  duration_minutes: v.duration_minutes,
                  priceFormatted: formatMoney(Number(v.price), v.currency),
                }))
              : undefined,
          }}
          providerSlug={providerSlug}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedService(null);
          }}
          onBook={() => {
            setIsModalOpen(false);
            window.location.href = bookHrefForService(selectedService);
          }}
        />
      )}
    </div>
  );
};

export default PartnerServices;
