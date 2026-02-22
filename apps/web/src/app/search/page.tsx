"use client";
import React, { Suspense } from "react";
import BeautonomiHeader from "@/components/layout/beautonomi-header";
import SearchResults from "./components/search-results";
import BottomNav from "@/components/layout/bottom-nav";
import Footer from "@/components/layout/footer";

const PageContent = () => {
  return (
    <div className="min-h-screen bg-white pb-20 md:pb-0 overflow-x-hidden w-full max-w-full">
      <BeautonomiHeader />
      <SearchResults />
      <Footer />
      <BottomNav />
    </div>
  );
};

const Page = () => {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PageContent />
    </Suspense>
  );
};

export default Page;
