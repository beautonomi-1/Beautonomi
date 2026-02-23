"use client";

import { Building2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  BookingData,
  VenueType,
  LocationOption,
  AtHomeAddress,
} from "../../types/booking-engine";

const MIN_TAP = "min-h-[44px] min-w-[44px]";

interface StepVenueProps {
  data: BookingData;
  locations: LocationOption[];
  onChange: (patch: Partial<BookingData>) => void;
  onNext: () => void;
}

export function StepVenue({ data, locations, onChange, onNext }: StepVenueProps) {
  const venueType = data.venueType;
  const atSalonOk = venueType === "at_salon" && (locations.length === 0 || data.selectedLocation != null);
  const atHomeOk =
    venueType === "at_home" &&
    data.atHomeAddress.line1.trim() !== "" &&
    data.atHomeAddress.city.trim() !== "";
  const canNext = venueType === "at_salon" ? atSalonOk : atHomeOk;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Where would you like your appointment?</h2>
        <p className="mt-1 text-sm text-gray-500">Choose your preferred location</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onChange({ venueType: "at_salon" })}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-[2rem] border-2 p-6 transition-all touch-manipulation active:scale-[0.98]",
            MIN_TAP,
            venueType === "at_salon"
              ? "border-[#EC4899] bg-[#EC4899]/10"
              : "border-gray-200 bg-white hover:border-gray-300"
          )}
        >
          <div
            className={cn(
              "rounded-2xl p-3",
              venueType === "at_salon" ? "bg-[#EC4899]/20" : "bg-gray-100"
            )}
          >
            <Building2
              className="h-6 w-6"
              style={{ color: venueType === "at_salon" ? "#EC4899" : "#6b7280" }}
            />
          </div>
          <span className="font-medium text-gray-900">At Salon</span>
          <span className="text-xs text-gray-500 text-center">Visit the venue</span>
        </button>

        <button
          type="button"
          onClick={() => onChange({ venueType: "at_home" })}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-[2rem] border-2 p-6 transition-all touch-manipulation active:scale-[0.98]",
            MIN_TAP,
            venueType === "at_home"
              ? "border-[#EC4899] bg-[#EC4899]/10"
              : "border-gray-200 bg-white hover:border-gray-300"
          )}
        >
          <div
            className={cn(
              "rounded-2xl p-3",
              venueType === "at_home" ? "bg-[#EC4899]/20" : "bg-gray-100"
            )}
          >
            <MapPin
              className="h-6 w-6"
              style={{ color: venueType === "at_home" ? "#EC4899" : "#6b7280" }}
            />
          </div>
          <span className="font-medium text-gray-900">House Call</span>
          <span className="text-xs text-gray-500 text-center">We come to you</span>
        </button>
      </div>

      {venueType === "at_salon" && locations.length > 1 && (
        <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Label className="text-gray-700">Select branch</Label>
          <div className="space-y-2">
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => onChange({ selectedLocation: loc })}
                className={cn(
                  "w-full text-left rounded-2xl border-2 px-4 py-3 transition-all touch-manipulation active:scale-[0.99]",
                  data.selectedLocation?.id === loc.id
                    ? "border-[#EC4899] bg-[#EC4899]/5"
                    : "border-gray-200 bg-white hover:border-gray-300"
                )}
              >
                <span className="font-medium text-gray-900">{loc.name}</span>
                <p className="text-sm text-gray-500 mt-0.5">
                  {loc.address_line1}, {loc.city}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {venueType === "at_salon" && locations.length === 0 && (
        <p className="rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3">
          This provider has no salon locations. Choose House Call or try another provider.
        </p>
      )}

      {venueType === "at_home" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Label htmlFor="address-line1" className="text-gray-700">
            Your address
          </Label>
          <Input
            id="address-line1"
            placeholder="Street address"
            value={data.atHomeAddress.line1}
            onChange={(e) =>
              onChange({
                atHomeAddress: { ...data.atHomeAddress, line1: e.target.value },
              })
            }
            className="rounded-2xl h-12 border-gray-200"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="City"
              value={data.atHomeAddress.city}
              onChange={(e) =>
                onChange({
                  atHomeAddress: { ...data.atHomeAddress, city: e.target.value },
                })
              }
              className="rounded-2xl h-12 border-gray-200"
            />
            <Input
              placeholder="Postal code (optional)"
              value={data.atHomeAddress.postal_code ?? ""}
              onChange={(e) =>
                onChange({
                  atHomeAddress: {
                    ...data.atHomeAddress,
                    postal_code: e.target.value || undefined,
                  },
                })
              }
              className="rounded-2xl h-12 border-gray-200"
            />
          </div>
          <Input
            placeholder="Country"
            value={data.atHomeAddress.country}
            onChange={(e) =>
              onChange({
                atHomeAddress: { ...data.atHomeAddress, country: e.target.value },
              })
            }
            className="rounded-2xl h-12 border-gray-200"
          />
        </div>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
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
