"use client";
import React, { FC, useState, useCallback } from "react";
import {
  FaParking,
  FaLock,
} from "react-icons/fa";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PriceRangeComponent from "@/app/search/components/price-range";
import LanguageDropdown from "@/app/search/components/language-dropdown";
import Sortby from "@/app/home/components/sortby";
import Image from "next/image";
import Image1 from "./../../../../public/images/svg-gobbler.svg";
import Link from "next/link";
import { X } from "lucide-react";

interface ButtonOption {
  id: string;
  icon: React.ReactElement;
  label: string;
}

const featureOptions: ButtonOption[] = [
  { id: "parking", icon: <FaParking className="h-5 w-5" />, label: "Parking" },
  { id: "security", icon: <FaLock className="h-5 w-5" />, label: "Security" },
  // Add more options as needed
];

interface EssentialsButtonsProps {
  showMore: boolean;
  selectedOptions: string[];
  toggleOption: (option: string) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const PartnerContainer: FC = () => {
  const [isClicked, setIsClicked] = useState(false);

  const handleClick = () => {
    setIsClicked(!isClicked);
  };

  return (
    <div
      className={`border p-4 flex justify-between max-w-72 cursor-pointer gap-5 rounded-xl transition-all duration-300 ${
        isClicked ? "border-secondary bg-[#f7f7f7]" : "border-gray-300 bg-white"
      }`}
      onClick={handleClick}
    >
      <Image src={Image1} alt="" />
      <div>
        <h2 className="text-base font-medium text-secondary mb-1">
          Top Partners
        </h2>
        <p className="text-sm font-light text-destructive">
          The most loved partners on beautonomi
        </p>
      </div>
    </div>
  );
};

export const EssentialsButtons: FC<EssentialsButtonsProps> = ({
  showMore: _showMore,
  selectedOptions,
  toggleOption,
  isOpen,
  onOpenChange,
}) => {
  const [activeTab, setActiveTab] = useState<
    "entire-place" | "freelancer" | "salons"
  >("entire-place");

  const handleOptionToggle = useCallback(
    (optionId: string) => (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleOption(optionId);
    },
    [toggleOption]
  );

  const handleClearAll = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      selectedOptions.forEach((option) => toggleOption(option));
    },
    [selectedOptions, toggleOption]
  );

  return (
    <div>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md md:max-w-xl overflow-y-auto px-0 py-0 max-h-[90vh] z-[9999] rounded-lg">
          <DialogHeader className="flex justify-center items-center border-b py-3 sticky top-0 left-0 right-0 bg-white z-10">
          <button
              className="absolute left-4 text-secondary"
              onClick={() => onOpenChange(false)}
            >
              <X />
            </button>
            <DialogTitle className="font-normal text-base pt-0">
              Filters
            </DialogTitle>
            <DialogDescription className="sr-only">Filter options for search results</DialogDescription>
           
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto py-4 px-6">
            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value as "entire-place" | "freelancer" | "salons")
              }
              className=""
            >
              <div className="border-b pb-8 mb-4">
                <TabsList className="flex justify-center max-w-lg mx-auto rounded-xl bg-white border h-[54px]">
                  <TabsTrigger
                    className="w-full rounded-xl py-3 border-2 border-transparent data-[state=active]:border-black data-[state=active]:text-secondary data-[state=active]:bg-[#f7f7f7]"
                    value="entire-place"
                  >
                    Any Type
                  </TabsTrigger>
                  <TabsTrigger
                    className="w-full rounded-xl py-3 border-2 border-transparent data-[state=active]:border-black data-[state=active]:text-secondary data-[state=active]:bg-[#f7f7f7]"
                    value="freelancer"
                  >
                    Freelancer
                  </TabsTrigger>
                  <TabsTrigger
                    className="w-full rounded-xl py-3 border-2 border-transparent data-[state=active]:border-black data-[state=active]:text-secondary data-[state=active]:bg-[#f7f7f7]"
                    value="salons"
                  >
                    Salons
                  </TabsTrigger>
                </TabsList>
              </div>

              {["entire-place", "freelancer", "salons"].map((tabValue) => (
                <TabsContent key={tabValue} value={tabValue}>
                  <Sortby />
                  <PriceRangeComponent />
                  <div>
                    <div>
                      <h2 className="text-lg font-normal mb-3">
                        Booking Options
                      </h2>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {featureOptions.map((option) => (
                          <button
                            key={option.id}
                            className={`flex items-center space-x-2 rounded-full max-h-[42px] px-3.5 py-2 border ${
                              selectedOptions.includes(option.id)
                                ? "bg-[#f7f7f7] text-secondary border-secondary"
                                : "bg-white text-black border-gray-300"
                            }`}
                            onClick={handleOptionToggle(option.id)}
                            onTouchStart={handleOptionToggle(option.id)}
                          >
                            {option.icon}
                            <span className="text-xs font-light">
                              {option.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h2 className="text-lg font-medium text-secondary mb-5">
                      Standout partners
                    </h2>
                    <PartnerContainer />
                  </div>
                  <div className="space-y-2 mt-6">
                    <LanguageDropdown />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
          <div className="sticky bottom-0 left-0 right-0 bg-white border-t py-3 flex items-center justify-between px-6">
            <button
              className="bg-transparent hover:bg-[#f7f7f7] text-secondary rounded-lg max-h-[50px] px-7 py-2 text-sm font-light"
              onClick={handleClearAll}
              onTouchStart={handleClearAll}
            >
              Clear All
            </button>
            <Link href={"/search"}>
              <button className="bg-secondary hover:bg-black text-white rounded-lg max-h-[50px] px-7 py-2 text-sm font-light">
                Show 1,000+ partners
              </button>
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
