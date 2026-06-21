"use client";

import React from "react";
import { Heart, Rocket, Wand2 } from "lucide-react";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface StorySectionProps {
  content?: PageContent | null;
}

const PILLAR_ICONS = [Heart, Wand2, Rocket];

type Pillar = { title: string; description: string };

export default function StorySection({ content }: StorySectionProps) {
  const eyebrow = content?.story_eyebrow?.content || "Why we built Beautonomi";
  const title =
    content?.story_title?.content ||
    "Beauty professionals deserve software as beautiful as their work.";
  const description =
    content?.story_description?.content ||
    "Most beauty business tools are clunky, slow, and get in the way. We started Beautonomi to change that — pairing modern, delightful design with the serious tools you need to run and grow a thriving business. No compromises.";

  let pillars: Pillar[] = [
    { title: "Made with care", description: "Every detail crafted around how beauty pros actually work." },
    { title: "Beautifully simple", description: "Powerful capability, without the complexity or clutter." },
    { title: "Built for growth", description: "From your first booking to your tenth location — we scale with you." },
  ];

  if (content?.story_pillars?.content_type === "json") {
    try {
      const parsed = JSON.parse(content.story_pillars.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        pillars = parsed;
      }
    } catch (e) {
      console.error("Failed to parse story_pillars from CMS:", e);
    }
  }

  return (
    <div className="pb-16 md:pb-24 lg:pb-28">
      <div className="container">
        <div className="relative overflow-hidden rounded-3xl bg-secondary px-6 py-14 md:px-12 md:py-20 lg:px-16">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
            <div className="absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-primary/20 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
            <h2 className="text-[clamp(1.75rem,4vw,3rem)] font-semibold leading-tight tracking-tight text-white">
              {title}
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-base md:text-lg font-light leading-relaxed text-white/70">
              {description}
            </p>
          </div>

          <div className="relative mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3 md:mt-16">
            {pillars.map((pillar, index) => {
              const Icon = PILLAR_ICONS[index % PILLAR_ICONS.length];
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.07]"
                >
                  <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/20 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-white">{pillar.title}</h3>
                  <p className="text-sm font-light leading-relaxed text-white/60">{pillar.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
