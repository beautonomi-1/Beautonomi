"use client";

import React from "react";
import { Sparkles, Zap, Shield, Users, Clock, TrendingUp } from "lucide-react";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface FeaturesProps {
  content?: PageContent | null;
}

export default function Features({ content }: FeaturesProps) {
  // Get features from CMS or use defaults
  let features = [
    {
      icon: Sparkles,
      title: "Beautiful & Intuitive",
      description: "A platform designed with beauty professionals in mind. Clean, modern, and easy to use.",
      color: "from-pink-500 to-rose-500",
    },
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Built for speed. Manage bookings, payments, and clients without the wait.",
      color: "from-purple-500 to-pink-500",
    },
    {
      icon: Shield,
      title: "Secure & Reliable",
      description: "Your data and payments are protected with enterprise-grade security.",
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: Users,
      title: "Client Management",
      description: "Keep track of all your clients, their preferences, and booking history in one place.",
      color: "from-emerald-500 to-teal-500",
    },
    {
      icon: Clock,
      title: "Time Saving",
      description: "Automate scheduling, reminders, and follow-ups so you can focus on what you do best.",
      color: "from-amber-500 to-orange-500",
    },
    {
      icon: TrendingUp,
      title: "Grow Your Business",
      description: "Tools and insights to help you understand your business and scale with confidence.",
      color: "from-green-500 to-emerald-500",
    },
  ];

  // If CMS has features_list (JSON), use it
  if (content?.features_list?.content_type === "json") {
    try {
      const parsedFeatures = JSON.parse(content.features_list.content);
      if (Array.isArray(parsedFeatures) && parsedFeatures.length > 0) {
        features = parsedFeatures;
      }
    } catch (e) {
      console.error("Failed to parse features_list from CMS:", e);
    }
  }

  // Get section title from CMS
  const sectionTitle = content?.features_section_title?.content || "Everything you need to succeed";

  return (
    <div className="pb-16 md:pb-20 lg:pb-28 bg-gradient-to-b from-white to-gray-50">
      <div className="container">
        {sectionTitle && (
          <h2 className="text-center mb-12 md:mb-16 text-[28px] md:text-[40px] lg:text-[48px] font-normal text-secondary">
            {sectionTitle}
          </h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div 
                key={index} 
                className="group relative bg-white rounded-xl p-6 md:p-8 border border-gray-200 hover:border-[#FF0077] hover:shadow-xl transition-all duration-300 cursor-pointer"
              >
                <div className={`inline-flex p-4 bg-gradient-to-br ${feature.color} rounded-xl mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
                <h3 className="text-xl md:text-2xl font-semibold text-secondary mb-3">
                  {feature.title}
                </h3>
                <p className="text-sm md:text-base font-light text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
