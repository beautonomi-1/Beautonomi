"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ServiceItem, TeamMember } from "@/lib/provider-portal/types";
import type { AppointmentService } from "@/components/appointments/types";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { BookingSectionCard, BookingSectionLabel, BookingActionButton } from "../ui";

interface CreateServicesSectionProps {
  catalog: ServiceItem[];
  services: AppointmentService[];
  teamMembers?: TeamMember[];
  defaultStaffId?: string;
  onChange: (next: AppointmentService[]) => void;
}

function newLineId() {
  return `service-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveCatalogEntry(catalog: ServiceItem[], serviceId: string): ServiceItem | undefined {
  for (const item of catalog) {
    if (item.id === serviceId) return item;
    const variant = item.variants?.find((v) => v.id === serviceId);
    if (variant) return variant;
  }
  return catalog.find((s) => s.id === serviceId);
}

export function CreateServicesSection({
  catalog,
  services,
  teamMembers = [],
  defaultStaffId,
  onChange,
}: CreateServicesSectionProps) {
  const { format: formatMoney } = useProviderMoneyFormat();
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customDuration, setCustomDuration] = useState("60");

  const addCustomService = () => {
    const name = customName.trim();
    const price = Number(customPrice);
    const duration = Number(customDuration);
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    const customId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    onChange([
      ...services,
      {
        id: newLineId(),
        serviceId: customId,
        serviceName: name,
        duration: Math.round(duration),
        price,
        staffId: defaultStaffId,
        addons: [],
      },
    ]);
    setCustomName("");
    setCustomPrice("");
    setCustomDuration("60");
    setCustomOpen(false);
  };

  const addService = (catalogId: string, variantId?: string) => {
    const parent = catalog.find((s) => s.id === catalogId);
    if (!parent) return;
    const variant = variantId ? parent.variants?.find((v) => v.id === variantId) : undefined;
    const target = variant ?? parent;
    onChange([
      ...services,
      {
        id: newLineId(),
        serviceId: target.id,
        serviceName: variant?.variant_name ?? variant?.name ?? parent.name,
        duration: target.duration_minutes,
        price: target.price,
        staffId: defaultStaffId,
        variantId: variant?.id,
        variantName: variant?.variant_name ?? undefined,
        addons: [],
      },
    ]);
  };

  const updateStaff = (lineId: string, staffId: string) => {
    onChange(services.map((s) => (s.id === lineId ? { ...s, staffId } : s)));
  };

  const removeService = (lineId: string) => {
    onChange(services.filter((s) => s.id !== lineId));
  };

  const flatOptions = catalog.flatMap((svc) => {
    if (svc.variants?.length) {
      return svc.variants.map((v) => ({
        key: `${svc.id}:${v.id}`,
        catalogId: svc.id,
        variantId: v.id,
        label: `${svc.name} · ${v.variant_name ?? v.name}`,
        price: v.price,
        duration: v.duration_minutes,
      }));
    }
    return [
      {
        key: svc.id,
        catalogId: svc.id,
        variantId: undefined as string | undefined,
        label: svc.name,
        price: svc.price,
        duration: svc.duration_minutes,
      },
    ];
  });

  return (
    <BookingSectionCard>
      <BookingSectionLabel className="mb-2">Services</BookingSectionLabel>
      {services.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {services.map((line) => {
            const meta = resolveCatalogEntry(catalog, line.serviceId);
            return (
              <li
                key={line.id}
                className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{line.serviceName}</p>
                  <p className="text-xs text-gray-500">
                    {line.duration} min · {formatMoney(line.price)}
                    {meta?.variants?.length && !line.variantId ? " · pick variant below" : ""}
                  </p>
                  {teamMembers.length > 0 ? (
                    <Select
                      value={line.staffId ?? defaultStaffId ?? ""}
                      onValueChange={(v) => updateStaff(line.id, v)}
                    >
                      <SelectTrigger className="mt-2 h-9 rounded-lg text-xs">
                        <SelectValue placeholder="Assign staff" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="p-2 text-red-600 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
                  onClick={() => removeService(line.id)}
                  aria-label="Remove service"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-gray-500 mb-3">Add at least one service.</p>
      )}

      <Select
        onValueChange={(key) => {
          const opt = flatOptions.find((o) => o.key === key);
          if (opt) addService(opt.catalogId, opt.variantId);
        }}
      >
        <SelectTrigger className="rounded-xl min-h-[44px]">
          <SelectValue placeholder="Add service" />
        </SelectTrigger>
        <SelectContent>
          {flatOptions.map((opt) => (
            <SelectItem key={opt.key} value={opt.key}>
              {opt.label} · {opt.duration} min · {formatMoney(opt.price)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {services.length === 0 ? (
        <BookingActionButton
          type="button"
          variant="outline"
          className="mt-2"
          onClick={() => {
            const first = flatOptions[0];
            if (first) addService(first.catalogId, first.variantId);
          }}
          disabled={flatOptions.length === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add first service
        </BookingActionButton>
      ) : null}

      <BookingActionButton
        type="button"
        variant="outline"
        className="mt-2"
        onClick={() => setCustomOpen((v) => !v)}
      >
        <Plus className="mr-2 h-4 w-4" />
        {customOpen ? "Hide custom line" : "Add custom line"}
      </BookingActionButton>

      {customOpen ? (
        <div className="mt-3 space-y-2 rounded-xl border p-3">
          <Input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Service name"
            className="rounded-xl min-h-[44px]"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              placeholder="Price"
              className="rounded-xl min-h-[44px]"
            />
            <Input
              type="number"
              min={1}
              step="1"
              value={customDuration}
              onChange={(e) => setCustomDuration(e.target.value)}
              placeholder="Minutes"
              className="rounded-xl min-h-[44px]"
            />
          </div>
          <BookingActionButton
            type="button"
            onClick={addCustomService}
            disabled={!customName.trim()}
          >
            Add custom service
          </BookingActionButton>
        </div>
      ) : null}
    </BookingSectionCard>
  );
}
