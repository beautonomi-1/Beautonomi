"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

const serviceCategories = [
  { category: "Hair Salons", icon: "✂️", href: "/category/hair-salons" },
  { category: "Skincare Studios", icon: "✨", href: "/category/skincare" },
  { category: "Hair Removal", icon: "💆", href: "/category/hair-removal" },
  { category: "Barbershops", icon: "🧔", href: "/category/barbershops" },
  { category: "Med Spas", icon: "🏥", href: "/category/med-spas" },
  { category: "Beauty Studios", icon: "💄", href: "/category/beauty-studios" },
  { category: "Tattoo & Piercing", icon: "🎨", href: "/category/tattoo-piercing" },
  { category: "Wellness Centers", icon: "🧘", href: "/category/wellness" },
  { category: "IV Therapy", icon: "💉", href: "/category/iv-therapy" },
  { category: "Massage Studios", icon: "💆‍♀️", href: "/category/massage" },
  { category: "Nail Salons", icon: "💅", href: "/category/nail-salons" },
  { category: "Spas", icon: "🛁", href: "/category/spas" },
];

export default function SolutionsDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-[#FF0077] transition-colors"
      >
        Services
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          className="absolute top-full left-0 mt-2 w-[90vw] sm:w-[500px] max-w-[500px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 sm:p-6 z-50"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {serviceCategories.map((type) => (
              <Link
                key={type.category}
                href={type.href}
                className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                onClick={() => setIsOpen(false)}
              >
                <span className="text-xl sm:text-2xl flex-shrink-0">{type.icon}</span>
                <span className="text-xs sm:text-sm font-medium text-gray-700 group-hover:text-[#FF0077] transition-colors">
                  {type.category}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
