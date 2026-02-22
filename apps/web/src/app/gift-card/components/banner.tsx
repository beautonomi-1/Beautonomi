"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

interface PageContent {
  [sectionKey: string]: {
    content: string;
    content_type: string;
    metadata: Record<string, any>;
  };
}

interface BannerProps {
  content?: PageContent | null;
}

export default function Banner({ content }: BannerProps) {
  // Get content from CMS or use defaults
  const bannerTitle = content?.banner_title?.content || "Gift cards for business";
  const bannerDescription = content?.banner_description?.content || "Show your appreciation for employees and customers with beauty and wellness gift cards that are easy to give for any occasion.";
  const bannerContactText = content?.banner_contact_text?.content || "For bulk orders, contact sales.";
  const salesEmail = content?.sales_email?.content || "sales@beautonomi.com";
  const getStartedButtonText = content?.get_started_button_text?.content || "Get started";
  const purchaseUrl = content?.purchase_url?.content || "/gift-card/purchase";
  const bannerImage = content?.banner_image?.content;
  const placeholderBusinessText = content?.placeholder_business_text?.content || "Business Gift Cards";

  return (
    <div className="pb-16 md:pb-24 lg:pb-28">
      <div className=" container">
        <div className="flex flex-col md:flex-row bg-primary pt-7 lg:pt-12 pb-10 items-center justify-between px-12 py-8 rounded-xl ">
          <div className="w-full">
            <h1 className="text-center md:text-start text-[40px] md:text-[52px] lg:text-6xl font-normal leading-[50px]  text-secondary mb-2 md:mb-8 lg:mb-9">
              {bannerTitle}
            </h1>
            <div className="hidden md:block">
            <p className="text-base lg:text-lg font-light  text-secondary max-w-80 mb-4">
              {bannerDescription}
            </p>
            <p className="text-base lg:text-lg font-light text-secondary max-w-72 mb-8">
              {bannerContactText.includes("contact sales") ? (
                <>
                  For bulk orders,{" "}
                  <a href={`mailto:${salesEmail}`} className=" font-light  underline">
                    contact sales
                  </a>
                  .
                </>
              ) : (
                bannerContactText
              )}
            </p>
            <Link href={purchaseUrl}>
              <Button variant="default" size="rounded">
                {getStartedButtonText}
              </Button>
            </Link>
          </div>
          </div>
          <div className="">
            {bannerImage ? (
              <img 
                src={typeof bannerImage === 'string' ? bannerImage : bannerImage} 
                alt="Gift cards" 
                className="w-full max-w-md h-auto rounded-lg"
              />
            ) : (
              <div className="w-full max-w-md h-[300px] rounded-lg bg-gradient-to-br from-[#FF0077] via-[#D60565] to-[#FF0077] flex items-center justify-center shadow-xl">
                <div className="text-center text-white">
                  <div className="text-5xl mb-3">💼</div>
                  <div className="text-2xl font-bold">{placeholderBusinessText}</div>
                </div>
              </div>
            )}
          </div>
          <div className="block md:hidden container">
        <div className="">
            <p className="text-base lg:text-lg font-light  text-secondary text-center mx-auto max-w-80 mb-4">
              {bannerDescription}
            </p>
            <p className="text-base lg:text-lg font-light text-secondary mx-auto text-center max-w-72 mb-8">
              {bannerContactText.includes("contact sales") ? (
                <>
                  For bulk orders,{" "}
                  <a href={`mailto:${salesEmail}`} className=" font-medium  underline">
                    contact sales
                  </a>
                  .
                </>
              ) : (
                bannerContactText
              )}
            </p>
            </div>
            <Link href={purchaseUrl} className="w-full block">
              <Button variant="default" size="rounded" className="w-full">
                {getStartedButtonText}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
