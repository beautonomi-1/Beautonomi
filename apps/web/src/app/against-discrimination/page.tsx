import React from "react";
import ProjectLighthouse from "./components/project-lighthouse";
import WhatChanged from "./components/what-changed";
import CommunityCommitment from "./components/community-commitment";
import ReportsandPartners from "./components/reports-partners";
import Hero from "./components/hero";

const page = () => {
  return (
    <div>
      <Hero />
      <ProjectLighthouse />
      <WhatChanged />
      <CommunityCommitment />
      <ReportsandPartners />
    </div>
  );
};

export default page;
