"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DEFAULT_GIFT_CARD_DESIGNS, type GiftCardDesign } from "./default-designs";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface PickingDesignsProps {
  content?: PageContent | null;
}

export default function PickingDesigns({ content }: PickingDesignsProps) {
  // Prefer CMS-managed designs, fall back to the on-brand defaults so the
  // gallery is always populated with polished artwork.
  let designs: GiftCardDesign[] = DEFAULT_GIFT_CARD_DESIGNS;

  if (content?.designs_list?.content_type === "json") {
    try {
      const parsedDesigns = JSON.parse(content.designs_list.content);
      if (Array.isArray(parsedDesigns) && parsedDesigns.length > 0) {
        designs = parsedDesigns.map((d: any, index: number) => ({
          id: index + 1,
          slug: d.slug || `design-${index + 1}`,
          src: d.image_url || d.src || "",
          alt: d.alt || d.title || `Design ${index + 1}`,
          title: d.title || d.name || d.alt || `Design ${index + 1}`,
          tagline: d.tagline || d.description || "",
        }));
      }
    } catch (e) {
      console.error("Failed to parse designs_list from CMS:", e);
    }
  }

  const sectionTitle = content?.picking_designs_title?.content || "Pick your design";
  const sectionSubtitle =
    content?.picking_designs_subtitle?.content ||
    "A design for every moment — customise the message and amount at checkout.";
  const purchaseUrl = content?.purchase_url?.content || "/gift-card/purchase";

  return (
    <section className="pb-20 md:pb-24 lg:pb-28">
      <div className="container">
        <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-[28px] text-secondary md:text-[40px]">{sectionTitle}</h2>
            <p className="mt-3 max-w-xl text-sm text-secondary/60 md:text-base">{sectionSubtitle}</p>
          </div>
          <Link
            href={purchaseUrl}
            className="hidden items-center gap-2 text-sm font-medium text-secondary underline-offset-4 hover:underline md:inline-flex"
          >
            See all designs
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Desktop grid */}
        <div className="hidden gap-6 md:grid md:grid-cols-2 lg:grid-cols-3">
          {designs.map((design) => (
            <DesignCard key={design.id} design={design} purchaseUrl={purchaseUrl} />
          ))}
        </div>

        {/* Mobile scroll-snap carousel */}
        <div className="-mx-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-8 pb-4 scrollbar-hide md:hidden">
          {designs.map((design) => (
            <div key={design.id} className="w-[78%] flex-none snap-center first:ml-0">
              <DesignCard design={design} purchaseUrl={purchaseUrl} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DesignCard({ design, purchaseUrl }: { design: GiftCardDesign; purchaseUrl: string }) {
  const href = design.slug
    ? `${purchaseUrl}${purchaseUrl.includes("?") ? "&" : "?"}template_id=${encodeURIComponent(design.slug)}`
    : purchaseUrl;

  return (
    <Link
      href={href}
      className="group block rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      aria-label={`Choose the ${design.title} gift card design`}
    >
      <div className="gift-sheen relative aspect-[3/2] overflow-hidden rounded-[20px] shadow-md ring-1 ring-black/5 transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-xl">
        {design.src ? (
          <Image
            src={design.src}
            alt={design.alt}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            sizes="(max-width: 768px) 78vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077]">
            <span className="text-lg font-semibold text-white">{design.title}</span>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-secondary">{design.title}</p>
          {design.tagline ? <p className="text-sm text-secondary/55">{design.tagline}</p> : null}
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/5 text-secondary transition-colors group-hover:bg-primary group-hover:text-white">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
