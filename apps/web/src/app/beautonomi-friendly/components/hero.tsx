"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { FriendlyPageContent } from "../page";

function sectionText(content: FriendlyPageContent | null | undefined, key: string) {
  return content?.[key]?.content?.trim() ?? "";
}

const DEFAULT_LINES = ["Introducing", "Beautonomi-friendly", "apartments"];

interface AirFriendlyHeroProps {
  content?: FriendlyPageContent | null;
}

export default function AirFriendlyHero({ content = null }: AirFriendlyHeroProps) {
  const rawTitle = sectionText(content, "hero_title");
  const lines = rawTitle
    ? rawTitle.split(/\n+/).map((s) => s.trim()).filter(Boolean)
    : DEFAULT_LINES;
  const subtitle =
    sectionText(content, "hero_subtitle") ||
    "Rent a place to live. Beautonomi it part-time.";
  const ctaLabel = sectionText(content, "cta_label") || "Explore near you";
  const ctaHref = sectionText(content, "cta_href") || "/explore";

  return (
    <div className=" mb-24">
      <div className="container ">
        <h1 className="text-secondary text-center text-5xl md:text-[56px] lg:text-[88px]  font-normal leading-[50px] lg:leading-[90px] mb-8">
          {lines.map((line, i) => (
            <span key={`${line}-${i}`}>
              {i > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </h1>
        <p className="text-lg lg:text-[28px] font-normal  text-secondary mb-14 text-center">
          {subtitle}
        </p>
        <Button variant="default" className="mx-auto flex" asChild>
          <Link href={ctaHref}>{ctaLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
