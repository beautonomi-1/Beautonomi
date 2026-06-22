"use client";

import { Palette, PenLine, Sparkles } from "lucide-react";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, unknown>;
  };
}

interface HowItWorksProps {
  content?: PageContent | null;
}

const ICONS = [Palette, PenLine, Sparkles];

const DEFAULT_STEPS = [
  {
    title: "Choose a design & amount",
    description: "Pick from beautiful, on-brand designs and set any amount that suits the occasion.",
  },
  {
    title: "Add a personal message",
    description: "Make it theirs with a heartfelt note, then send instantly by email or keep the code to share yourself.",
  },
  {
    title: "They redeem & glow",
    description: "Recipients apply the balance at checkout on any beauty or wellness service — credit never expires.",
  },
];

export default function HowItWorks({ content }: HowItWorksProps) {
  const sectionTitle = content?.how_it_works_title?.content || "Gifting in three simple steps";
  const sectionSubtitle =
    content?.how_it_works_subtitle?.content ||
    "Thoughtful from purchase to glow-up — no plastic, no waiting, no fuss.";

  let steps = DEFAULT_STEPS;
  if (content?.how_it_works_steps?.content_type === "json") {
    try {
      const parsed = JSON.parse(content.how_it_works_steps.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        steps = parsed;
      }
    } catch (e) {
      console.error("Failed to parse how_it_works_steps from CMS:", e);
    }
  }

  return (
    <section className="pb-20 md:pb-24 lg:pb-28">
      <div className="container">
        <div className="rounded-[28px] bg-secondary px-6 py-14 md:px-12 md:py-16 lg:px-16">
          <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
            <h2 className="text-[28px] text-white md:text-[40px]">{sectionTitle}</h2>
            <p className="mt-3 text-sm text-white/65 md:text-base">{sectionSubtitle}</p>
          </div>

          <ol className="grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((step, index) => {
              const Icon = ICONS[index % ICONS.length];
              return (
                <li key={index} className="relative text-center md:text-left">
                  <div className="mb-5 flex items-center justify-center gap-3 md:justify-start">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-hover text-white shadow-lg shadow-primary/30">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold tracking-wide text-white/40">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="text-lg font-medium text-white md:text-xl">{step.title}</h3>
                  <p className="mt-2 text-sm text-white/65 md:text-base">{step.description}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
