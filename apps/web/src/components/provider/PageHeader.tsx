"use client";

import React, { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Breadcrumb, { BreadcrumbItem } from "@/components/ui/breadcrumb";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: ReactNode;
  };
  breadcrumbs?: BreadcrumbItem[];
  "data-tour"?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  primaryAction,
  breadcrumbs,
  "data-tour": dataTour,
}: PageHeaderProps) {
  return (
    <div className="w-full max-w-full overflow-x-hidden box-border" data-tour={dataTour}>
      {breadcrumbs && (
        <div className="w-full max-w-full overflow-x-auto mb-4 sm:mb-6 box-border">
          <Breadcrumb items={breadcrumbs} />
        </div>
      )}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 lg:gap-6 w-full max-w-full box-border">
        <div className="min-w-0 flex-1 overflow-hidden">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-gray-600 mt-1 break-words line-clamp-2">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap flex-shrink-0 min-w-0 w-full sm:w-auto">
          {actions}
          {primaryAction && (
            <Button
              onClick={primaryAction.onClick}
              className="bg-[#FF0077] hover:bg-[#D60565] text-white w-full sm:w-auto flex-shrink-0 whitespace-nowrap min-h-[44px] touch-manipulation"
            >
              {primaryAction.icon || <Plus className="w-4 h-4 mr-2 flex-shrink-0" />}
              <span className="truncate">{primaryAction.label}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
