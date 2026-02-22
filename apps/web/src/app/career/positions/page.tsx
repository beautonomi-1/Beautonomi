import React from "react";
import JobsGrid from "./components/job-grid";
import JobSearch from "./components/job-search";
import NonPermanentContractor from "./components/non-permanent-contractor";
import Navbar3 from "@/components/global/Navbar3";

const page = () => {
  return (
    <div>
      <div className="">
        <Navbar3 />
      </div>
      <JobSearch />
      <JobsGrid />
      <NonPermanentContractor />
    </div>
  );
};

export default page;
