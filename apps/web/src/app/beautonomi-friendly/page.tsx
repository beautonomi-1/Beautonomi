import React from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import AirFriendlyHero from "./components/hero";
import TheCarousel from "./components/carousel";
import GetStarted from "./components/get-started";
import OtherCities from "./components/other-cities";
import FAQ from "@/components/global/faq";

const page = () => {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <AirFriendlyHero />
      <TheCarousel />
      <GetStarted />
      <div className="mb-40">
        <FAQ applyBgPrimary={false} />
      </div>
      <OtherCities />
      <Footer />
      <BottomNav />
    </div>
  );
};

export default page;
