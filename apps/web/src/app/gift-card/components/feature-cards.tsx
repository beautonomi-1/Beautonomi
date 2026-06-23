"use client";

import * as React from "react";
import { Palette, Send, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface FeatureCardsProps {
  content?: PageContent | null;
}

const ICONS: LucideIcon[] = [Palette, Send, InfinityIcon];

export default function FeatureCards({ content }: FeatureCardsProps) {
  let features = [
    {
      title: "Beautiful designs",
      description:
        "Gift cards are customisable with your choice of design, personal message, and gift amount.",
    },
    {
      title: "Easy to send",
      description:
        "Arrives within minutes via text or email — and we'll confirm the moment it's received.",
    },
    {
      title: "Never expires",
      description:
        "Gift credit is ready whenever they are, for any beauty and wellness service on Beautonomi.",
    },
  ];

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

  const sectionTitle = content?.features_section_title?.content || "Why Beautonomi gift cards";

  return (
    <section className="pb-16 md:pb-20 lg:pb-28">
      <div className="container">
        <h2 className="mb-8 text-center text-[28px] text-secondary md:mb-12 md:text-[40px]">
          {sectionTitle}
        </h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {features.map((feature, index) => {
            const Icon = ICONS[index % ICONS.length];
            return (
              <div
                key={index}
                className="group rounded-[20px] border border-secondary/10 bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-xl md:p-8"
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mb-2 text-xl text-secondary md:text-[22px]">{feature.title}</h3>
                <p className="text-sm text-secondary/65 md:text-base">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
