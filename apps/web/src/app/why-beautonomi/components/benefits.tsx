"use client";

import React from "react";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { CustomerHomeScreen } from "@/components/mockups/screens/customer-mobile";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface BenefitsProps {
  content?: PageContent | null;
}

export default function Benefits({ content }: BenefitsProps) {
  let benefits = [
    "Easy booking management",
    "Secure payment processing",
    "Client relationship management",
    "Automated reminders",
    "Business analytics & insights",
    "Mobile-friendly platform",
  ];

  if (content?.benefits_list?.content_type === "json") {
    try {
      const parsedBenefits = JSON.parse(content.benefits_list.content);
      if (Array.isArray(parsedBenefits) && parsedBenefits.length > 0) {
        benefits = parsedBenefits;
      }
    } catch (e) {
      console.error("Failed to parse benefits_list from CMS:", e);
    }
  }

  const eyebrow = content?.benefits_eyebrow?.content || "Loved by professionals";
  const sectionTitle = content?.benefits_title?.content || "Why choose Beautonomi?";
  const sectionDescription =
    content?.benefits_description?.content ||
    "Join thousands of beauty professionals who trust Beautonomi to power their bookings, payments, and client relationships — every single day.";
  const ctaText = content?.benefits_cta_text?.content || "Start your journey";
  const ctaUrl = content?.benefits_cta_url?.content || "/signup?type=provider";
  const benefitsImage = content?.benefits_image?.content;

  return (
    <div className="pb-16 md:pb-24 lg:pb-28">
      <div className="container">
        <div className="flex flex-col items-center justify-between gap-10 lg:flex-row lg:gap-16">
          <div className="w-full lg:w-1/2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
            <h2 className="text-[clamp(1.875rem,4vw,3.5rem)] font-semibold tracking-tight text-secondary">
              {sectionTitle}
            </h2>
            <p className="mt-4 text-base md:text-lg font-light leading-relaxed text-gray-600">
              {sectionDescription}
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {benefits.map((benefit, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 transition-colors hover:border-primary/30"
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#FFE7F1] text-primary">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-sm font-medium text-secondary">{benefit}</span>
                </div>
              ))}
            </div>

            <Link href={ctaUrl} className="mt-9 inline-block">
              <Button
                variant="secondary"
                size="rounded"
                className="bg-gradient-to-r from-[#FF0077] to-[#D60565] px-8 text-white shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] hover:from-[#D60565] hover:to-[#FF0077]"
              >
                {ctaText}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="flex w-full justify-center lg:w-1/2">
            {benefitsImage ? (
              <div className="relative h-[420px] w-full max-w-[520px] overflow-hidden rounded-3xl shadow-2xl md:h-[520px]">
                <Image src={benefitsImage} alt={sectionTitle} fill className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="relative w-full max-w-[480px]">
                <div
                  aria-hidden
                  className="absolute inset-0 -z-0 rounded-[2.5rem] bg-gradient-to-br from-[#FFE7F1] via-[#FFE7F1]/40 to-transparent blur-2xl"
                />
                <div className="relative z-10 py-4">
                  <CustomerHomeScreen />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
