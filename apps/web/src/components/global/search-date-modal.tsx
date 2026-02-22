"use client"
import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { useResponsive } from "@/hooks/useMobile";


type DateRange = {
  from: Date | undefined;
  to?: Date | undefined; 
};

interface SearchDateModalProps {
  dateRange: { from: Date | undefined; to: Date | undefined } | undefined;
  onDateSelect: (range: { from: Date | undefined; to: Date | undefined }) => void;
}

const SearchDateModal: React.FC<SearchDateModalProps> = ({ dateRange = { from: undefined, to: undefined }, onDateSelect }) => {
  const [activeTab, setActiveTab] = useState<"dates" | "months" | "flexible">("dates");
  const numberOfMonths = useResponsive({ mobile: 1, tablet: 1, desktop: 2 });

  const handleDateSelect = (range: DateRange | undefined) => {
    if (range) {
      //@ts-ignore 
      onDateSelect(range);
    }
  };

  const defaultMonth = dateRange?.from || new Date();

  return (
    <div className="bg-white w-full rounded-2xl p-4">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "dates" | "months" | "flexible")}
        className="border-b w-full"
      >
        <TabsList className="flex justify-center max-w-sm mx-auto rounded-full bg-[#EBEBEB]">
          <TabsTrigger className="w-full rounded-full" value="dates">
            Dates
          </TabsTrigger>
          <TabsTrigger className="w-full rounded-full" value="months">
            Months
          </TabsTrigger>
          <TabsTrigger className="w-full rounded-full" value="flexible">
            Flexible
          </TabsTrigger>
        </TabsList>
          <TabsContent value="dates">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={defaultMonth}
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={numberOfMonths}
          />
        </TabsContent>
        <TabsContent value="months">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={defaultMonth}
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={numberOfMonths}
          />
        </TabsContent>
        <TabsContent value="flexible">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={defaultMonth}
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={numberOfMonths}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SearchDateModal;