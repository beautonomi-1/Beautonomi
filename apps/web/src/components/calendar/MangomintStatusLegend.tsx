"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronDown, ChevronUp, Info, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AppointmentKind,
  BlockKind,
} from "@/lib/scheduling/mangomintAdapter";
import {
  STATUS_COLORS,
  KIND_INDICATORS,
  BLOCK_STYLES,
} from "@/lib/scheduling/visualMapping";

interface MangomintStatusLegendProps {
  className?: string;
  variant?: "inline" | "popover" | "collapsible";
  showKinds?: boolean;
  showBlocks?: boolean;
  compact?: boolean;
}

/**
 * Status Legend Component
 * 
 * Displays the color legend for appointment statuses, kinds, and blocks.
 * Can be rendered inline, in a popover, or as a collapsible section.
 */
export function MangomintStatusLegend({
  className,
  variant = "inline",
  showKinds = true,
  showBlocks = true,
  compact = false,
}: MangomintStatusLegendProps) {
  const [isOpen, setIsOpen] = useState(false);

  const legendContent = (
    <div className={cn("space-y-4", compact && "space-y-2")}>
      {/* Status Colors */}
      <div>
        <h4 className={cn(
          "font-medium text-muted-foreground mb-2",
          compact ? "text-[10px] uppercase tracking-wide" : "text-xs"
        )}>
          Status
        </h4>
        <div className={cn(
          "grid gap-2",
          compact ? "grid-cols-2" : "grid-cols-3"
        )}>
          {Object.entries(STATUS_COLORS).map(([status, config]) => (
            <div key={status} className="flex items-center gap-2">
              <div
                className={cn(
                  "rounded-sm flex-shrink-0",
                  compact ? "w-3 h-3" : "w-4 h-4"
                )}
                style={{
                  backgroundColor: config.bg,
                  border: `1px solid ${config.border}`,
                }}
              />
              <span className={cn(
                "text-muted-foreground truncate",
                compact ? "text-[10px]" : "text-xs"
              )}>
                {config.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Appointment Kinds */}
      {showKinds && (
        <>
          <div className="border-t border-border" />
          <div>
            <h4 className={cn(
              "font-medium text-muted-foreground mb-2",
              compact ? "text-[10px] uppercase tracking-wide" : "text-xs"
            )}>
              Booking Type
            </h4>
            <div className={cn(
              "grid gap-2",
              compact ? "grid-cols-2" : "grid-cols-3"
            )}>
              {Object.entries(KIND_INDICATORS).map(([kind, config]) => (
                <div key={kind} className="flex items-center gap-2">
                  <div
                    className={cn(
                      "rounded-sm flex items-center justify-center",
                      compact ? "w-3 h-3" : "w-4 h-4",
                      config.badgeClasses
                    )}
                  >
                    <span className={cn(compact ? "text-[8px]" : "text-[10px]")}>
                      {kind === AppointmentKind.IN_SALON ? "🏢" : 
                       kind === AppointmentKind.WALK_IN ? "🚶" : "🏠"}
                    </span>
                  </div>
                  <span className={cn(
                    "text-muted-foreground truncate",
                    compact ? "text-[10px]" : "text-xs"
                  )}>
                    {config.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Block Types */}
      {showBlocks && (
        <>
          <div className="border-t border-border" />
          <div>
            <h4 className={cn(
              "font-medium text-muted-foreground mb-2",
              compact ? "text-[10px] uppercase tracking-wide" : "text-xs"
            )}>
              Blocks
            </h4>
            <div className={cn(
              "grid gap-2",
              compact ? "grid-cols-2" : "grid-cols-2"
            )}>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "rounded-sm flex-shrink-0",
                    compact ? "w-3 h-3" : "w-4 h-4"
                  )}
                  style={{
                    backgroundColor: BLOCK_STYLES[BlockKind.TIME_BLOCK].bg,
                    backgroundImage: BLOCK_STYLES[BlockKind.TIME_BLOCK].pattern,
                    border: `1px solid ${BLOCK_STYLES[BlockKind.TIME_BLOCK].border}`,
                  }}
                />
                <span className={cn(
                  "text-muted-foreground truncate",
                  compact ? "text-[10px]" : "text-xs"
                )}>
                  Time Block
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "rounded-sm flex-shrink-0",
                    compact ? "w-3 h-3" : "w-4 h-4"
                  )}
                  style={{
                    backgroundColor: BLOCK_STYLES[BlockKind.TRAVEL_BLOCK].bg,
                    backgroundImage: BLOCK_STYLES[BlockKind.TRAVEL_BLOCK].pattern,
                    border: `1px solid ${BLOCK_STYLES[BlockKind.TRAVEL_BLOCK].border}`,
                  }}
                />
                <span className={cn(
                  "text-muted-foreground truncate",
                  compact ? "text-[10px]" : "text-xs"
                )}>
                  Travel Block
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Now Line Indicator */}
      <div className="border-t border-border pt-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center",
            compact ? "gap-0.5" : "gap-1"
          )}>
            <div className={cn(
              "rounded-full bg-red-500",
              compact ? "w-2 h-2" : "w-2.5 h-2.5"
            )} />
            <div className={cn(
              "bg-red-500",
              compact ? "w-4 h-[1px]" : "w-6 h-[2px]"
            )} />
          </div>
          <span className={cn(
            "text-muted-foreground",
            compact ? "text-[10px]" : "text-xs"
          )}>
            Current time
          </span>
        </div>
      </div>
    </div>
  );

  // Popover variant
  if (variant === "popover") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-1.5 h-8 text-xs", className)}
          >
            <Palette className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Legend</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="end">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Color Legend</h3>
            </div>
            {legendContent}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Collapsible variant
  if (variant === "collapsible") {
    return (
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className={cn("border rounded-lg", className)}
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between p-3 h-auto"
          >
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Color Legend</span>
            </div>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3">{legendContent}</div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  // Inline variant (default)
  return (
    <div className={cn("p-3 border rounded-lg bg-card", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Palette className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">Color Legend</h3>
      </div>
      {legendContent}
    </div>
  );
}

export default MangomintStatusLegend;
