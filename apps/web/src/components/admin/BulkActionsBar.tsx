"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, Ban, Trash2, Download, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkAction: (action: string) => void;
  actions?: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    variant?: "default" | "destructive" | "outline";
  }>;
}

export default function BulkActionsBar({
  selectedCount,
  onClearSelection,
  onBulkAction,
  actions = [
    { id: "activate", label: "Activate", icon: CheckCircle2, variant: "default" as const },
    { id: "deactivate", label: "Deactivate", icon: Ban, variant: "outline" as const },
    { id: "delete", label: "Delete", icon: Trash2, variant: "destructive" as const },
    { id: "export", label: "Export", icon: Download, variant: "outline" as const },
  ],
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-10 bg-[#FF0077] text-white p-4 rounded-lg shadow-lg mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold">
            {selectedCount} {selectedCount === 1 ? "item" : "items"} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="text-white hover:bg-white/20"
          >
            <X className="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <Users className="w-4 h-4 mr-2" />
                Bulk Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <DropdownMenuItem
                    key={action.id}
                    onClick={() => onBulkAction(action.id)}
                    className={action.variant === "destructive" ? "text-red-600" : ""}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {action.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
