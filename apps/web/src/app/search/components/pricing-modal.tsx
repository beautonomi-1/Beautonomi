'use client'
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import Image from "next/image";
import CloseIcon from "./../../../../public/images/close-icon.svg";
import PriceRangeComponent from "./price-range";
import { Button } from "@/components/ui/button";
3
const tabs = [
  { value: "step1", label: "Any type" },
  { value: "step2", label: "Room" },
  { value: "step3", label: "Entire home" },
];

const PricingModal = () => {
  const [activeTab, setActiveTab] = useState("step1");
  const [isOpen, setIsOpen] = useState(true); // Add state to control modal visibility

  const handleClosePopup = () => {
    setIsOpen(false); // Update this function to close the modal
  };

  if (!isOpen) return null; // Conditionally render modal

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div className="relative bg-white pb-8 pt-5 rounded-lg max-w-xl w-full">
        <div className="max-h-[80vh] overflow-y-auto px-6 mb-20">
          <div className="border-b mb-7 pb-4 flex items-center">
            <Image
              src={CloseIcon}
              alt="Close"
              onClick={handleClosePopup}
              className="h-5 w-5 cursor-pointer"
            />
            <p className="text-base font-bold mx-auto">Filters</p>
          </div>
          <div>
            <p className="text-medium font-medium text-secondary mb-6">
              Types of place
            </p>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="w-full">
              <div
                className="overflow-x-auto whitespace-nowrap"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                <div className="">
                  <TabsList className="grid grid-cols-3 gap-5 border p-1 rounded-lg border-b mb-8">
                    {tabs.map((tab) => (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        className={`py-2 ${
                          activeTab === tab.value
                            ? "border-black text-black text-sm border-2 py-3 px-8 rounded-lg bg-primary"
                            : "text-sm font-medium text-secondary"
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
                className="w-full overflow-x-auto"
              >
                {tab.value === "step1" ? <PriceRangeComponent /> : null}
                {tab.value === "step2" ? <PriceRangeComponent /> : null}
                {tab.value === "step3" ? <PriceRangeComponent /> : null}
              </TabsContent>
            ))}
          </Tabs>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t flex justify-between items-center p-4">
          <Button variant="ghost">Clear All</Button>
          <Button className="text-end">Show 1,000 plus places</Button>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
