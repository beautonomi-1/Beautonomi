"use client";

import { MapPin, Home, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import dynamic from "next/dynamic";

const AddressAutocomplete = dynamic(
  () => import("@/components/mapbox/AddressAutocomplete").then((m) => m.default),
  { ssr: false }
);
import type {
  BookingData,
  LocationOption,
} from "../../types/booking-engine";
import {
  BOOKING_ACCENT,
  BOOKING_WAITLIST_BG,
  BOOKING_BORDER,
  BOOKING_EDGE,
  BOOKING_SHADOW_CARD,
  BOOKING_RADIUS_CARD,
  BOOKING_RADIUS_BUTTON,
  BOOKING_TEXT_PRIMARY,
  BOOKING_TEXT_SECONDARY,
  MIN_TAP,
  BOOKING_ACTIVE_SCALE,
} from "../../constants";

interface StepVenueProps {
  data: BookingData;
  locations: LocationOption[];
  onChange: (patch: Partial<BookingData>) => void;
  onNext: () => void;
  providerName?: string;
}

export function StepVenue({ data, locations, onChange, onNext, providerName }: StepVenueProps) {
  const venueType = data.venueType;
  const atSalonOk = venueType === "at_salon" && (locations.length === 0 || data.selectedLocation != null);
  const atHomeOk =
    venueType === "at_home" &&
    data.atHomeAddress.line1.trim() !== "" &&
    data.atHomeAddress.city.trim() !== "";
  const canNext = venueType === "at_salon" ? atSalonOk : atHomeOk;

  const cardStyle = {
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(16px) saturate(180%)",
    WebkitBackdropFilter: "blur(16px) saturate(180%)",
    border: `1px solid ${BOOKING_EDGE}`,
    borderRadius: BOOKING_RADIUS_CARD,
    boxShadow: BOOKING_SHADOW_CARD,
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h2
          className="text-2xl font-semibold tracking-tight text-left"
          style={{ color: BOOKING_TEXT_PRIMARY }}
        >
          {providerName ? `How would you like to experience ${providerName}?` : "Where would you like your appointment?"}
        </h2>
      </div>

      <div className="grid gap-4">
        {locations.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({ venueType: "at_salon" })}
            className={cn(
              "flex items-center p-5 text-left touch-manipulation w-full rounded-3xl border-2 transition-all duration-300",
              MIN_TAP,
              BOOKING_ACTIVE_SCALE
            )}
            style={{
              ...cardStyle,
              borderColor: venueType === "at_salon" ? BOOKING_ACCENT : BOOKING_BORDER,
              backgroundColor: venueType === "at_salon" ? BOOKING_WAITLIST_BG : undefined,
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mr-4 flex-shrink-0"
              style={{
                backgroundColor: venueType === "at_salon" ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.04)",
                color: venueType === "at_salon" ? BOOKING_ACCENT : undefined,
              }}
            >
              <MapPin size={24} strokeWidth={2} className={venueType === "at_salon" ? "" : "text-gray-500"} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-semibold text-base" style={{ color: BOOKING_TEXT_PRIMARY }}>
                Visit Salon
              </p>
              <p className="text-sm mt-0.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
                In-studio professional care
              </p>
            </div>
          </button>
        )}

        <button
          type="button"
          onClick={() => onChange({ venueType: "at_home" })}
          className={cn(
            "flex items-center p-5 text-left touch-manipulation w-full rounded-3xl border-2 transition-all duration-300",
            MIN_TAP,
            BOOKING_ACTIVE_SCALE
          )}
          style={{
            ...cardStyle,
            borderColor: venueType === "at_home" ? BOOKING_ACCENT : BOOKING_BORDER,
            backgroundColor: venueType === "at_home" ? BOOKING_WAITLIST_BG : undefined,
          }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mr-4 flex-shrink-0"
            style={{
              backgroundColor: venueType === "at_home" ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.04)",
              color: venueType === "at_home" ? BOOKING_ACCENT : undefined,
            }}
          >
            <Home size={24} strokeWidth={2} className={venueType === "at_home" ? "" : "text-gray-500"} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="font-semibold text-base" style={{ color: BOOKING_TEXT_PRIMARY }}>
              At Your Home
            </p>
            <p className="text-sm mt-0.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
              Luxury brought to your door
            </p>
          </div>
        </button>
      </div>

      {venueType === "at_salon" && locations.length > 1 && (
        <div
          className="p-5 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-3xl"
          style={cardStyle}
        >
          <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
            Select a Location
          </Label>
          <div className="space-y-2">
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => onChange({ selectedLocation: loc })}
                className={cn(
                  "w-full text-left rounded-xl border-2 px-4 py-3.5 transition-all touch-manipulation flex items-center gap-3",
                  MIN_TAP,
                  BOOKING_ACTIVE_SCALE
                )}
                style={{
                  borderColor: data.selectedLocation?.id === loc.id ? BOOKING_ACCENT : BOOKING_BORDER,
                  backgroundColor: data.selectedLocation?.id === loc.id ? BOOKING_WAITLIST_BG : "rgba(0,0,0,0.02)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium block" style={{ color: BOOKING_TEXT_PRIMARY }}>{loc.name}</span>
                  <p className="text-sm mt-0.5" style={{ color: BOOKING_TEXT_SECONDARY }}>
                    {[loc.address_line1, loc.city].filter(Boolean).join(", ")}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0" style={{ color: BOOKING_TEXT_SECONDARY }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {venueType === "at_salon" && locations.length === 0 && (
        <div
          className="rounded-2xl p-4 border"
          style={{
            backgroundColor: BOOKING_WAITLIST_BG,
            borderColor: "rgba(255,56,92,0.3)",
          }}
        >
          <p className="text-sm" style={{ color: BOOKING_ACCENT }}>
            This provider has no salon locations. Choose At your home or try another provider.
          </p>
        </div>
      )}

      {venueType === "at_home" && (
        <div
          className="p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-3xl"
          style={cardStyle}
        >
          <Label className="text-sm font-medium" style={{ color: BOOKING_TEXT_PRIMARY }}>
            Your address (search for geocoding & travel fee)
          </Label>
          <AddressAutocomplete
            value={data.atHomeAddress.line1}
            country={data.atHomeAddress.country || "ZA"}
            onChange={(addr) =>
              onChange({
                atHomeAddress: {
                  line1: addr.address_line1 || data.atHomeAddress.line1,
                  city: addr.city || data.atHomeAddress.city,
                  state: addr.state,
                  country: addr.country || data.atHomeAddress.country || "ZA",
                  postal_code: addr.postal_code,
                  latitude: addr.latitude,
                  longitude: addr.longitude,
                },
              })
            }
            onInputChange={(value) =>
              onChange({
                atHomeAddress: { ...data.atHomeAddress, line1: value, latitude: undefined, longitude: undefined },
              })
            }
            placeholder="Start typing your street address..."
            className="rounded-xl h-12 border bg-white/80 w-full"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="address-city" className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>City *</Label>
              <Input
                id="address-city"
                placeholder="City"
                value={data.atHomeAddress.city}
                onChange={(e) =>
                  onChange({
                    atHomeAddress: { ...data.atHomeAddress, city: e.target.value },
                  })
                }
                className="rounded-xl h-12 border bg-white/80"
                style={{ borderColor: BOOKING_BORDER }}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="address-postal" className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>Postal code</Label>
              <Input
                id="address-postal"
                placeholder="Postal code"
                value={data.atHomeAddress.postal_code ?? ""}
                onChange={(e) =>
                  onChange({
                    atHomeAddress: { ...data.atHomeAddress, postal_code: e.target.value || undefined },
                  })
                }
                className="rounded-xl h-12 border bg-white/80"
                style={{ borderColor: BOOKING_BORDER }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="address-country" className="text-xs" style={{ color: BOOKING_TEXT_SECONDARY }}>Country *</Label>
            <Input
              id="address-country"
              placeholder="Country"
              value={data.atHomeAddress.country}
              onChange={(e) =>
                onChange({
                  atHomeAddress: { ...data.atHomeAddress, country: e.target.value },
                })
              }
              className="rounded-xl h-12 border bg-white/80"
              style={{ borderColor: BOOKING_BORDER }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className={cn(
          "w-full py-4 rounded-2xl font-semibold text-white touch-manipulation transition-all duration-300 disabled:opacity-50 disabled:active:scale-100",
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
