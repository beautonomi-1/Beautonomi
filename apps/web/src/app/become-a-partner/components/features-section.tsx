"use client";

import React from "react";
import { Calendar, CreditCard, Users, MessageSquare, Megaphone, BarChart3 } from "lucide-react";
import { usePageContent } from "@/hooks/usePageContent";

const defaultFeatures = [
  {
    category: "SCHEDULING & PAYMENTS",
    items: [
      { name: "Calendar & Scheduling", icon: Calendar },
      { name: "Online Booking", icon: Calendar },
      { name: "Payment Processing", icon: CreditCard },
      { name: "Yoco Integration", icon: CreditCard },
      { name: "Sales Reports", icon: BarChart3 },
    ],
  },
  {
    category: "CLIENT RELATIONSHIPS",
    items: [
      { name: "Client Management", icon: Users },
      { name: "Client History", icon: Users },
      { name: "Memberships", icon: Users },
      { name: "Loyalty Programs", icon: Users },
    ],
  },
  {
    category: "MARKETING & AUTOMATION",
    items: [
      { name: "Automated Flows", icon: Megaphone },
      { name: "Blast Campaigns", icon: Megaphone },
      { name: "Email Marketing", icon: MessageSquare },
      { name: "SMS Notifications", icon: MessageSquare },
    ],
  },
  {
    category: "MANAGEMENT",
    items: [
      { name: "Team Management", icon: Users },
      { name: "Shift Scheduling", icon: Calendar },
      { name: "Commission Tracking", icon: BarChart3 },
      { name: "Inventory & Products", icon: BarChart3 },
    ],
  },
];

export default function FeaturesSection() {
  const { getSectionContent } = usePageContent("become-a-partner");
  const featuresTitle = getSectionContent("features_title") || "Everything you need in one platform";
  const featuresDescription = getSectionContent("features_description") || "Powerful features designed to help you grow your beauty business";

  // Try to parse features from JSON if available, otherwise use defaults
  let features = defaultFeatures;
  try {
    const featuresJson = getSectionContent("features_list");
    if (featuresJson) {
      const parsed = JSON.parse(featuresJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        features = parsed;
      }
    }
  } catch {
    // Use default features if parsing fails
  }

  return (
    <div className="py-12 sm:py-16 md:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 sm:mb-10 md:mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-4">
            {featuresTitle.includes('<') ? (
              <span dangerouslySetInnerHTML={{ __html: featuresTitle }} />
            ) : (
              featuresTitle
            )}
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto px-4">
            {featuresDescription.includes('<') ? (
              <span dangerouslySetInnerHTML={{ __html: featuresDescription }} />
            ) : (
              featuresDescription
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
          {features.map((section) => (
            <div key={section.category} className="bg-gray-50 rounded-xl p-4 sm:p-5 md:p-6">
              <h3 className="text-xs sm:text-sm font-bold text-gray-900 mb-3 sm:mb-4 uppercase tracking-wide">
                {section.category}
              </h3>
              <ul className="space-y-2 sm:space-y-3">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.name} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center group-hover:border-[#FF0077] group-hover:bg-pink-50 transition-colors">
                        <Icon className="w-4 h-4 text-gray-600 group-hover:text-[#FF0077]" />
                      </div>
                      <span className="text-sm text-gray-700 group-hover:text-[#FF0077] transition-colors">
                        {item.name}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
