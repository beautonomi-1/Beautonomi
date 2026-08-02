"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { providerApi } from "@/lib/provider-portal/api";
import type { AppointmentService } from "@/components/appointments/types";
import { Checkbox } from "@/components/ui/checkbox";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

type AddonRow = { id: string; name: string; price: number; duration_minutes: number };

interface ServiceAddonsSectionProps {
  services: AppointmentService[];
  onChange: (next: AppointmentService[]) => void;
}

function ServiceAddonBlock({
  line,
  onToggle,
}: {
  line: AppointmentService;
  onToggle: (addon: AddonRow) => void;
}) {
  const [addons, setAddons] = useState<AddonRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!line.serviceId || line.serviceId.startsWith("custom-")) {
      setAddons([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void providerApi
      .getServiceAddons(line.serviceId)
      .then((rows) => {
        if (cancelled) return;
        setAddons(
          rows.map((a) => ({
            id: a.id,
            name: a.name,
            price: a.price,
            duration_minutes: a.duration_minutes,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setAddons([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [line.serviceId]);

  if (loading) {
    return (
      <div className="py-1">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (addons.length === 0) return null;

  const selectedIds = new Set((line.addons ?? []).map((a) => a.addonId));

  return (
    <div className="space-y-2 pl-1 border-l-2 border-gray-100 ml-1">
      <p className="text-xs font-medium text-gray-600">{line.serviceName}</p>
      {addons.map((addon) => (
        <label
          key={addon.id}
          className="flex items-center gap-3 min-h-[44px] touch-manipulation cursor-pointer"
        >
          <Checkbox
            checked={selectedIds.has(addon.id)}
            onCheckedChange={() => onToggle(addon)}
          />
          <span className="text-sm text-gray-800 flex-1">
            {addon.name}
            {addon.price > 0 ? ` · ${addon.price.toFixed(2)}` : ""}
            {addon.duration_minutes > 0 ? ` · ${addon.duration_minutes} min` : ""}
          </span>
        </label>
      ))}
    </div>
  );
}

export function ServiceAddonsSection({ services, onChange }: ServiceAddonsSectionProps) {
  const serviceLines = useMemo(
    () => services.filter((s) => s.serviceId && !s.serviceId.startsWith("custom-")),
    [services],
  );

  const toggleAddon = (lineId: string, addon: AddonRow) => {
    onChange(
      services.map((line) => {
        if (line.id !== lineId) return line;
        const current = line.addons ?? [];
        const exists = current.some((a) => a.addonId === addon.id);
        const nextAddons = exists
          ? current.filter((a) => a.addonId !== addon.id)
          : [
              ...current,
              {
                id: `addon-${addon.id}-${lineId}`,
                addonId: addon.id,
                addonName: addon.name,
                price: addon.price,
                duration: addon.duration_minutes,
              },
            ];
        return { ...line, addons: nextAddons };
      }),
    );
  };

  if (serviceLines.length === 0) return null;

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">Add-ons</BookingSectionLabel>
      <div className="space-y-3">
        {serviceLines.map((line) => (
          <ServiceAddonBlock
            key={line.id}
            line={line}
            onToggle={(addon) => toggleAddon(line.id, addon)}
          />
        ))}
      </div>
    </BookingSectionCard>
  );
}
