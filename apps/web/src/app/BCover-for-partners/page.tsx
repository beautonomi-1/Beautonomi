import React from "react";
import AirCoverFeatures from "./components/aircover-features";
import FAQ from "@/components/global/faq";
import HostHero from "./components/host-hero";
import ProtectedWork from "./components/protected-work";
import Navbar from "@/components/global/Navbar";
import Cta from "./components/cta";
import AirCoverTable from "../become-a-partner/aircover-table";

const page = () => {
  return (
    <div>
      <div className="-mb-20">
        <Navbar />
      </div>
      <HostHero />
      <AirCoverFeatures />
      <AirCoverTable />
      <ProtectedWork />
      <div className="">
        <FAQ applyBgPrimary={true} />
      </div>
      <Cta />
    </div>
  );
};

export default page;
