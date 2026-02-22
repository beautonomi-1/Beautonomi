"use client";
import React from "react";
import { MapPin, Clock } from "lucide-react";
import Link from "next/link";

interface OpeningHours {
  day: string;
  hours: string;
}

const openingHours: OpeningHours[] = [
  { day: "Monday", hours: "9:45 AM - 6:30 PM" },
  { day: "Tuesday", hours: "9:45 AM - 6:30 PM" },
  { day: "Wednesday", hours: "9:45 AM - 6:30 PM" },
  { day: "Thursday", hours: "9:45 AM - 6:30 PM" },
  { day: "Friday", hours: "9:45 AM - 6:30 PM" },
  { day: "Saturday", hours: "9:15 AM - 5:00 PM" },
  { day: "Sunday", hours: "9:15 AM - 4:00 PM" },
];

const PartnerAbout: React.FC = () => {
  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">About</h2>
      
      <div className="prose max-w-none mb-8">
        <p className="text-gray-700 leading-relaxed">
          Cheers to the ultimate pampering experience. At Rose Blvd Beauty Bar, we don't just offer 
          complimentary glass of champagne, we also offer the best service, vibey atmosphere, and 
          friendliest nail techs in town. Come indulge yourself and let us take care of the rest. 
          We believe that if you look good, you feel good and when you feel good, you absolutely conquer. 
          We cannot wait to host you. Spend some time with us in the most beautiful and good vibes 
          beauty bar in Sea Point or actually, Cape Town.
        </p>
      </div>

      <div className="space-y-6">
        {/* Opening Times */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Opening times
          </h3>
          <div className="space-y-2">
            {openingHours.map((schedule, index) => (
              <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <span className="font-medium">{schedule.day}</span>
                <span className="text-gray-600">{schedule.hours}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Information */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Additional information</h3>
          <div className="space-y-2">
            <p className="text-gray-700">Instant Confirmation</p>
          </div>
        </div>

        {/* Address */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location
          </h3>
          <p className="text-gray-700 mb-2">
            369 Main Road, Shop 4, Sea Point, Cape Town, Western Cape
          </p>
          <Link
            href="https://maps.google.com/?q=369+Main+Road+Sea+Point+Cape+Town"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline text-sm"
          >
            Get directions
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PartnerAbout;
