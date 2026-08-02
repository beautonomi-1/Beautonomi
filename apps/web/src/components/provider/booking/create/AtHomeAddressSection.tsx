"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { mapGeocodeFeatureToAddressParts } from "@beautonomi/utils";
import { fetcher } from "@/lib/http/fetcher";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { LocationMapPickerDialog } from "@/components/mapbox/LocationMapPickerDialog";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

export interface AtHomeAddressValue {
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  addressLatitude: number | null;
  addressLongitude: number | null;
  travelFee: number;
  travelPreviewMinutes: number | null;
  travelPreviewDistanceKm: number | null;
  useTravelOverride: boolean;
  travelFeeOverride: number | null;
}

interface AtHomeAddressSectionProps {
  value: AtHomeAddressValue;
  onChange: (next: AtHomeAddressValue) => void;
}

export function effectiveAtHomeTravelFee(value: AtHomeAddressValue): number {
  if (value.useTravelOverride && value.travelFeeOverride != null) {
    return Math.max(0, value.travelFeeOverride);
  }
  return Math.max(0, value.travelFee);
}

export function AtHomeAddressSection({ value, onChange }: AtHomeAddressSectionProps) {
  const { provider } = useProviderPortal();
  const { format: formatMoney } = useProviderMoneyFormat();
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = (partial: Partial<AtHomeAddressValue>) => {
    onChange({ ...value, ...partial });
  };

  const applyPickedAddress = (addr: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  }) => {
    patch({
      addressLine1: addr.place_name || addr.address_line1,
      addressCity: addr.city,
      addressState: addr.state ?? "",
      addressPostalCode: addr.postal_code ?? "",
      addressCountry: addr.country || "South Africa",
      addressLatitude: addr.latitude || null,
      addressLongitude: addr.longitude || null,
    });
  };

  useEffect(() => {
    if (!provider?.id) return;

    const hasStructured =
      Boolean(value.addressLine1.trim()) && Boolean(value.addressCity.trim());
    const hasCoords =
      value.addressLatitude != null &&
      value.addressLongitude != null &&
      Number.isFinite(value.addressLatitude) &&
      Number.isFinite(value.addressLongitude);

    if (!hasStructured && !hasCoords) {
      setValidationError(null);
      if (value.travelFee !== 0 || value.travelPreviewMinutes != null) {
        patch({ travelFee: 0, travelPreviewMinutes: null, travelPreviewDistanceKm: null });
      }
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    let cancelled = false;
    timerRef.current = setTimeout(() => {
      void (async () => {
        setValidating(true);
        setValidationError(null);
        try {
          const country = value.addressCountry.trim() || "South Africa";
          const addressString = hasStructured
            ? [
                value.addressLine1,
                value.addressLine2,
                value.addressCity,
                value.addressState,
                value.addressPostalCode,
                country,
              ]
                .filter(Boolean)
                .join(", ")
            : `${value.addressLatitude},${value.addressLongitude}`;

          const body: Record<string, unknown> = {
            address: addressString,
            provider_id: provider.id,
          };
          if (hasCoords) {
            body.latitude = value.addressLatitude;
            body.longitude = value.addressLongitude;
          }

          const json = await fetcher.post<{
            data?: {
              valid?: boolean;
              travelFee?: number;
              travelTimeMinutes?: number;
              distanceKm?: number;
              message?: string;
            };
          }>("/api/location/validate", body);
          if (cancelled) return;

          const payload = json?.data;
          if (payload?.valid === false) {
            setValidationError(payload.message || "Address is outside the service area");
            patch({ travelFee: 0, travelPreviewMinutes: null, travelPreviewDistanceKm: null });
            return;
          }

          const fee = Math.max(0, Number(payload?.travelFee ?? 0));
          const minutes =
            typeof payload?.travelTimeMinutes === "number" &&
            Number.isFinite(payload.travelTimeMinutes) &&
            payload.travelTimeMinutes > 0
              ? Math.ceil(payload.travelTimeMinutes)
              : null;
          const distanceKm =
            typeof payload?.distanceKm === "number" && Number.isFinite(payload.distanceKm)
              ? payload.distanceKm
              : null;
          patch({
            travelFee: fee,
            travelPreviewMinutes: minutes,
            travelPreviewDistanceKm: distanceKm,
          });
        } catch {
          if (!cancelled) {
            setValidationError("Could not validate address");
            patch({ travelFee: 0, travelPreviewMinutes: null, travelPreviewDistanceKm: null });
          }
        } finally {
          if (!cancelled) setValidating(false);
        }
      })();
    }, 600);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validate when address fields change
  }, [
    provider?.id,
    value.addressLine1,
    value.addressLine2,
    value.addressCity,
    value.addressState,
    value.addressPostalCode,
    value.addressCountry,
    value.addressLatitude,
    value.addressLongitude,
  ]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetcher.post<{
            data?: { place_name: string; center: [number, number]; context?: Array<{ id: string; text: string; short_code?: string }> };
          }>("/api/mapbox/reverse-geocode", {
            longitude: pos.coords.longitude,
            latitude: pos.coords.latitude,
          });
          const feature = res?.data;
          if (feature) {
            const address = mapGeocodeFeatureToAddressParts(feature, {
              defaultCountryName: "South Africa",
            });
            applyPickedAddress({
              ...address,
              state: address.state || undefined,
              postal_code: address.postal_code || undefined,
              place_name: feature.place_name,
            });
          } else {
            patch({
              addressLatitude: pos.coords.latitude,
              addressLongitude: pos.coords.longitude,
            });
          }
        } catch {
          patch({
            addressLatitude: pos.coords.latitude,
            addressLongitude: pos.coords.longitude,
          });
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  const displayFee = effectiveAtHomeTravelFee(value);

  return (
    <BookingSectionCard data-testid="at-home-address-section">
      <BookingSectionLabel className="mb-2">At-home address</BookingSectionLabel>
      <div className="space-y-2">
        <AddressAutocomplete
          value={value.addressLine1}
          onChange={(addr) => {
            patch({
              addressLine1: addr.place_name || addr.address_line1,
              addressCity: addr.city,
              addressState: addr.state ?? "",
              addressPostalCode: addr.postal_code ?? "",
              addressCountry: addr.country || value.addressCountry || "South Africa",
              addressLatitude: addr.latitude || null,
              addressLongitude: addr.longitude || null,
            });
          }}
          onInputChange={(val) => {
            if (val) patch({ addressLine1: val });
          }}
          placeholder="Search for address…"
          label=""
          country="ZA"
          defaultCountryName="South Africa"
          inputClassName="rounded-xl min-h-[44px]"
          inputId="at-home-address-autocomplete"
        />
        <Input
          value={value.addressLine2}
          onChange={(e) => patch({ addressLine2: e.target.value })}
          placeholder="Apt / unit (optional)"
          className="rounded-xl min-h-[44px]"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={value.addressCity}
            onChange={(e) => patch({ addressCity: e.target.value })}
            placeholder="City"
            className="rounded-xl min-h-[44px]"
          />
          <Input
            value={value.addressState}
            onChange={(e) => patch({ addressState: e.target.value })}
            placeholder="Province / state"
            className="rounded-xl min-h-[44px]"
          />
        </div>
        <Input
          value={value.addressPostalCode}
          onChange={(e) => patch({ addressPostalCode: e.target.value })}
          placeholder="Postal code"
          className="rounded-xl min-h-[44px]"
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl min-h-[40px] touch-manipulation"
            onClick={() => setMapOpen(true)}
          >
            <MapPin className="mr-1.5 h-4 w-4" />
            Pin on map
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl min-h-[40px] touch-manipulation"
            onClick={handleUseMyLocation}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="mr-1.5 h-4 w-4" />
            )}
            Use my location
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm text-blue-900">
          {validating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>Calculating travel fee…</span>
            </>
          ) : validationError ? (
            <span className="text-amber-800">{validationError}</span>
          ) : displayFee > 0 ? (
            <>
              <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
              <span>
                Travel fee: <span className="font-semibold">{formatMoney(displayFee)}</span>
                {value.useTravelOverride ? " (override)" : null}
              </span>
            </>
          ) : (
            <span className="text-blue-700">Enter or search an address to calculate travel fee</span>
          )}
        </div>
        {!validationError &&
        (value.travelPreviewDistanceKm != null || value.travelPreviewMinutes != null) ? (
          <p className="text-xs text-blue-600 mt-1">
            {value.travelPreviewDistanceKm != null
              ? `${value.travelPreviewDistanceKm.toFixed(1)} km`
              : null}
            {value.travelPreviewDistanceKm != null && value.travelPreviewMinutes != null
              ? " · "
              : null}
            {value.travelPreviewMinutes != null
              ? `~${value.travelPreviewMinutes} min drive`
              : null}
            {value.addressLatitude != null && value.addressLongitude != null ? " · Geocoded" : null}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Override travel fee</p>
          <p className="text-xs text-gray-500">Use a custom fee instead of calculated</p>
        </div>
        <Switch
          checked={value.useTravelOverride}
          onCheckedChange={(checked) =>
            patch({
              useTravelOverride: checked,
              travelFeeOverride: checked ? value.travelFeeOverride ?? value.travelFee : null,
            })
          }
        />
      </div>
      {value.useTravelOverride ? (
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value.travelFeeOverride ?? ""}
          onChange={(e) =>
            patch({
              travelFeeOverride: e.target.value ? Math.max(0, Number(e.target.value)) : null,
            })
          }
          placeholder="Custom travel fee"
          className="rounded-xl min-h-[44px] mt-2"
        />
      ) : null}

      <LocationMapPickerDialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        initialLatitude={value.addressLatitude ?? undefined}
        initialLongitude={value.addressLongitude ?? undefined}
        defaultCountryName="South Africa"
        onLocationPicked={applyPickedAddress}
      />
    </BookingSectionCard>
  );
}

export function isAtHomeAddressReady(value: AtHomeAddressValue): boolean {
  return Boolean(value.addressLine1.trim()) && Boolean(value.addressCity.trim());
}
