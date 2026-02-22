"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TABS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "arrivals", label: "Arrivals" },
  { id: "in_service", label: "In Service" },
  { id: "ready_to_pay", label: "Ready to Pay" },
  { id: "completed", label: "Completed" },
];

interface QueueTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  counts: Record<string, number>;
}

export function QueueTabs({ activeTab, onTabChange, counts }: QueueTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex h-auto p-1 bg-muted/50">
        {TABS.map((tab) => {
          const count = counts[tab.id] ?? 0;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="relative gap-1.5 data-[state=active]:bg-[#FF0077] data-[state=active]:text-white"
            >
              {tab.label}
              <Badge
                variant={activeTab === tab.id ? "secondary" : "outline"}
                className={cn(
                  "h-5 min-w-[20px] px-1.5 text-xs",
                  activeTab === tab.id && "bg-white/20 border-0"
                )}
              >
                {count}
              </Badge>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
