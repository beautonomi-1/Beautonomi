"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

type ServiceWithResources = {
  id: string;
  name: string;
  resource_requirements?: Array<{ resource_name?: string; quantity?: number }>;
};

interface ResourceRequirementsPreviewProps {
  serviceIds: string[];
}

export function ResourceRequirementsPreview({ serviceIds }: ResourceRequirementsPreviewProps) {
  const [services, setServices] = useState<ServiceWithResources[]>([]);

  const key = useMemo(() => serviceIds.filter(Boolean).sort().join(","), [serviceIds]);

  useEffect(() => {
    if (!key) {
      setServices([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetcher.get<{ data?: ServiceWithResources[] }>(
          "/api/provider/services?include_offering_resources=true",
        );
        if (cancelled) return;
        const all = res?.data ?? [];
        setServices(all.filter((s) => serviceIds.includes(s.id)));
      } catch {
        if (!cancelled) setServices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, serviceIds]);

  const requirements = services.flatMap((s) =>
    (s.resource_requirements ?? []).map((r) => ({
      serviceName: s.name,
      resourceName: r.resource_name ?? "Resource",
      quantity: r.quantity ?? 1,
    })),
  );

  if (requirements.length === 0) return null;

  return (
    <BookingSectionCard className="border-amber-200 bg-amber-50/50">
      <BookingSectionLabel className="mb-2 flex items-center gap-2 text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        Resource requirements
      </BookingSectionLabel>
      <ul className="space-y-1 text-sm text-amber-900">
        {requirements.map((r, i) => (
          <li key={`${r.serviceName}-${r.resourceName}-${i}`}>
            {r.serviceName}: {r.resourceName}
            {r.quantity > 1 ? ` ×${r.quantity}` : ""}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-800 mt-2">Assign resources after booking if needed.</p>
    </BookingSectionCard>
  );
}
