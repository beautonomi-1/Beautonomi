"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import CityWaitlistModal from "@/components/city-waitlist-modal";

export default function OtherCities() {
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);

  return (
    <>
      <div className="container">
        <div className="mb-20 lg:mb-24 w-full">
          <h1 className="mb-11 text-[26px] lg:text-5xl max-w-2xl font-semibold text-secondary leading-8 lg:leading-[52px]">
            Beautonomi in your city
          </h1>
          <p className="text-lg font-normal text-secondary max-w-2xl mb-10">
            Browse beauty and wellness providers on Beautonomi, or join the waitlist if we have not launched in your area yet.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="default" asChild>
              <Link href="/search">Find a provider</Link>
            </Button>
            <p className="text-lg font-normal text-secondary">Don&apos;t see your city?</p>
            <Button variant="destructive" size="sm" onClick={() => setIsWaitlistModalOpen(true)}>
              Join the waitlist
            </Button>
          </div>
        </div>
      </div>
      <CityWaitlistModal open={isWaitlistModalOpen} onOpenChange={setIsWaitlistModalOpen} />
    </>
  );
}
