// components/Component.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EssentialsButtons } from "./amenties"; 
import { FaChevronDown } from "react-icons/fa6";

export default function Filterbuttons() {
  const [showMore, setShowMore] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const toggleShowMore = () => {
    setShowMore(!showMore);
  };

  const toggleOption = (option: string) => {
    setSelectedOptions((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  };

  return (
    <div className="space-y-4">
      <EssentialsButtons
        showMore={showMore}
        selectedOptions={selectedOptions}
        toggleOption={toggleOption}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
      <Button variant="outline" onClick={() => setIsOpen(true)}>
        Filters
      </Button>
      <Button variant="link" onClick={toggleShowMore} className="flex items-center space-x-2 text-secondary underline">
        <span>Show more</span>
        <FaChevronDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
