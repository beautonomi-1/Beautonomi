import React from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import BottomNav from "@/components/layout/bottom-nav";
import Footer from "@/components/layout/footer";
import RisingStarCards from "./rising-star-cards";

export default function Page() {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />
      <RisingStarCards />
      <Footer />
      <BottomNav />
    </div>
  );
}
