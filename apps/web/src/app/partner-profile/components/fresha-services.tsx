"use client";
import React, { useState, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Service = {
  title: string;
  duration: string;
  price: string;
  category: string;
  emoji?: string;
  featured?: boolean;
};

type ServiceCategory = {
  name: string;
  emoji: string;
  services: Service[];
};

const serviceCategories: ServiceCategory[] = [
  {
    name: "SOAK OFF",
    emoji: "💧",
    services: [
      {
        title: "SOAK OFF (No Other Treatment)",
        duration: "30 min",
        price: "ZAR 85",
        category: "SOAK OFF",
        emoji: "💧",
      },
      {
        title: "SOAK OFF (Booked With Treatments)",
        duration: "30 min",
        price: "ZAR 80",
        category: "SOAK OFF",
        emoji: "💦",
      },
    ],
  },
  {
    name: "CONSULTATION",
    emoji: "✍️",
    services: [
      {
        title: "Nail Consultation",
        duration: "15 min",
        price: "ZAR 50",
        category: "CONSULTATION",
        emoji: "✍️",
      },
    ],
  },
  {
    name: "GEL NAILS",
    emoji: "😍",
    services: [
      {
        title: "Gel Removal (Feet)",
        duration: "30 min",
        price: "ZAR 85",
        category: "GEL NAILS",
        emoji: "😍",
      },
      {
        title: "Royal Treatment Gel Overlay (Feet)",
        duration: "1 hr, 15 min",
        price: "ZAR 360",
        category: "GEL NAILS",
        emoji: "😍",
        featured: true,
      },
      {
        title: "Rubber Base/Supreme Base Removal (Hands)",
        duration: "30 min",
        price: "ZAR 80",
        category: "GEL NAILS",
        emoji: "😍",
      },
      {
        title: "Rubber Base Overlay Fill With Gel Polish (Hands)",
        duration: "1 hr, 10 min",
        price: "ZAR 290",
        category: "GEL NAILS",
        emoji: "😍",
      },
    ],
  },
  {
    name: "MANI & PEDI",
    emoji: "💖",
    services: [
      {
        title: "Classic Manicure",
        duration: "45 min",
        price: "ZAR 150",
        category: "MANI & PEDI",
        emoji: "💖",
      },
      {
        title: "Classic Pedicure",
        duration: "1 hr",
        price: "ZAR 200",
        category: "MANI & PEDI",
        emoji: "💖",
      },
    ],
  },
];

const PartnerServices: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = direction === "left" ? -200 : 200;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">Services</h2>

      {/* Category Navigation */}
      <div className="relative mb-8">
        <div className="flex items-center">
          <div
            ref={scrollRef}
            className="flex space-x-2 overflow-x-auto scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {serviceCategories.map((category, index) => (
              <button
                key={index}
                onClick={() => setActiveCategory(index)}
                className={`py-2 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  index === activeCategory
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                }`}
              >
                {category.emoji} {category.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 bg-white p-1 rounded-full shadow-md hidden md:block"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 bg-white p-1 rounded-full shadow-md hidden md:block"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Services List */}
      <div className="space-y-4">
        {serviceCategories[activeCategory].services.map((service, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {service.featured && (
                    <span className="bg-pink-100 text-pink-800 text-xs font-semibold px-2 py-0.5 rounded">
                      Featured
                    </span>
                  )}
                  <h3 className="text-lg font-medium">{service.title}</h3>
                </div>
                <p className="text-gray-500 text-sm mb-2">{service.duration}</p>
                <p className="text-lg font-semibold">{service.price}</p>
              </div>
              <Link href="/booking">
                <button className="w-full md:w-auto px-6 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors text-sm font-medium">
                  Book
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Link href="/partner-profile/services">
          <button className="text-gray-600 hover:text-gray-900 underline text-sm">
            See all
          </button>
        </Link>
      </div>
    </div>
  );
};

export default PartnerServices;
