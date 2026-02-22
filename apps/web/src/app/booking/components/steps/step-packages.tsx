"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Package, Check } from "lucide-react";
import { BookingState } from "../booking-flow";
import { fetcher } from "@/lib/http/fetcher";
import { formatCurrency } from "@/lib/utils";

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

export default function StepPackages({
  bookingState,
  updateBookingState,
  onNext,
  providerSlug,
}: StepPackagesProps) {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
      // Try the dedicated packages endpoint first; fall back to offerings with type=package
      let response: { data: ServicePackage[] };
      try {
        response = await fetcher.get<{ data: ServicePackage[] }>(
          `/api/public/providers/${encodeURIComponent(providerSlug)}/packages`
        );
      } catch {
        // Fallback: use the offerings endpoint with a package type filter
        response = await fetcher.get<{ data: ServicePackage[] }>(
          `/api/public/offerings?provider_slug=${encodeURIComponent(providerSlug)}&type=package`
        );
      }
      setPackages(response.data || []);
    } catch {
      // If endpoint doesn't exist or no packages, that's fine - skip this step
      console.log("No packages available or endpoint not found");
      setPackages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePackageSelect = (pkg: ServicePackage) => {
    if (bookingState.selectedPackage?.id === pkg.id) {
      // Deselect
      updateBookingState({ selectedPackage: undefined });
    } else {
      // Calculate discount
      const servicesTotal = bookingState.selectedServices.reduce(
        (sum, s) => sum + s.price,
        0
      );
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

  // If no packages available, skip this step
  // This useEffect must be called before any conditional returns to follow Rules of Hooks
  useEffect(() => {
    if (!isLoading && packages.length === 0) {
      // Auto-advance to next step after a brief delay
      const timer = setTimeout(() => {
        onNext();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, packages.length, onNext]);

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

  const currency = bookingState.selectedServices[0]?.currency || "ZAR";
  const servicesTotal = bookingState.selectedServices.reduce(
    (sum, s) => sum + s.price,
    0
  );

  return (
    <div className="px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">
          Select Package
        </h2>
        <p className="text-gray-600">
          Choose a package to save on your selected services
        </p>
      </div>

      {/* No Package Option */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleSkip}
        className={`w-full p-4 rounded-xl border-2 text-left transition-all touch-target ${
          !bookingState.selectedPackage
            ? "border-[#FF0077] bg-pink-50"
            : "border-gray-200 bg-white hover:border-gray-300"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">No Package</h3>
            <p className="text-sm text-gray-600 mt-1">
              Book services individually
            </p>
          </div>
          {!bookingState.selectedPackage && (
            <Check className="w-6 h-6 text-[#FF0077]" />
          )}
        </div>
      </motion.button>

      {/* Package Options */}
      <div className="space-y-3">
        {packages.map((pkg) => {
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handlePackageSelect(pkg)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all touch-target ${
                isSelected
                  ? "border-[#FF0077] bg-pink-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-5 h-5 text-[#FF0077]" />
                    <h3 className="font-semibold text-gray-900">{pkg.title}</h3>
                  </div>
                  {pkg.description && (
                    <p className="text-sm text-gray-600 mb-2">{pkg.description}</p>
                  )}
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
                            <li key={idx}>• {item.title} {item.quantity > 1 && `(x${item.quantity})`}</li>
                          ))}
                          {pkg.items.length > 3 && <li>... and {pkg.items.length - 3} more</li>}
                        </ul>
                      </div>
                    ) : (
                      <p>Includes {pkg.services?.length || 0} service(s)</p>
                    )}
                    {discount > 0 && (
                      <p className="text-green-600 font-medium mt-1">
                        Save {formatCurrency(discount, currency)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">
                    {formatCurrency(packagePrice, currency)}
                  </p>
                  {pkg.price && servicesTotal > pkg.price && (
                    <p className="text-sm text-gray-500 line-through">
                      {formatCurrency(servicesTotal, currency)}
                    </p>
                  )}
                  {isSelected && (
                    <Check className="w-6 h-6 text-[#FF0077] mt-2" />
                  )}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
