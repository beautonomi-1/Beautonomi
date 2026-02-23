"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type {
  BookingData,
  ServiceOption,
  PackageOption,
  ServiceVariant,
  BookingServiceEntry,
} from "../../types/booking-engine";

const MIN_TAP = "min-h-[44px] min-w-[44px]";

interface StepServicesProps {
  data: BookingData;
  offerings: ServiceOption[];
  packages: PackageOption[];
  variantsByServiceId: Record<string, ServiceVariant[]>;
  onSelectPackage: (pkg: PackageOption | null) => void;
  onSelectService: (entries: BookingServiceEntry[]) => void;
  onNext: () => void;
  isAtHome: boolean;
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
}: StepServicesProps) {
  const hasSelection =
    (data.selectedPackage != null && data.selectedServices.length > 0) ||
    (data.selectedPackage == null && data.selectedServices.length > 0);

  const baseServices = offerings.filter(
    (o) => !(o as any).parent_service_id && (o as any).service_type !== "addon"
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">What would you like?</h2>
        <p className="mt-1 text-sm text-gray-500">Choose a package or a single service</p>
      </div>

      {packages.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "#EC4899" }} />
            Packages
          </h3>
          <div className="space-y-3">
            {packages.map((pkg, i) => {
              const isSelected =
                data.selectedPackage?.id === pkg.id;
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
                    "w-full text-left rounded-3xl border-2 p-4 transition-all touch-manipulation active:scale-[0.99] relative overflow-hidden",
                    isSelected
                      ? "border-[#EC4899] bg-gradient-to-br from-[#EC4899]/15 to-pink-100/30"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                  style={{
                    animationDelay: `${i * 50}ms`,
                  }}
                >
                  {hasSavings && (
                    <span
                      className="absolute top-3 right-3 text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: "#EC4899" }}
                    >
                      Save {discount}%
                    </span>
                  )}
                  <span className="font-semibold text-gray-900 block">{pkg.name}</span>
                  {pkg.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{pkg.description}</p>
                  )}
                  <p className="text-sm text-gray-500 mt-2">
                    {pkg.services?.length ?? pkg.items?.length ?? 0} included ·{" "}
                    {formatCurrency(pkg.price, pkg.currency)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-600">Services</h3>
        <div className="space-y-2">
          {baseServices.map((svc) => {
            const variants = variantsByServiceId[svc.id];
            const hasVariants = variants && variants.length > 0;
            const price = isAtHome && svc.at_home_price_adjustment
              ? svc.price + (svc.at_home_price_adjustment ?? 0)
              : svc.price;

            if (hasVariants) {
              return (
                <div
                  key={svc.id}
                  className="rounded-3xl border-2 border-gray-200 bg-white overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-gray-100">
                    <span className="font-medium text-gray-900">{svc.title}</span>
                  </div>
                  <div className="p-2 flex flex-wrap gap-2">
                    {variants.map((v) => {
                      const isSelected = data.selectedServices.some(
                        (e) => e.offering_id === v.id
                      );
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            onSelectPackage(null);
                            onSelectService([
                              {
                                offering_id: v.id,
                                title: v.title,
                                duration_minutes: v.duration,
                                price: v.price,
                                currency: v.currency,
                              },
                            ]);
                          }}
                          className={cn(
                            "rounded-xl px-4 py-2.5 text-sm font-medium transition-all touch-manipulation active:scale-[0.98]",
                            isSelected
                              ? "bg-[#EC4899] text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          )}
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
                  onSelectService(
                    isSelected
                      ? []
                      : [
                          {
                            offering_id: svc.id,
                            title: svc.title,
                            duration_minutes: svc.duration_minutes,
                            price,
                            currency: svc.currency,
                          },
                        ]
                  );
                }}
                className={cn(
                  "w-full text-left rounded-3xl border-2 px-4 py-3 transition-all touch-manipulation active:scale-[0.99]",
                  isSelected ? "border-[#EC4899] bg-[#EC4899]/10" : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-900">{svc.title}</span>
                  <span className="text-sm font-medium" style={{ color: "#EC4899" }}>
                    {formatCurrency(price, svc.currency)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{svc.duration_minutes} min</p>
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
          "w-full rounded-2xl h-12 font-medium text-white transition-all touch-manipulation active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
          MIN_TAP
        )}
        style={{ backgroundColor: "#EC4899" }}
      >
        Continue
      </button>
    </div>
  );
}
