"use client";
import Link from "next/link";
import React from "react";

interface Destination {
  name: string;
  type: string;
  path: string;
}

interface StayType {
  name: string;
  path: string;
}

const destinations: Destination[] = [
  { name: "Ras Al-Khaimah", type: "Vacation rentals", path: "/" },
  { name: "Ajman", type: "Vacation rentals", path: "/" },
  { name: "Bur Dubai", type: "Vacation rentals", path: "/" },
  { name: "Jumeirah Beach", type: "Vacation rentals", path: "/" },
  { name: "Al Ain", type: "Vacation rentals", path: "/" },
  { name: "Bluewaters Island", type: "Vacation rentals", path: "/" },
  { name: "Abu Dhabi", type: "Vacation rentals", path: "/" },
  { name: "Palm Jumeirah", type: "Vacation rentals", path: "/" },
  { name: "Muscat", type: "Vacation rentals", path: "/" },
];

const stayTypes: StayType[] = [
  { name: "Dubai vacation rentals", path: "/" },
  { name: "Dubai monthly stays", path: "/" },
  { name: "Condo vacation rentals in Dubai", path: "/" },
  { name: "Vacation rentals with a pool in Dubai", path: "/" },
  { name: "Fitness-friendly vacation rentals in Dubai", path: "/" },
  { name: "Vacation rentals with outdoor seating in Dubai", path: "/" },
  {
    name: "Vacation rentals with outdoor seating in United Arab Emirates...",
    path: "/",
  },
  {
    name: "Fitness-friendly vacation rentals in United Arab Emirates",
    path: "/",
  },
  { name: "Condo vacation rentals in United Arab Emirates", path: "/" },
];

const NearbyOptions: React.FC = () => {
  return (
    <div className="bg-primary pt-7 pb-5">
      <div className="max-w-[1440px] mx-auto px-8">
        <div>
          <h2 className="text-[22px] font-normal  text-secondary mb-7">
            Explore other options in and around Downtown Dubai
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pb-12">
          {destinations.map((destination, index) => (
            <div key={index}>
              <Link href={destination.path}>
                <div>
                  <p className="text-sm font-light  text-secondary">
                    {destination.name}
                  </p>
                  <p className="text-sm font-light  text-destructive">
                    {destination.type}
                  </p>
                </div>
              </Link>
            </div>
          ))}
        </div>
        <div>
          <h3 className="text-lg font-normal text-secondary  mb-7">
            Other types of stays on Beautonomi
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 gap-y-0 ">
            {stayTypes.map((stay, index) => (
              <Link href={stay.path} key={index}>
                <p
                  className="text-sm font-medium text-secondary overflow-hidden whitespace-nowrap text-ellipsis mb-7"
                  title={stay.name}
                >
               <span className="font-light">{stay.name}</span>
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NearbyOptions;
