"use client";

import { Sparkles, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type {
  BookingData,
  ServiceOption,
  PackageOption,
  ServiceVariant,
  BookingServiceEntry,
} from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_WAITLIST_BG,
  BOOKING_BORDER,
  BOOKING_EDGE,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_CARD,
  BOOKING_RADIUS_BUTTON,
  BOOKING_RADIUS_PILL,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";

const cardStyle = {
  background: "rgba(255,255,255,0.85)",
  backdropFilter: "blur(16px) saturate(180%)",
  WebkitBackdropFilter: "blur(16px) saturate(180%)",
  border: `1px solid ${BOOKING_EDGE}`,
  borderRadius: BOOKING_RADIUS_CARD,
  boxShadow: BOOKING_SHADOW_CARD,
};

interface StepServicesProps {
  data: BookingData;
  offerings: ServiceOption[];
  packages: PackageOption[];
  variantsByServiceId: Record<string, ServiceVariant[]>;
  onSelectPackage: (pkg: PackageOption | null) => void;
  onSelectService: (entries: BookingServiceEntry[]) => void;
  onNext: () => void;
  isAtHome: boolean;
  /** When set, shown as section title (e.g. "Hair Menu") */
  categoryName?: string | null;
}

export function StepServices({
  data,
  offerings,
  packages,
  variantsByServiceId,
  onSelectPackage,
  onSelectService,
  onNext,
  isAtHome,
  categoryName,
}: StepServicesProps) {
  const hasSelection =
    (data.selectedPackage != null && data.selectedServices.length > 0) ||
    (data.selectedPackage == null && data.selectedServices.length > 0);

  const baseServices = offerings.filter(
    (o) => !(o as any).parent_service_id && (o as any).service_type !== "addon"
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="text-left">
        <h2 className="text-2xl font-semibold tracking-tight" style={{ color: BOOKING_TEXT_PRIMARY }}>
          {categoryName ? `${categoryName} Menu` : "What would you like?"}
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: BOOKING_TEXT_SECONDARY }}>
          {categoryName ? "Choose a service from this category" : "Choose a package or a single service"}
        </p>
      </div>

      {packages.length > 0 && (
        <div className="p-5 space-y-4 rounded-3xl" style={cardStyle}>
          <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: BOOKING_TEXT_SECONDARY }}>
            <Sparkles className="h-4 w-4" style={{ color: BOOKING_ACCENT }} />
            Packages
          </h3>
          <div className="space-y-3">
            {packages.map((pkg, i) => {
              const isSelected = data.selectedPackage?.id === pkg.id;
              const discount = pkg.discount_percentage ?? 0;
              const hasSavings = discount > 0;
              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => {
                    onSelectPackage(isSelected ? null : pkg);
                    if (isSelected) onSelectService([]);
                    else {
                      const items = pkg.services ?? pkg.items?.filter((x: any) => x.type === "service") ?? [];
                      const entries: BookingServiceEntry[] = items.map((item: any) => ({
                        offering_id: item.id,
                        title: item.title,
                        duration_minutes: item.duration_minutes ?? 60,
                        price: 0,
                        currency: pkg.currency,
                      }));
                      if (entries.length > 0) {
                        onSelectService(entries);
                      } else {
                        onSelectService([
                          {
                            offering_id: pkg.id as any,
                            title: pkg.name,
                            duration_minutes: 60,
                            price: pkg.price,
                            currency: pkg.currency,
                          },
                        ]);
                      }
                    }
                  }}
                  className={cn(
                    "w-full text-left rounded-2xl border-2 p-4 transition-all touch-manipulation relative overflow-hidden",
                    MIN_TAP,
                    BOOKING_ACTIVE_SCALE
                  )}
                  style={{
                    borderColor: isSelected ? BOOKING_ACCENT : BOOKING_BORDER,
                    backgroundColor: isSelected ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.02)",
                  }}
                >
                  {hasSavings && (
                    <span
                      className="absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full text-white"
                      style={{ backgroundColor: BOOKING_ACCENT }}
                    >
                      Save {discount}%
                    </span>
                  )}
                  <span className="font-semibold block" style={{ color: BOOKING_TEXT_PRIMARY }}>
                    {pkg.name}
                  </span>
                  {pkg.description && (
                    <p className="text-sm mt-1 line-clamp-2" style={{ color: BOOKING_TEXT_SECONDARY }}>
                      {pkg.description}
                    </p>
                  )}
                  <p className="text-sm mt-2" style={{ color: BOOKING_TEXT_SECONDARY }}>
                    {pkg.services?.length ?? pkg.items?.length ?? 0} included ·{" "}
                    <strong style={{ color: BOOKING_ACCENT }}>{formatCurrency(pkg.price, pkg.currency)}</strong>
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-5 space-y-4 rounded-3xl" style={cardStyle}>
        <h3 className="text-sm font-medium text-left" style={{ color: BOOKING_TEXT_SECONDARY }}>
          Services
        </h3>
        <div className="space-y-2">
          {baseServices.map((svc) => {
            const variants = variantsByServiceId[svc.id];
            const hasVariants = variants && variants.length > 0;
            const price =
              isAtHome && svc.at_home_price_adjustment
                ? svc.price + (svc.at_home_price_adjustment ?? 0)
                : svc.price;

            if (hasVariants) {
              return (
                <div
                  key={svc.id}
                  className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: BOOKING_BORDER, backgroundColor: "rgba(0,0,0,0.02)" }}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: BOOKING_EDGE }}>
                    <span className="font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
                      {svc.title}
                    </span>
                  </div>
                  <div className="p-3 flex flex-wrap gap-2">
                    {variants.map((v) => {
                      const isSelected = data.selectedServices.some((e) => e.offering_id === v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            onSelectPackage(null);
                            const entry = {
                              offering_id: v.id,
                              title: v.title,
                              duration_minutes: v.duration,
                              price: v.price,
                              currency: v.currency,
                            };
                            onSelectService(
                              isSelected
                                ? data.selectedServices.filter((e) => e.offering_id !== v.id)
                                : [...data.selectedServices.filter((e) => e.offering_id !== svc.id), entry]
                            );
                          }}
                          className={cn(
                            "rounded-xl px-4 py-2.5 text-sm font-medium transition-all touch-manipulation min-h-[44px]",
                            BOOKING_ACTIVE_SCALE
                          )}
                          style={{
                            borderRadius: BOOKING_RADIUS_PILL,
                            backgroundColor: isSelected ? BOOKING_ACCENT : "rgba(0,0,0,0.06)",
                            color: isSelected ? "#fff" : BOOKING_TEXT_PRIMARY,
                          }}
                        >
                          {v.variant_name ?? v.title} · {formatCurrency(v.price, v.currency)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            }

            const isSelected = data.selectedServices.some((e) => e.offering_id === svc.id);
            return (
              <button
                key={svc.id}
                type="button"
                onClick={() => {
                  onSelectPackage(null);
                  const entry = {
                    offering_id: svc.id,
                    title: svc.title,
                    duration_minutes: svc.duration_minutes,
                    price,
                    currency: svc.currency,
                  };
                  onSelectService(
                    isSelected
                      ? data.selectedServices.filter((e) => e.offering_id !== svc.id)
                      : [...data.selectedServices, entry]
                  );
                }}
                className={cn(
                  "w-full text-left rounded-2xl border-2 px-4 py-3.5 transition-all touch-manipulation flex items-center gap-3",
                  MIN_TAP,
                  BOOKING_ACTIVE_SCALE
                )}
                style={{
                  borderColor: isSelected ? BOOKING_ACCENT : BOOKING_BORDER,
                  backgroundColor: isSelected ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.02)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium block" style={{ color: BOOKING_TEXT_PRIMARY }}>
                    {svc.title}
                  </span>
                  <p className="text-sm mt-0.5 flex items-center gap-1.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {svc.duration_minutes} min
                  </p>
                </div>
                <span className="text-sm font-semibold shrink-0" style={{ color: BOOKING_TEXT_PRIMARY }}>
                  from {formatCurrency(price, svc.currency)}
                </span>
                <ChevronRight className="h-5 w-5 shrink-0" style={{ color: BOOKING_TEXT_SECONDARY }} />
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={!hasSelection}
        className={cn(
          "w-full rounded-2xl h-12 font-semibold text-white touch-manipulation transition-all duration-300 disabled:opacity-50 disabled:active:scale-100",
          MIN_TAP,
          BOOKING_ACTIVE_SCALE
        )}
        style={{
          backgroundColor: BOOKING_ACCENT,
          borderRadius: BOOKING_RADIUS_BUTTON,
          boxShadow: BOOKING_SHADOW_CARD,
        }}
      >
        Continue
      </button>
    </div>
  );
}
