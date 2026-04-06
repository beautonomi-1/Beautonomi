import BeautonomiHeader from "@/components/layout/beautonomi-header";
import BottomNav from "@/components/layout/bottom-nav";
import Footer from "@/components/layout/footer";
import React from "react";
import HottestPicks from "./hottest-pick-cards";

const page = () => {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 w-full max-w-full">
      <BeautonomiHeader />
      <HottestPicks />
      <Footer />
      <BottomNav />
    </div>
  );
};

export default page;
