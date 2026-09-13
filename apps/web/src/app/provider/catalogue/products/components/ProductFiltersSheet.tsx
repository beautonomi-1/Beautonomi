"use client";
import { useTranslation } from "@beautonomi/i18n";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProductFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductFiltersSheet({ open, onOpenChange }: ProductFiltersSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("web.provider.catalogueProducts.filtersTitle")}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div>
            <Label>{t("web.provider.catalogueProducts.category")}</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder={t("web.provider.catalogueProducts.allCategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("web.provider.catalogueProducts.allCategories")}</SelectItem>
                <SelectItem value="hair">{t("web.provider.catalogueProducts.hairCare")}</SelectItem>
                <SelectItem value="nail">{t("web.provider.catalogueProducts.nailCare")}</SelectItem>
                <SelectItem value="skin">{t("web.provider.catalogueProducts.skinCare")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("web.provider.catalogueProducts.supplier")}</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder={t("web.provider.catalogueProducts.allSuppliers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("web.provider.catalogueProducts.allSuppliers")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t("web.provider.catalogueProducts.stockStatus")}</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder={t("web.provider.common.all")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("web.provider.common.all")}</SelectItem>
                <SelectItem value="in-stock">{t("web.provider.catalogueProducts.inStock")}</SelectItem>
                <SelectItem value="low-stock">{t("web.provider.catalogueProducts.lowStock")}</SelectItem>
                <SelectItem value="out-of-stock">{t("web.provider.catalogueProducts.outOfStock")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              {t("web.provider.common.reset")}
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary-hover"
              onClick={() => onOpenChange(false)}
            >
              {t("web.provider.common.applyFilters")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
