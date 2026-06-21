"use client";

import React from "react";
import { Sparkles, Zap, Shield, Users, Clock, TrendingUp, type LucideIcon } from "lucide-react";

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

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const ICON_FALLBACKS: LucideIcon[] = [Sparkles, Zap, Shield, Users, Clock, TrendingUp];

export default function Features({ content }: FeaturesProps) {
  let features: Feature[] = [
    {
      icon: Sparkles,
      title: "Beautiful & intuitive",
      description: "A platform designed with beauty professionals in mind. Clean, modern, and effortless to use.",
    },
    {
      icon: Zap,
      title: "Lightning fast",
      description: "Built for speed. Manage bookings, payments, and clients without ever waiting.",
    },
    {
      icon: Shield,
      title: "Secure & reliable",
      description: "Your data and payments are protected with bank-grade, enterprise security.",
    },
    {
      icon: Users,
      title: "Client management",
      description: "Keep every client, their preferences, and booking history organised in one place.",
    },
    {
      icon: Clock,
      title: "Time saving",
      description: "Automate scheduling, reminders, and follow-ups so you can focus on your craft.",
    },
    {
      icon: TrendingUp,
      title: "Grow your business",
      description: "Insights and tools that help you understand your numbers and scale with confidence.",
    },
  ];

  if (content?.features_list?.content_type === "json") {
    try {
      const parsedFeatures = JSON.parse(content.features_list.content);
      if (Array.isArray(parsedFeatures) && parsedFeatures.length > 0) {
        features = parsedFeatures.map((f: any, i: number) => ({
          icon: typeof f.icon === "function" ? f.icon : ICON_FALLBACKS[i % ICON_FALLBACKS.length],
          title: f.title ?? "",
          description: f.description ?? "",
        }));
      }
    } catch (e) {
      console.error("Failed to parse features_list from CMS:", e);
    }
  }

  const eyebrow = content?.features_eyebrow?.content || "Everything in one place";
  const sectionTitle = content?.features_section_title?.content || "Everything you need to succeed";
  const sectionSubtitle =
    content?.features_section_subtitle?.content ||
    "One connected platform that replaces the patchwork of tools beauty businesses are forced to juggle.";

  return (
    <div className="py-16 md:py-20 lg:py-28 bg-gradient-to-b from-white to-gray-50">
      <div className="container">
        <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
          <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-semibold tracking-tight text-secondary">
            {sectionTitle}
          </h2>
          {sectionSubtitle && (
            <p className="mt-4 text-base md:text-lg font-light leading-relaxed text-gray-600">
              {sectionSubtitle}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = feature.icon ?? ICON_FALLBACKS[index % ICON_FALLBACKS.length];
            return (
              <div
                key={index}
                className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-7 md:p-8 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_20px_50px_-20px_rgba(255,0,119,0.35)]"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[#FFE7F1]/60 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                />
                <div className="relative">
                  <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFE7F1] text-primary ring-1 ring-primary/10 transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-secondary">{feature.title}</h3>
                  <p className="text-[15px] font-light leading-relaxed text-gray-600">
                    {feature.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
