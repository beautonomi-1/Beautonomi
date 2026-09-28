"use client";

import { useCallback } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { formatLocationOpenLabel } from "@/lib/shop/formatLocationOpenLabel";

export interface PickupStoreLocation {
  id?: string;
  name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  working_hours?: unknown;
}

const PICKUP_I18N = "customer.mobile.tabs.shop.pickupStore";
const HOURS_I18N = "customer.mobile.tabs.shop.locationHours";

type Props = {
  location: PickupStoreLocation;
  timezone?: string | null;
  collectionNotes?: string | null;
  variant?: "compact" | "full";
  selected?: boolean;
  onSelect?: () => void;
  showPhone?: boolean;
  showMapLink?: boolean;
};

function fullAddress(loc: PickupStoreLocation): string {
  return [loc.address_line1, loc.address_line2, loc.city, loc.state, loc.postal_code, loc.country]
    .filter(Boolean)
    .join(", ");
}

export function PickupStoreCard({
  location,
  timezone,
  collectionNotes,
  variant = "full",
  selected,
  onSelect,
  showPhone = false,
  showMapLink = false,
}: Props) {
  const { t } = useTranslation();
  const tr = useCallback(
    (key: string, opts?: Record<string, string | number>) => t(`${PICKUP_I18N}.${key}`, opts) as string,
    [t],
  );
  const hoursLabel = formatLocationOpenLabel(
    { working_hours: location.working_hours, timezone },
    (key, opts) => t(key, opts) as string,
    HOURS_I18N,
  );
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  const addressQuery = fullAddress(location);
  const mapsHref = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`;

  const borderClass =
    variant === "full" && selected != null
      ? selected
        ? "border-2 border-pink-500 bg-pink-50/40"
        : "border border-gray-200"
      : "border border-gray-100";

  const Wrapper = onSelect ? "button" : "div";

  return (
    <Wrapper
      type={onSelect ? "button" : undefined}
      onClick={onSelect}
      className={`mb-2 w-full rounded-xl p-3 text-left ${borderClass} ${onSelect ? "cursor-pointer" : ""}`}
    >
      <p className={`font-semibold text-gray-900 ${variant === "compact" ? "text-sm" : "text-base"}`}>
        {location.name}
      </p>
      {variant === "compact" ? (
        <>
          <p className="mt-0.5 text-xs text-gray-600">
            {[location.address_line1, location.city].filter(Boolean).join(", ")}
          </p>
          <p className="mt-1 text-xs text-gray-700">{hoursLabel}</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{addressQuery}</p>
          <p className="mt-1.5 text-sm text-gray-800">{hoursLabel}</p>
          {collectionNotes ? (
            <div className="mt-2 rounded-lg bg-orange-50 p-2">
              <p className="text-xs font-semibold text-orange-800">{tr("pickupInstructions")}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-orange-900">{collectionNotes}</p>
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {showMapLink ? (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-pink-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {tr("directions")}
              </a>
            ) : null}
            {showPhone && location.phone ? (
              <a href={`tel:${location.phone.replace(/\s/g, "")}`} className="font-semibold text-pink-600 hover:underline">
                {tr("call")}
              </a>
            ) : null}
          </div>
        </>
      )}
    </Wrapper>
  );
}
