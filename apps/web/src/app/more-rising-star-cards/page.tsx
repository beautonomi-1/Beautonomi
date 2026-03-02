import React from "react";
import Navbar from "@/components/layout/navbar";
import Footer from "@/components/layout/footer";
import RisingStarCards from "./rising-star-cards";

export default function Page() {
  return (
    <div>
      <Navbar />
      <RisingStarCards />
      <Footer />
    </div>
  );
}
