"use client";

import React, { useState } from "react";
import { ChevronDown, Calendar, CreditCard, Users, MessageSquare, Megaphone, BarChart3, Package, Gift } from "lucide-react";

const features = [
  {
    category: "SCHEDULING & PAYMENTS",
    items: [
      { name: "Calendar & Scheduling", icon: Calendar },
      { name: "Payments & Point-of-Sale", icon: CreditCard },
      { name: "Online Booking", icon: Calendar },
      { name: "Yoco Integration", icon: CreditCard },
      { name: "Mobile Apps", icon: Calendar },
    ],
  },
  {
    category: "CLIENT RELATIONSHIPS",
    items: [
      { name: "Client Management", icon: Users },
      { name: "Call, Text, & Chat", icon: MessageSquare },
      { name: "Memberships & Packages", icon: Package },
      { name: "Forms & Charting", icon: Users },
      { name: "Gift Cards", icon: Gift },
    ],
  },
  {
    category: "MARKETING & AUTOMATION",
    items: [
      { name: "Automated Flows", icon: Megaphone },
      { name: "Campaigns", icon: Megaphone },
      { name: "Offers & Discounts", icon: Megaphone },
      { name: "Virtual Waiting Room", icon: MessageSquare },
    ],
  },
  {
    category: "MANAGEMENT",
    items: [
      { name: "Retail & Inventory", icon: BarChart3 },
      { name: "Staff Management", icon: Users },
      { name: "Reporting", icon: BarChart3 },
      { name: "Multi-Location", icon: BarChart3 },
      { name: "Payroll Processing", icon: BarChart3 },
    ],
  },
];

export default function FeaturesDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="flex items-center gap-1 text-sm font-medium text-gray-700 hover:text-[#FF0077] transition-colors"
      >
        Features
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[95vw] sm:w-[700px] lg:w-[800px] max-w-[800px] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 sm:p-6 md:p-8 z-50 overflow-x-auto"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
            {features.map((section) => (
              <div key={section.category} className="min-w-0">
                <h3 className="text-[10px] sm:text-xs font-bold text-gray-900 mb-3 sm:mb-4 uppercase tracking-wide">
                  {section.category}
                </h3>
                <ul className="space-y-2 sm:space-y-3">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.name}>
                        <button className="flex items-center gap-2 sm:gap-3 w-full text-left group hover:text-[#FF0077] transition-colors">
                          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center group-hover:border-[#FF0077] group-hover:bg-pink-50 transition-colors flex-shrink-0">
                            <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 group-hover:text-[#FF0077]" />
                          </div>
                          <span className="text-xs sm:text-sm text-gray-700 group-hover:text-[#FF0077] truncate">
                            {item.name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
