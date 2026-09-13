"use client";

import React, { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Filter, MoreVertical, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useTranslation } from "@beautonomi/i18n";
interface DataTableShellProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filterButton?: {
    label: string;
    onClick: () => void;
  };
  optionsMenu?: ReactNode;
  addButton?: {
    label: string;
    onClick: () => void;
  };
  sortOptions?: { value: string; label: string }[];
  sortValue?: string;
  onSortChange?: (value: string) => void;
  children: ReactNode;
}

export function DataTableShell({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filterButton,
  optionsMenu,
  addButton,
  sortOptions,
  sortValue,
  onSortChange,
  children,
}: DataTableShellProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="relative flex-1 w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder={searchPlaceholder ?? t("web.provider.dataTableShell.searchPlaceholder")}
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="ps-10 provider-input min-h-[44px]"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {filterButton && (
            <Button variant="outline" onClick={filterButton.onClick}>
              <Filter className="w-4 h-4 me-2" />
              {filterButton.label}
            </Button>
          )}

          {sortOptions && (
            <Select value={sortValue} onValueChange={onSortChange}>
              <SelectTrigger className="w-full md:w-48 provider-input min-h-[44px]">
                <SelectValue placeholder={t("web.provider.dataTableShell.sortBy")} />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {optionsMenu || (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <MoreVertical className="w-4 h-4 me-2" />
                  {t("web.provider.dataTableShell.options")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>{t("web.provider.dataTableShell.export")}</DropdownMenuItem>
                <DropdownMenuItem>{t("web.provider.dataTableShell.print")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {addButton && (
            <Button 
              onClick={addButton.onClick} 
              className="provider-btn-brand w-full sm:w-auto px-5"
            >
              <Plus className="w-4 h-4 me-2" />
              {addButton.label}
            </Button>
          )}
        </div>
      </div>

      {/* Table Content */}
      {children}
    </div>
  );
}
