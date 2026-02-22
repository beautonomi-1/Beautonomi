"use client";

import React, { useState } from "react";
import PartnerNavbar from "./components/partner-navbar";
import PartnerHero from "./components/partner-hero";
import PortalMockup from "./components/portal-mockup";
import RatingSection from "./components/rating-section";
import WhyDifferentSection from "./components/why-different-section";
import FeaturesSection from "./components/features-section";
import CTASection from "./components/cta-section";
import FAQ from "@/components/global/faq";
import Footer from "@/components/layout/footer";

export default function BecomeAPartnerPage() {
  const [activeTab, setActiveTab] = useState("CALENDAR");

  return (
    <div className="min-h-screen bg-white">
      <PartnerNavbar />
      <PartnerHero activeTab={activeTab} setActiveTab={setActiveTab} />
      <PortalMockup activeTab={activeTab} />
      <RatingSection />
      <WhyDifferentSection />
      <FeaturesSection />
      <CTASection />
      <FAQ applyBgPrimary={true} />
      <Footer />
    </div>
  );
}
