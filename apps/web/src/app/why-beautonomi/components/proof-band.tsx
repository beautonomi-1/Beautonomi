"use client";

import React from "react";
import { CalendarCheck, ShieldCheck, Smartphone, Sparkles } from "lucide-react";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface ProofBandProps {
  content?: PageContent | null;
}

type ProofStat = { value: string; label: string };

const ICONS = [CalendarCheck, ShieldCheck, Smartphone, Sparkles];

export default function ProofBand({ content }: ProofBandProps) {
  let stats: ProofStat[] = [
    { value: "24/7", label: "Online booking that never sleeps" },
    { value: "Bank-grade", label: "Secure payments & protected payouts" },
    { value: "Mobile + Web", label: "Run your business from anywhere" },
    { value: "Rated #1", label: "By beauty professionals" },
  ];

  if (content?.proof_stats?.content_type === "json") {
    try {
      const parsed = JSON.parse(content.proof_stats.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        stats = parsed;
      }
    } catch (e) {
      console.error("Failed to parse proof_stats from CMS:", e);
    }
  }

  return (
    <div className="border-y border-gray-100 bg-gradient-to-b from-gray-50/80 to-white">
      <div className="container py-10 md:py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = ICONS[index % ICONS.length];
            return (
              <div key={index} className="flex flex-col items-center text-center">
                <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFE7F1] text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="text-xl font-semibold tracking-tight text-secondary md:text-2xl">
                  {stat.value}
                </p>
                <p className="mt-1 max-w-[14rem] text-sm leading-snug text-gray-500">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
