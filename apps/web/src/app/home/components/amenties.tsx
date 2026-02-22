"use client"
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import PriceRangeComponent from "../../search/components/price-range";
import SortByComponent from "./sortby";
import { FaParking, FaLock, FaCamera, FaThermometerHalf, FaUmbrella } from "react-icons/fa";
import Link from "next/link";

interface FeatureOption {
  id: string;
  icon: React.ReactNode;
  label: string;
}

const featureOptions: FeatureOption[] = [
  { id: "parking", icon: <FaParking className="h-5 w-5" />, label: "Parking" },
  { id: "security", icon: <FaLock className="h-5 w-5" />, label: "Security" },
  { id: "cctv", icon: <FaCamera className="h-5 w-5" />, label: "CCTV" },
  { id: "temperatureControl", icon: <FaThermometerHalf className="h-5 w-5" />, label: "Temperature Control" },
  { id: "umbrella", icon: <FaUmbrella className="h-5 w-5" />, label: "Umbrella" },
];

const languages: string[] = [
  "Chinese", "English", "French", "German", "Italian", "Japanese", "Korean", "Portuguese", "Russian", "Spanish",
  "Arabic", "Czech", "Danish", "Dutch", "Finnish", "Greek", "Hebrew", "Hindi", "Hungarian", "Indonesian",
  "Malay", "Norwegian", "Polish", "Swedish", "Thai", "Turkish", "Azerbaijani", "Bengali", "Persian", "Punjabi",
  "Tagalog", "Ukrainian", "Urdu", "Sign"
];

export default function FilterModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("entire-place");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  const toggleOption = (option: string) => {
    setSelectedOptions(prev =>
      prev.includes(option) ? prev.filter(item => item !== option) : [...prev, option]
    );
  };

  const toggleLanguage = (language: string) => {
    setSelectedLanguages(prev =>
      prev.includes(language) ? prev.filter(lang => lang !== language) : [...prev, language]
    );
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
  };

  const clearAll = () => {
    setSelectedOptions([]);
    setSelectedLanguages([]);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" onClick={() => setOpen(true)}>Filters</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl overflow-y-auto px-0 py-0 max-h-[90vh] bg-black">
        <DialogHeader className="flex justify-center items-center border-b py-3 sticky top-0 left-0 right-0 bg-white z-10">
          <DialogTitle className="font-normal text-base pt-0">Filters</DialogTitle>
          <DialogDescription className="sr-only">Filter options for search results</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto py-4 px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b pb-8">
              <TabsList className="flex justify-center max-w-lg mx-auto rounded-xl bg-white border h-[54px]">
                <TabsTrigger
                  className="w-full rounded-xl py-3 border-2 border-transparent data-[state=active]:border-black data-[state=active]:text-secondary data-[state=active]:bg-[#f7f7f7]"
                  value="entire-place"
                >
                  Any Type
                </TabsTrigger>
                <TabsTrigger
                  className="w-full rounded-xl py-3 border-2 border-transparent data-[state=active]:border-black data-[state=active]:text-secondary data-[state=active]:bg-[#f7f7f7]"
                  value="private-room"
                >
                  Room
                </TabsTrigger>
                <TabsTrigger
                  className="w-full rounded-xl py-3 border-2 border-transparent data-[state=active]:border-black data-[state=active]:text-secondary data-[state=active]:bg-[#f7f7f7]"
                  value="entire-house"
                >
                  Entire House
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="entire-place">
              <PriceRangeComponent />
              <SortByComponent />
              <div>
                <h2 className="text-lg font-normal mb-3">Booking Options</h2>
                <div className="flex flex-wrap gap-2 mb-6">
                  {featureOptions.map((option) => (
                    <Button
                      key={option.id}
                      variant="outline"
                      className={`flex items-center space-x-2 rounded-full max-h-[42px] px-3.5 hover:bg-transparent ${
                        selectedOptions.includes(option.id)
                          ? "bg-[#f7f7f7] text-secondary border-secondary"
                          : "bg-white text-black border-gray-300"
                      }`}
                      onClick={() => toggleOption(option.id)}
                    >
                      {option.icon}
                      <span className="text-xs font-light">{option.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 mt-6 z-50">
                <h2 className="text-lg font-normal">Host language</h2>
                <div className="grid grid-cols-2 gap-4">
                  {languages.map((language) => (
                    <div key={language} className="flex items-center space-x-2">
                      <Checkbox
                        id={`language-${language}`}
                        checked={selectedLanguages.includes(language)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            toggleLanguage(language);
                          } else {
                            setSelectedLanguages(prev => prev.filter(lang => lang !== language));
                          }
                        }}
                      />
                      <label
                        htmlFor={`language-${language}`}
                        className="text-sm font-light text-secondary cursor-pointer"
                      >
                        {language}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex items-center justify-between pt-6 pb-3 bg-white px-6">
          <Button
            className="bg-transparent hover:bg-[#f7f7f7] text-secondary rounded-lg max-h-[50px] px-7 text-sm font-light"
            onClick={clearAll}
          >
            Clear all
          </Button>
          <Link href={"/search"}>
          <Button className="bg-secondary hover:bg-black text-white rounded-lg max-h-[50px] px-7 text-sm font-light">
            Show 1,000+ places
          </Button>
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}