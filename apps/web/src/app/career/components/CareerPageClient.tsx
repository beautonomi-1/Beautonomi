"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePageContent } from "@/lib/cms/usePageContent";
import {
  DEFAULT_CAREERS_PORTAL_URL,
  DEFAULT_CAREER_HERO_CTA_LABEL,
  DEFAULT_CAREER_HERO_EYEBROW,
  DEFAULT_CAREER_HERO_SUBTITLE,
  DEFAULT_CAREER_HERO_TITLE,
  validateCareersPortalUrl,
} from "@/lib/cms/career-cms-constants";
import CareerNavbar from "./navbar";
import NonPermanentContractor from "../positions/components/non-permanent-contractor";
import Image1 from "../../../../public/images/homepage-hero1b.webp";
import Image2 from "../../../../public/images/homepage-hero2b.webp";
import Image3 from "../../../../public/images/homepage-hero3b.webp";

type ValueCard = {
  title?: string;
  blurb?: string;
  image_url?: string;
  cta_label?: string;
};

type HighlightCard = { title?: string; blurb?: string };

type CarouselSlide = { image_url?: string; alt?: string };

const HERO_SUBTITLE_MAX = 160;

const DEFAULT_VALUE_CARDS: ValueCard[] = [
  {
    title: "Flexibility",
    blurb: "Work in a way that fits your life, where regulations allow.",
  },
  {
    title: "Belonging",
    blurb: "A team where different backgrounds and ideas help us all grow.",
  },
  {
    title: "Impact",
    blurb: "Ship products millions use to book and deliver beauty services.",
  },
];

const DEFAULT_HIGHLIGHTS: HighlightCard[] = [
  { title: "Craft", blurb: "Design and engineering that feel effortless." },
  { title: "Trust", blurb: "Safety and quality are non-negotiable." },
  { title: "Momentum", blurb: "Small teams, clear goals, fast learning." },
];

const FALLBACK_CAROUSEL: CarouselSlide[] = [
  { image_url: "__local1", alt: "Team and workspace" },
  { image_url: "__local2", alt: "Collaboration" },
  { image_url: "__local3", alt: "Community" },
];

function parseJsonArray<T>(raw: string | undefined, fallback: T[]): T[] {
  if (!raw?.trim()) return fallback;
  try {
    const p = JSON.parse(raw) as unknown;
    return Array.isArray(p) ? (p as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function clampSubtitle(s: string): string {
  const t = s.trim();
  if (t.length <= HERO_SUBTITLE_MAX) return t;
  return `${t.slice(0, HERO_SUBTITLE_MAX - 1).trim()}…`;
}

function CmsRemoteImage({
  src,
  alt,
  className,
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      sizes="(max-width: 768px) 100vw, 33vw"
      className={className}
    />
  );
}

export default function CareerPageClient() {
  const { getSectionContent, isLoading, error } = usePageContent("career");

  const portalUrl =
    validateCareersPortalUrl(getSectionContent("careers_portal_url")) ??
    DEFAULT_CAREERS_PORTAL_URL;

  const heroEyebrow =
    getSectionContent("hero_eyebrow")?.trim() || DEFAULT_CAREER_HERO_EYEBROW;
  const heroTitle =
    getSectionContent("hero_title")?.trim() || DEFAULT_CAREER_HERO_TITLE;
  const heroSubtitle = clampSubtitle(
    getSectionContent("hero_subtitle")?.trim() || DEFAULT_CAREER_HERO_SUBTITLE,
  );
  const heroCta =
    getSectionContent("hero_cta_label")?.trim() || DEFAULT_CAREER_HERO_CTA_LABEL;

  const valueCardsRaw = parseJsonArray<ValueCard>(
    getSectionContent("value_cards"),
    [],
  );
  const valueCards =
    valueCardsRaw.length > 0
      ? valueCardsRaw.filter((c) => c.title?.trim())
      : DEFAULT_VALUE_CARDS;

  const highlightsRaw = parseJsonArray<HighlightCard>(
    getSectionContent("highlight_cards"),
    [],
  );
  const highlights =
    highlightsRaw.length > 0
      ? highlightsRaw.filter((c) => c.title?.trim())
      : DEFAULT_HIGHLIGHTS;

  const slidesRaw = parseJsonArray<CarouselSlide>(
    getSectionContent("carousel_slides"),
    [],
  );
  const slidesWithUrls = slidesRaw.filter((s) => s.image_url?.trim());
  const useFallbackCarousel = slidesWithUrls.length === 0;

  const localByKey: Record<string, typeof Image1> = {
    __local1: Image1,
    __local2: Image2,
    __local3: Image3,
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <CareerNavbar />

      {error ? (
        <div className="container py-8 text-center text-sm text-red-600">
          {error}
        </div>
      ) : null}

      <main className="pb-24">
        {/* Hero */}
        <section className="container px-4 pt-8 md:pt-12">
          <div className="mx-auto max-w-3xl rounded-3xl border border-black/[0.06] bg-white p-8 shadow-sm md:p-12 md:text-center">
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="mx-auto h-3 w-24 rounded-full bg-muted md:mx-auto" />
                <div className="h-10 w-full max-w-md rounded-xl bg-muted md:mx-auto" />
                <div className="h-4 w-full rounded-lg bg-muted" />
                <div className="h-4 w-3/4 rounded-lg bg-muted md:mx-auto" />
                <div className="h-11 w-40 rounded-full bg-muted md:mx-auto" />
              </div>
            ) : (
              <>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-pink-600">
                  {heroEyebrow}
                </p>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-900 md:text-4xl">
                  {heroTitle}
                </h1>
                <p className="mt-4 text-base leading-relaxed text-neutral-600 md:text-lg">
                  {heroSubtitle}
                </p>
                <div className="mt-8 flex flex-wrap gap-3 md:justify-center">
                  <Button
                    asChild
                    className="rounded-full bg-gradient-to-r from-[#FF0077] to-[#D60565] px-8 text-base shadow-md"
                  >
                    <Link href={portalUrl}>{heroCta}</Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-full border-neutral-200 px-6"
                  >
                    <Link href={portalUrl}>Browse all listings</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Carousel strip */}
        <section
          id="life-at"
          className="container scroll-mt-24 mt-14 px-4"
        >
          <h2 className="mb-6 text-center text-xl font-semibold text-neutral-900 md:text-2xl">
            Life at Beautonomi
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
            {(useFallbackCarousel ? FALLBACK_CAROUSEL : slidesWithUrls).map(
              (slide, i) => {
                const key = slide.image_url ?? `slide-${i}`;
                const alt = slide.alt?.trim() || "Beautonomi";
                const local = key.startsWith("__local")
                  ? localByKey[key]
                  : null;
                return (
                  <div
                    key={`${key}-${i}`}
                    className="relative min-w-[85vw] shrink-0 overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-sm sm:min-w-[320px] md:min-w-0"
                  >
                    <div className="relative aspect-[16/10] w-full">
                      {local ? (
                        <Image
                          src={local}
                          alt={alt}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 85vw, 33vw"
                          priority={i === 0}
                        />
                      ) : (
                        <CmsRemoteImage
                          src={key}
                          alt={alt}
                          className="object-cover"
                          priority={i === 0}
                        />
                      )}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </section>

        {/* Value cards */}
        <section className="mt-20 bg-neutral-900 py-16 text-white">
          <div className="container px-4">
            <h2 className="mb-10 text-center text-xl font-semibold md:text-2xl">
              Why join us
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {valueCards.map((card, i) => (
                <div
                  key={`${card.title}-${i}`}
                  className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-lg backdrop-blur-sm"
                >
                  {card.image_url?.trim() ? (
                    <div className="relative aspect-[16/10] w-full overflow-hidden">
                      <CmsRemoteImage
                        src={card.image_url.trim()}
                        alt={card.title ?? ""}
                        className="object-cover"
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="text-lg font-semibold">{card.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-white/80">
                      {card.blurb}
                    </p>
                    {card.cta_label?.trim() ? (
                      <Button
                        asChild
                        variant="secondary"
                        className="mt-4 w-fit rounded-full"
                      >
                        <Link href={portalUrl}>{card.cta_label.trim()}</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section className="container mt-16 px-4">
          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map((h, i) => (
              <div
                key={`${h.title}-${i}`}
                className="rounded-2xl border border-black/[0.06] bg-white p-6 shadow-sm"
              >
                <h3 className="text-base font-semibold text-neutral-900">
                  {h.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {h.blurb}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex justify-center">
            <Button
              asChild
              className="rounded-full bg-gradient-to-r from-[#FF0077] to-[#D60565] px-10 text-base"
            >
              <Link href={portalUrl}>See open roles</Link>
            </Button>
          </div>
        </section>

        <section className="container mt-8 px-4">
          <NonPermanentContractor portalUrl={portalUrl} />
        </section>
      </main>
    </div>
  );
}
