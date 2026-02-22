"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import UserImage from "./../../../../public/images/8aa5cbca-b607-4a45-bd0c-2d63a663aa30.webp";
import Image1 from "./../../../../public/images/svg-gobbler(3).svg";
import Badge from "./../../../../public/images/badge.svg";
import { Button } from "@/components/ui/button";
import Image2 from "./../../../../public/images/svg-gobbler(5).svg";
import Arrow from "./../../../../public/images/Arrow.svg";
import Link from "next/link";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

interface ProviderInfoProps {
  slug?: string;
  id?: string;
}

export default function ProviderInfo({ slug, id }: ProviderInfoProps) {
  const [provider, setProvider] = useState<any>(null);
  const [staff, _setStaff] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProviderData = async () => {
      if (!slug && !id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const providerSlug = slug || id;
        
        // Load provider
        const providerResponse = await fetch(`/api/public/providers/${providerSlug}`);
        if (providerResponse.ok) {
          const providerData = await providerResponse.json();
          const loadedProvider = providerData.data;
          setProvider(loadedProvider);

          // Load staff if provider is a salon (only for authenticated provider owners)
          // For public view, staff will be shown via PartnerTeam component
          // This component is mainly for provider info display
        }
      } catch (err) {
        console.error("Error loading provider data:", err);
        setError("Failed to load provider information");
      } finally {
        setIsLoading(false);
      }
    };

    loadProviderData();
  }, [slug, id]);

  // Calculate stats from provider data
  const infoData = provider ? [
    { value: provider.review_count?.toString() || "0", label: "Reviews" },
    { value: provider.rating?.toFixed(2) || "0.00", label: "Rating" },
    { value: provider.years_in_business?.toString() || "0", label: "Years beauty partner" },
  ] : [
    { value: "0", label: "Reviews" },
    { value: "0.00", label: "Rating" },
    { value: "0", label: "Years beauty partner" },
  ];

  // Use real staff data or empty array
  const teamMembers = staff.length > 0 ? staff.map((member) => ({
    name: member.full_name || member.name || "Team Member",
    image: member.avatar_url || UserImage,
  })) : [];

  const providerDetails = [
    { detail: "Response rate: 100%" },
    { detail: "Responds within an hour" },
  ];

  if (isLoading) {
    return (
      <div className="max-w-[2340px] mx-auto px-8">
        <LoadingTimeout loadingMessage="Loading provider information..." />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="max-w-[2340px] mx-auto px-8">
        <EmptyState
          title="Provider information unavailable"
          description={error || "Unable to load provider details"}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[2340px] mx-auto px-8">
      <div className="mb-12 lg:mb-14 border-b pb-16">
        <h2 className="text-[22px] font-normal  text-secondary mb-6">
          Meet your Provider
        </h2>
        <div className="flex-col lg:flex-row flex gap-9 lg:gap-28 max-w-full mx-auto">
          <div className="max-w-[379px] w-full">
            <Link href="/partner-owner-page">
              <div className="flex-row flex gap-20 py-3 pl-10 shadow-xl border items-center rounded-xl justify-center mb-8">
                <div className="relative w-full">
                  <div className="bg-muted h-8 w-8 justify-center items-center flex rounded-full absolute right-0 top-16">
                    <Image src={Badge} alt="" className="h-4 w-4" />
                  </div>
                  <div className="w-24 h-24 mb-2 rounded-full mx-auto overflow-hidden bg-gray-200 flex items-center justify-center">
                    {provider?.thumbnail_url ? (
                      <Image
                        src={provider.thumbnail_url}
                        alt={provider.business_name || "Provider"}
                        width={96}
                        height={96}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <p className="text-2xl font-bold text-gray-600">
                        {provider?.business_name?.charAt(0).toUpperCase() || "P"}
                      </p>
                    )}
                  </div>
                  <p className="text-3xl text-secondary font-bold text-center">
                    {provider?.business_name || "Provider"}
                  </p>
                  <div className="flex gap-1 justify-center">
                    <Image src={Image1} alt="" />
                    <p className="text-sm text-secondary font-normal  text-center">
                      Super Partner
                    </p>
                  </div>
                </div>
                <div className="w-full">
                  {infoData.map((item, index) => (
                    <div
                      key={index}
                      className={`mb-2 pb-2 ${
                        index === infoData.length - 1 ? "" : "border-b"
                      }`}
                    >
                      <p className="text-[22px] font-bold Beautonomi-bold text-secondary">
                        {item.value}
                      </p>
                      <p className="text-[10px] font-light  text-secondary">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Link>
            <Link href="/">
              <div className="flex gap-2 items-center border-b lg:border-none pb-8">
                <p className="underline text-base font-normal  text-secondary">
                  Show more
                </p>
                <Image src={Arrow} alt="" className="h-3 w-3" />
              </div>
            </Link>
          </div>
          <div className="">
            {provider && (
              <>
                <h2 className="text-lg font-normal  text-secondary mb-3">
                  {provider.business_name} {provider.is_verified ? "is a Verified Partner" : "is a Partner"}
                </h2>
                <p className="text-base font-light  text-secondary mb-6">
                  {provider.description || "Top Professionals are experienced, highly-rated experts dedicated to delivering exceptional beauty services."}
                </p>
                {teamMembers.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-normal  text-secondary mb-3">
                      Team Members
                    </h3>
                    {teamMembers.map((member, index) => (
                      <div key={index} className="flex items-center gap-3 mb-4">
                        <div className="rounded-full h-12 w-12 overflow-hidden bg-gray-200 flex items-center justify-center">
                          {typeof member.image === 'string' ? (
                            <Image
                              src={member.image}
                              alt={member.name}
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Image
                              src={member.image}
                              alt={member.name}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <p className="text-base font-light  text-secondary">
                          {member.name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="border-b pb-8 mb-7">
                  <h3 className="text-lg font-normal  text-secondary mb-3">
                    Provider details
                  </h3>
                  <div className="mb-8">
                    {providerDetails.map((detail, index) => (
                      <p
                        key={index}
                        className="text-base font-light  text-secondary"
                      >
                        {detail.detail}
                      </p>
                    ))}
                  </div>
                  <Button variant="default">Message Provider</Button>
                </div>
              </>
            )}
            <div className="flex gap-2 items-center">
              <Image src={Image2} alt="" className="h-6 w-6" />
              <p className="text-xs font-light  text-secondary">
                To protect your payment, never transfer money or communicate
                outside of the Beautonomi website or app.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
