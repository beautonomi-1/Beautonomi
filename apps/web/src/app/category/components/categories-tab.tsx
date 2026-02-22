"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import Link from "next/link";
import Image from "next/image";
import Chevron from './../../../../public/images/chevron-down-svgrepo-com(1).svg';

const tabs = [
  { value: "step1", label: "Popular" },
  { value: "step2", label: "Historic" },
  { value: "step3", label: "Coastal" },
  { value: "step4", label: "Islands" },
  { value: "step5", label: "Lakes" },
  { value: "step6", label: "Unique Stays" },
  { value: "step7", label: "Categories" },
  { value: "step8", label: "Things to do" },
];

const destinationsData = {
  step1: [
    { name: "Ras Al-Khaimah", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Bur Dubai", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Jumeirah Beach", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Al Ain", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Bluewaters Island", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Abu Dhabi", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Palm Jumeirah", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Muscat", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Doha", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Sharjah", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Burj Khalifa Lake", type: "Salons & Beauty Parlors", path: "/" },
    { name: "Doha", type: "Salons & Beauty Parlors", path: "/" },
  ],
  step2: [
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Ajman", path: "/" },
  ],
  step3: [
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Australia", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
  ],
  step4: [
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Australia", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
  ],
  step5: [
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Australia", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
  ],
  step6: [
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Australia", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
  ],
  step7: [
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Australia", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
  ],
  step8: [
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United States", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "Australia", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
    { name: "Salons & Beauty Parlors", type: "United Kingdom", path: "/" },
  ],
 
};

const CategoriesTab = () => {
  const [activeTab, setActiveTab] = useState("step1");
  const [visibleCount, setVisibleCount] = useState(17);

  const handleShowMore = () => {
    setVisibleCount((prevCount) => prevCount + 10);
  };

  return (
    <div className="bg-[#F7F7F7] py-10 mt-14">
    <div className="mb-4 md:mb-8 max-w-[1180px] mx-auto">
        <h2 className="text-[22px] font-normal text-secondary mb-6">Salons for the Future Visits</h2>
      <div className="">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="w-full">
            <div
              className="overflow-x-auto whitespace-nowrap"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <div className="mb-8">
                <TabsList className="flex gap-5 border-b">
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={`py-2 font-light  ${
                        activeTab === tab.value
                          ? "border-b-2 border-black text-black text-sm"
                          : "border-b-2 border-transparent text-sm text-destructive"
                      }`}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>
          </div>

          {tabs.map((tab) => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="w-full"
            >
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                {
                //@ts-ignore 
                destinationsData[tab.value].slice(0, visibleCount).map((destination, index) => (
                  <div key={index}>
                    <Link href={destination.path}>
                      <div>
                        <p className="text-sm font-normal text-secondary">
                          {destination.name}
                        </p>
                        <p className="text-sm font-light text-[#6A6A6A]">
                          {destination.type}
                        </p>
                      </div>
                    </Link>
                  </div>
                ))}
                {
                //@ts-ignore 
                visibleCount < destinationsData[tab.value].length && (
                  <div className="col-span-1 col-start-6 flex gap-1 items-center">
                    <button onClick={handleShowMore}>
                      Show More
                    </button>
                    <Image src={Chevron} alt="" className="h-5 w-5"/>
                  </div>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
    </div>
  );
};

export default CategoriesTab;
