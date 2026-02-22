"use client";

import React, { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface ProviderPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
}

export function ProviderPageHeader({
  title,
  subtitle,
  actions,
  primaryAction,
}: ProviderPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {primaryAction && (
          <Button onClick={primaryAction.onClick} className="bg-[#FF0077] hover:bg-[#D60565]">
            {primaryAction.icon || <Plus className="w-4 h-4 mr-2" />}
            {primaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}
