"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Check, Sparkles, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Addon {
  id: string;
  title: string;
  description?: string;
  price: number;
  duration: number;
  currency: string;
  is_recommended?: boolean;
}

interface ServiceAddonsProps {
  serviceId: string;
  providerSlug: string;
  selectedAddons: Array<{
    id: string;
    title: string;
    price: number;
    duration: number;
  }>;
  onAddonsChange: (addons: Array<{
    id: string;
    title: string;
    price: number;
    duration: number;
  }>) => void;
}

export default function ServiceAddons({
  serviceId,
  providerSlug,
  selectedAddons,
  onAddonsChange,
}: ServiceAddonsProps) {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAddons();
  }, [serviceId, providerSlug]);

  const loadAddons = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/public/providers/${providerSlug}/services/${serviceId}/addons`
      );
      if (response.ok) {
        const data = await response.json();
        setAddons(data.data?.categories?.flatMap((cat: any) => cat.addons) || []);
      }
    } catch (error) {
      console.error("Error loading addons:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAddon = (addon: Addon) => {
    const isSelected = selectedAddons.some((a) => a.id === addon.id);
    
    if (isSelected) {
      onAddonsChange(selectedAddons.filter((a) => a.id !== addon.id));
    } else {
      onAddonsChange([
        ...selectedAddons,
        {
          id: addon.id,
          title: addon.title,
          price: addon.price,
          duration: addon.duration,
        },
      ]);
    }
  };

  if (isLoading || addons.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#FF0077]" />
        <h4 className="text-sm font-semibold text-gray-900">
          Recommended Add-ons
        </h4>
      </div>
      <div className="space-y-2">
        {addons.map((addon) => {
          const isSelected = selectedAddons.some((a) => a.id === addon.id);
          
          return (
            <motion.button
              key={addon.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => toggleAddon(addon)}
              className={`w-full p-3 rounded-lg border-2 text-left transition-all touch-target ${
                isSelected
                  ? "border-[#FF0077] bg-pink-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">
                      {addon.title}
                    </span>
                    {addon.is_recommended && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Sparkles className="w-3 h-3" />
                        Popular
                      </span>
                    )}
                  </div>
                  {addon.description && (
                    <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                      {addon.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      +{addon.duration} min
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900 text-sm">
                    {formatCurrency(addon.price, addon.currency)}
                  </span>
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-[#FF0077] text-white"
                        : "border-2 border-gray-300"
                    }`}
                  >
                    {isSelected ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
