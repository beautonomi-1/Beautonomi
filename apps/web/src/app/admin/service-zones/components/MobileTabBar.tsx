"use client";

import React from "react";
import { List, Map, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "list" | "map" | "builder";

interface MobileTabBarProps {
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const TABS: { id: MobileTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "list", label: "Markets", icon: List },
  { id: "map", label: "Map", icon: Map },
  { id: "builder", label: "Builder", icon: Sliders },
];

export default function MobileTabBar({ activeTab, onChange }: MobileTabBarProps) {
  return (
    <div
      className="flex shrink-0 border-t border-slate-200 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
              active
                ? "text-primary"
                : "text-slate-500 hover:text-slate-700"
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              className={cn(
                "h-5 w-5 transition-transform",
                active && "scale-110"
              )}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
