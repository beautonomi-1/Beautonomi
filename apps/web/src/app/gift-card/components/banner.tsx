"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { Briefcase, Check } from "lucide-react";
import { DEFAULT_GIFT_CARD_DESIGNS } from "./default-designs";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, unknown>;
  };
}

interface BannerProps {
  content?: PageContent | null;
}

export default function Banner({ content }: BannerProps) {
  const bannerTitle = content?.banner_title?.content || "Gift cards for business";
  const bannerDescription =
    content?.banner_description?.content ||
    "Show your appreciation for employees and customers with beauty and wellness gift cards that are easy to give for any occasion.";
  const bannerContactText = content?.banner_contact_text?.content || "For bulk orders, contact sales.";
  const salesEmail = content?.sales_email?.content || "sales@beautonomi.com";
  const getStartedButtonText = content?.get_started_button_text?.content || "Get started";
  const purchaseUrl = content?.purchase_url?.content || "/gift-card/purchase";
  const bulkPurchaseUrl = content?.bulk_purchase_url?.content || "/gift-card/purchase?bulk=true";
  const bannerImage = content?.banner_image?.content;

  const perks = ["Volume pricing", "Custom branding", "One simple invoice"];

  return (
    <section className="pb-16 md:pb-24 lg:pb-28">
      <div className="container">
        <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#FFE7F1] via-[#FFD6E7] to-[#FFC2DD]">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/40 blur-3xl"
          />
          <div className="relative grid items-center gap-10 px-7 py-10 md:grid-cols-2 md:px-12 md:py-14 lg:px-16">
            <div className="text-center md:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-sm font-medium text-secondary">
                <Briefcase className="h-4 w-4 text-primary" />
                For business
              </span>
              <h2 className="mt-5 text-[34px] leading-[1.05] text-secondary md:text-[48px] lg:text-[56px]">
                {bannerTitle}
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base text-secondary/70 md:mx-0 lg:text-lg">
                {bannerDescription}
              </p>

              <ul className="mx-auto mt-6 flex max-w-md flex-col gap-2.5 text-left md:mx-0">
                {perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-2.5 text-sm font-medium text-secondary/80">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="h-3 w-3" />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-sm text-secondary/70">
                {bannerContactText.includes("contact sales") ? (
                  <>
                    For bulk orders,{" "}
                    <a href={`mailto:${salesEmail}`} className="font-medium text-secondary underline underline-offset-4">
                      contact sales
                    </a>
                    .
                  </>
                ) : (
                  bannerContactText
                )}
              </p>

              <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row md:items-start md:justify-start justify-center">
                <Link href={bulkPurchaseUrl} className="w-full sm:w-auto">
                  <Button
                    variant="default"
                    size="rounded"
                    className="w-full shadow-lg shadow-secondary/15 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] sm:w-auto"
                  >
                    {getStartedButtonText}
                  </Button>
                </Link>
                <a href={`mailto:${salesEmail}`} className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="rounded"
                    className="w-full border-secondary/15 bg-white/60 text-secondary transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] sm:w-auto"
                  >
                    Talk to sales
                  </Button>
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              {bannerImage ? (
                <div className="relative aspect-[3/2] w-full overflow-hidden rounded-2xl shadow-xl">
                  <Image
                    src={typeof bannerImage === "string" ? bannerImage : (bannerImage as string)}
                    alt="Gift cards for business"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="relative aspect-square w-full max-w-sm mx-auto">
                  <div className="gift-float absolute left-[6%] top-[20%] w-[72%] rotate-[-8deg] [--gc-rot:-8deg] overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/5">
                    <Image
                      src={DEFAULT_GIFT_CARD_DESIGNS[4].src}
                      alt={DEFAULT_GIFT_CARD_DESIGNS[4].alt}
                      width={1200}
                      height={800}
                      className="h-auto w-full"
                      unoptimized
                    />
                  </div>
                  <div className="gift-float absolute right-[4%] top-[34%] w-[74%] rotate-[7deg] [--gc-rot:7deg] [animation-delay:1.1s] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/5">
                    <Image
                      src={DEFAULT_GIFT_CARD_DESIGNS[1].src}
                      alt={DEFAULT_GIFT_CARD_DESIGNS[1].alt}
                      width={1200}
                      height={800}
                      className="h-auto w-full"
                      unoptimized
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
