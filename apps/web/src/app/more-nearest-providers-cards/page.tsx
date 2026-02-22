import React from "react";
import Cards from "./cards";
import Footer from "@/components/layout/footer";
import BeautonomiHeader from "@/components/layout/beautonomi-header";

const page = () => {
  return (
    <div>
      <BeautonomiHeader />
      <Cards />
      <Footer />
    </div>
  );
};

export default page;
