"use client";

import React, { useState } from "react";
import { addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { useResponsive } from "@/hooks/useMobile";

export function DatePickerWithRange({ className, img: _img }: any) {
  const [date, setDate] = useState({
    from: new Date(2022, 0, 20),
    to: addDays(new Date(2022, 0, 20), 20),
  });
  const numberOfMonths = useResponsive({ mobile: 1, tablet: 1, desktop: 2 });

  return (
    <div className={cn("grid gap-2", className)}>
      <Calendar
        initialFocus
        mode="range"
        defaultMonth={date?.from}
        selected={date}
        //@ts-ignore 
        onSelect={setDate}
        numberOfMonths={numberOfMonths}
      />
    </div>
  );
}
