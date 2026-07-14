"use client";
import React from "react";
import { MapPin, Clock } from "lucide-react";
import Link from "next/link";
import { formatProviderDescriptionDisplay } from "@beautonomi/utils";
import type { ViewerTier } from "@/lib/providers/provider-disclosure";

interface PartnerAboutProps {
  description?: string | null;
  locations?: Array<{
    id: string;
    name?: string;
    is_primary?: boolean;
    location_type?: "salon" | "base";
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    working_hours?: Record<string, { open: string; close: string; is_closed?: boolean }> | unknown;
  }>;
  operating_hours?: Record<string, { open: string; close: string; is_closed?: boolean }>;
  disclosureTier?: ViewerTier;
  isAuthenticated?: boolean;
}

type DayHoursNormalized = {
  closed: boolean;
  open?: string;
  close?: string;
};

const normalizeDayHours = (value: unknown): DayHoursNormalized | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const closed = raw.is_closed === true || raw.closed === true || raw.is_open === false;
  const open =
    typeof raw.open === "string"
      ? raw.open
      : typeof raw.open_time === "string"
        ? raw.open_time
        : undefined;
  const close =
    typeof raw.close === "string"
      ? raw.close
      : typeof raw.close_time === "string"
        ? raw.close_time
        : undefined;
  return { closed, open, close };
};

const parseHoursSource = (input: unknown): Record<string, unknown> | null => {
  if (!input) return null;
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof input === "object") return input as Record<string, unknown>;
  return null;
};

const hasNonEmptyHours = (hours: Record<string, unknown> | null): hours is Record<string, unknown> =>
  Boolean(hours && Object.keys(hours).length > 0);

const readDayValue = (hoursData: Record<string, unknown>, day: string): unknown => {
  const entries = Object.entries(hoursData);
  const target = day.toLowerCase();
  const direct = entries.find(([k]) => k.toLowerCase() === target);
  if (direct) return direct[1];
  const abbrev = target.slice(0, 3);
  const short = entries.find(([k]) => k.toLowerCase().slice(0, 3) === abbrev);
  return short?.[1];
};

const PartnerAbout: React.FC<PartnerAboutProps> = ({
  description,
  locations = [],
  operating_hours,
  disclosureTier = "anon",
  isAuthenticated = false,
}) => {
  const formatOperatingHours = () => {
    if (disclosureTier === "anon") return null;

    let hoursData = parseHoursSource(operating_hours);

    if (!hasNonEmptyHours(hoursData) && locations.length > 0) {
      const locationWithHours = [
        ...locations.filter((loc) => loc.is_primary),
        ...locations,
      ].find((loc) => hasNonEmptyHours(parseHoursSource(loc.working_hours)));

      if (locationWithHours?.working_hours) {
        hoursData = parseHoursSource(locationWithHours.working_hours);
      }
    }

    if (!hasNonEmptyHours(hoursData)) return null;

    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    return days.map((day) => {
      const normalized = normalizeDayHours(readDayValue(hoursData, day));
      if (!normalized || normalized.closed || !normalized.open || !normalized.close) {
        return { day: day.charAt(0).toUpperCase() + day.slice(1), hours: "Closed" };
      }
      return {
        day: day.charAt(0).toUpperCase() + day.slice(1),
        hours: `${normalized.open} - ${normalized.close}`,
      };
    });
  };

  const formattedHours = formatOperatingHours();
  const aboutDescription = formatProviderDescriptionDisplay(description);
  const salonLocations = locations.filter((loc) => loc.location_type === "salon");
  const publicLocation =
    disclosureTier === "booked"
      ? salonLocations.find((loc) => loc.is_primary) || salonLocations[0] || null
      : null;
  const fallbackAreaLocation =
    locations.find((loc) => loc.city || loc.state || loc.country) || locations[0] || null;

  const showSignInGate = disclosureTier === "anon" && !isAuthenticated;

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">About</h2>

      {showSignInGate ? (
        <div className="prose max-w-none mb-8">
          <p className="text-gray-600 leading-relaxed">
            <Link href="/login" className="text-blue-600 hover:text-blue-800 underline">
              Sign in
            </Link>{" "}
            to read the full description, opening times, and location details.
          </p>
        </div>
      ) : (
        <div className="prose max-w-none mb-8">
          <p className="text-gray-700 leading-relaxed">
            {aboutDescription || "This provider hasn't added a description yet."}
          </p>
        </div>
      )}

      <div className="space-y-6">
        {showSignInGate ? null : formattedHours && formattedHours.length > 0 ? (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Opening times
            </h3>
            <div className="space-y-2">
              {formattedHours.map((schedule, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
                >
                  <span className="font-medium">{schedule.day}</span>
                  <span className="text-gray-600">{schedule.hours}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <h3 className="text-lg font-semibold mb-4">Additional information</h3>
          <div className="space-y-2">
            <p className="text-gray-700">Instant Confirmation</p>
          </div>
        </div>

        {showSignInGate ? null : publicLocation && publicLocation.address_line1 ? (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location
            </h3>
            <p className="text-gray-700 mb-2">
              {[
                publicLocation.address_line1,
                publicLocation.address_line2,
                publicLocation.city,
                publicLocation.state,
                publicLocation.postal_code,
                publicLocation.country,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            {publicLocation.latitude != null && publicLocation.longitude != null && (
              <Link
                href={`https://www.mapbox.com/directions/?destination=${publicLocation.longitude},${publicLocation.latitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline text-sm"
              >
                Get directions
              </Link>
            )}
          </div>
        ) : fallbackAreaLocation ? (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location
            </h3>
            <p className="text-gray-700 mb-2">
              Service area:{" "}
              {[fallbackAreaLocation.city, fallbackAreaLocation.state, fallbackAreaLocation.country]
                .filter(Boolean)
                .join(", ")}
            </p>
            {disclosureTier === "authed" && (
              <p className="text-sm text-gray-500">
                Exact address is shared after booking confirmation.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PartnerAbout;
