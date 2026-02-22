"use client";

import React from "react";
import { useCalendarPreferences } from "@/lib/settings/calendarPreferences";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Settings2,
  Contrast,
  Eye,
  EyeOff,
  Clock,
  Palette,
  Grid3X3,
  Tag,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PreferencesPanelProps {
  className?: string;
  variant?: "button" | "icon";
  align?: "start" | "center" | "end";
}

/**
 * Calendar preferences popover panel
 * Provides quick access to visual preferences like high contrast mode,
 * show/hide canceled appointments, color scheme, etc.
 */
export function PreferencesPanel({
  className,
  variant = "icon",
  align = "end",
}: PreferencesPanelProps) {
  const {
    preferences,
    isLoaded,
    toggleHighContrastMode,
    toggleShowCanceledAppointments,
    toggleCompactMode,
    toggleShowIcons,
    updatePreference,
  } = useCalendarPreferences();

  if (!isLoaded) {
    return null;
  }

  const triggerContent = variant === "button" ? (
    <Button variant="ghost" size="sm" className={cn("gap-2", className)}>
      <Settings2 className="w-4 h-4" />
      <span className="hidden md:inline">Preferences</span>
    </Button>
  ) : (
    <Button variant="ghost" size="icon" className={cn("h-9 w-9", className)}>
      <Settings2 className="w-4 h-4" />
    </Button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {triggerContent}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0">
        <div className="px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Calendar Preferences</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Customize how your calendar looks
          </p>
        </div>

        <div className="p-4 space-y-4">
          {/* Display Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Display
            </h4>

            {/* High Contrast Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Contrast className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="high-contrast" className="text-sm font-normal cursor-pointer">
                    High Contrast
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Better visibility
                  </p>
                </div>
              </div>
              <Switch
                id="high-contrast"
                checked={preferences.highContrast}
                onCheckedChange={toggleHighContrastMode}
              />
            </div>

            {/* Show Canceled */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {preferences.showCanceled ? (
                  <Eye className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <Label htmlFor="show-canceled" className="text-sm font-normal cursor-pointer">
                    Show Canceled
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Display canceled appointments
                  </p>
                </div>
              </div>
              <Switch
                id="show-canceled"
                checked={preferences.showCanceled}
                onCheckedChange={toggleShowCanceledAppointments}
              />
            </div>

            {/* Compact Mode */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Grid3X3 className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="compact-mode" className="text-sm font-normal cursor-pointer">
                    Compact Mode
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Smaller appointment blocks
                  </p>
                </div>
              </div>
              <Switch
                id="compact-mode"
                checked={preferences.compactMode}
                onCheckedChange={toggleCompactMode}
              />
            </div>

            {/* Show Icons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="show-icons" className="text-sm font-normal cursor-pointer">
                    Show Icons
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    New client, notes, etc.
                  </p>
                </div>
              </div>
              <Switch
                id="show-icons"
                checked={preferences.showAppointmentIcons}
                onCheckedChange={toggleShowIcons}
              />
            </div>

            {/* Show Prices (Mangomint/Fresha style) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="show-prices" className="text-sm font-normal cursor-pointer">
                    Show Prices
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Display price on appointment blocks
                  </p>
                </div>
              </div>
              <Switch
                id="show-prices"
                checked={preferences.showPrices}
                onCheckedChange={(checked) => updatePreference("showPrices", checked)}
              />
            </div>
          </div>

          <Separator />

          {/* Color Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Colors
            </h4>

            {/* Color By */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-normal">Color By</Label>
              </div>
              <Select
                value={preferences.colorBy}
                onValueChange={(value: "status" | "service" | "team_member") =>
                  updatePreference("colorBy", value)
                }
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="team_member">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Time Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Time Grid
            </h4>

            {/* Time Increment */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-normal">Time Slots</Label>
              </div>
              <Select
                value={preferences.timeIncrementMinutes.toString()}
                onValueChange={(value) =>
                  updatePreference("timeIncrementMinutes", parseInt(value) as 5 | 10 | 15)
                }
              >
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 min</SelectItem>
                  <SelectItem value="10">10 min</SelectItem>
                  <SelectItem value="15">15 min</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scroll to Now */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="scroll-to-now" className="text-sm font-normal cursor-pointer">
                    Scroll to Now
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    On calendar load
                  </p>
                </div>
              </div>
              <Switch
                id="scroll-to-now"
                checked={preferences.scrollToNow}
                onCheckedChange={(checked) => updatePreference("scrollToNow", checked)}
              />
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t bg-muted/30">
          <Button
            variant="link"
            size="sm"
            className="text-xs text-muted-foreground p-0 h-auto"
            onClick={() => window.location.href = "/provider/settings/calendar/display-preferences"}
          >
            More settings →
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default PreferencesPanel;
