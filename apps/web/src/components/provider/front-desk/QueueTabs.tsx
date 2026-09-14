"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "@beautonomi/i18n";

const TABS: { id: string; labelKey: string }[] = [
  { id: "all", labelKey: "web.provider.frontDesk.queueTabs.all" },
  { id: "needs_confirmation", labelKey: "web.provider.frontDesk.queueTabs.toConfirm" },
  { id: "arrivals", labelKey: "web.provider.frontDesk.queueTabs.arrivals" },
  { id: "in_service", labelKey: "web.provider.frontDesk.queueTabs.inService" },
  { id: "ready_to_pay", labelKey: "web.provider.frontDesk.queueTabs.readyToPay" },
  { id: "completed", labelKey: "web.provider.frontDesk.queueTabs.completed" },
];

interface QueueTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  counts: Record<string, number>;
}

export function QueueTabs({ activeTab, onTabChange, counts }: QueueTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 lg:w-auto lg:inline-flex h-auto p-1 bg-muted/50">
        {TABS.map((tab) => {
          const count = counts[tab.id] ?? 0;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="relative gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              {t(tab.labelKey)}
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
