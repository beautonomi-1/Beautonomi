"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import CityWaitlistModal from "@/components/city-waitlist-modal";

export default function OtherCities() {
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const cities = [
    "Atlanta Metro",
    "Indianapolis",
    "Raleigh",
    "Austin Metro",
    "Jacksonville",
    "Sacramento",
    "Baltimore County",
    "Los Angeles",
    "San Antonio",
    "Boston Metro",
    "Miami",
    "San Diego",
    "Charlotte",
    "Orlando Metro",
    "San Francisco",
    "Cincinnati",
    "Philadelphia Metro",
    "Seattle Metro",
    "Dallas",
    "Phoenix",
    "Tampa",
    "Denver",
    "Pittsburgh",
    "Washington Metro",
    "Houston Metro",
    "Portland",
  ];

  return (
    <>
    <div className="container">
      <div className="">
        <div className="flex  items-start justify-between w-full flex-col lg:flex-row ">
          <div className="mb-8 md:mb-0 ">
            <h1 className="mb-11 text-[26px] lg:text-5xl max-w-96 font-semibold text-secondary leading-8 lg:leading-[52px]">
              Find your Beautonomi-friendly apartment in another city
            </h1>
            <div className="hidden lg:block">
            <p className="text-lg font-normal  text-secondary">
              Are you a building owner?
            </p>
            <p className="text-base font-normal  text-secondary">
              <a href="#" className="underline hover:text-black ">
                Learn more
              </a> about making your apartments Beautonomi-friendly.
            </p>
          </div>
          </div>
          <div className="mb-20 lg:mb-24 w-full">
          <div className="grid  gap-10 gap-y-0 grid-cols-2 md:grid-cols-3 mb-14 lg:mb-[90px] w-full">
            {cities.map((city, index) => (
              <p
                key={index}
                className="text-[22px] hover:text-black mb-1 hover:underline  font-normal  text-[#374151]"
              >
                {city}
              </p>
            ))}
            <p className="text-lg text-gray-700">
              <a href="#" className="underline">
                View All
              </a>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-8 w-full ">
          <p className="text-lg font-normal  text-secondary">
            Don’t see your city?
          </p>
         <Button 
           variant="destructive" 
           size="sm"
           onClick={() => setIsWaitlistModalOpen(true)}
         >
           Join the waitlist
         </Button>
         <div className="block lg:hidden">
            <p className="text-lg font-normal  text-secondary">
              Are you a building owner?
            </p>
            <p className="text-base font-normal  text-secondary">
              <a href="#" className="underline hover:text-black">
                Learn more
              </a>
              about making your apartments Beautonomi-friendly.
            </p>
          </div>
        </div>
        </div>
       
        </div>
      </div>
    </div>

    <CityWaitlistModal
      open={isWaitlistModalOpen}
      onOpenChange={setIsWaitlistModalOpen}
    />
    </>
  );
}
