"use client";
import React from "react";
import { MapPin, Clock } from "lucide-react";
import Link from "next/link";

interface PartnerAboutProps {
  description?: string | null;
  locations?: Array<{
    id: string;
    name?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
    working_hours?: Record<string, { open: string; close: string; is_closed?: boolean }> | any;
  }>;
  operating_hours?: Record<string, { open: string; close: string; is_closed?: boolean }>;
}

const PartnerAbout: React.FC<PartnerAboutProps> = ({ 
  description, 
  locations = [],
  operating_hours 
}) => {
  // Format operating hours if available - check both operating_hours prop and location working_hours
  const formatOperatingHours = () => {
    // First try operating_hours prop
    let hoursData = operating_hours;
    
    // If not available, try to get from primary location
    if (!hoursData && locations && locations.length > 0) {
      const primaryLocation = locations.find(loc => loc.working_hours) || locations[0];
      if (primaryLocation?.working_hours) {
        hoursData = typeof primaryLocation.working_hours === 'string' 
          ? JSON.parse(primaryLocation.working_hours) 
          : primaryLocation.working_hours;
      }
    }
    
    if (!hoursData) return null;
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return days.map((day) => {
      const hours = hoursData[day];
      if (!hours || hours.is_closed) {
        return { day: day.charAt(0).toUpperCase() + day.slice(1), hours: "Closed" };
      }
      return {
        day: day.charAt(0).toUpperCase() + day.slice(1),
        hours: `${hours.open} - ${hours.close}`
      };
    });
  };

  const formattedHours = formatOperatingHours();
  const primaryLocation = locations[0];

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">About</h2>
      
      <div className="prose max-w-none mb-8">
        <p className="text-gray-700 leading-relaxed">
          {description || "This provider hasn't added a description yet."}
        </p>
      </div>

      <div className="space-y-6">
        {/* Opening Times */}
        {formattedHours && formattedHours.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Opening times
            </h3>
            <div className="space-y-2">
              {formattedHours.map((schedule, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <span className="font-medium">{schedule.day}</span>
                  <span className="text-gray-600">{schedule.hours}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Information */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Additional information</h3>
          <div className="space-y-2">
            <p className="text-gray-700">Instant Confirmation</p>
          </div>
        </div>

        {/* Address */}
        {primaryLocation && (
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location
            </h3>
            <p className="text-gray-700 mb-2">
              {[
                primaryLocation.address_line1,
                primaryLocation.address_line2,
                primaryLocation.city,
                primaryLocation.state,
                primaryLocation.postal_code,
                primaryLocation.country
              ].filter(Boolean).join(", ")}
            </p>
            {primaryLocation.latitude && primaryLocation.longitude && (
              <Link
                href={`https://maps.google.com/?q=${primaryLocation.latitude},${primaryLocation.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline text-sm"
              >
                Get directions
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PartnerAbout;
