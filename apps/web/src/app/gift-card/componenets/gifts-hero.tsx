import { Button } from "@/components/ui/button";
import React from "react";
import Card from "./../../../../public/images/79383f7d-eb81-4812-8329-6873016de155.webp";
import Card1 from "./../../../../public/images/0a5aa85a-9ccb-4798-8b0d-be514b25adbf.jpeg";
import Image from "next/image";
import Link from "next/link";

const GiftsHero = () => {
  return (
    <div className="pb-20 md:pb-24 lg:pb-16">
    <div className="container">
      <div className="mb-14">
        <h2 className="text-[56px] md:text-[100px] lg:text-[128px] font-normal  text-secondary max-w-80 md:max-w-2xl leading-[50px] md:leading-[90px] lg:leading-[130px] mx-auto text-center mb-10 lg:mb-14">
        Beautonomi gift cards
        </h2>
        <div className="text-center mb-14 lg:mb-20">
          <Link href="/gift-card/purchase">
            <Button variant="secondary" size="rounded">
              Buy now
            </Button>
          </Link>
        </div>
        <div className="relative  mx-auto">
          <Image src={Card1} alt="Card Background"  className="z-10 w-[900px] h-[650px] mx-auto" />
          <Image src={Card} alt="Card Overlay"  className="absolute inset-0  w-[900px] h-[650px] mx-auto" />
        </div>
      </div>
      <div className="text-center">
        <h2 className="text-[32px] md:text-[52px] lg:text-6xl font-normal  text-secondary mb-4 md:mb-9 lg:mb-12">
          You give. They glow.
        </h2>
        <p className="tex-sm md:text-base lg:text-lg  text-secondary font-normal max-w-2xl mx-auto mb-3 lg:mb-5">
          Bring the world of Beautonomi to friends and family. Celebrate holidays,
          recognize important moments, and treat them to beauty and wellness services. 
          Perfect for any occasion, since they never expire.
        </p>
        <p className="text-sm md:text-base lg:text-lg  text-secondary font-normal mb-1 lg:mb-3">
          Purchasing for business?
        </p>
        <Link className="underline" href="/gift-card/purchase">
          Buy gift cards in bulk
        </Link>
      </div>
    </div>
    </div>
  );
};

export default GiftsHero;
