"use client";

import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScanBarcode, Search, Loader2 } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { cn } from "@/lib/utils";

export interface BarcodeProduct {
  id: string;
  name: string;
  barcode?: string | null;
  sku?: string | null;
  quantity?: number;
  retail_price?: number;
  image_urls?: string[] | null;
  has_variants?: boolean;
}

export interface BarcodeVariant {
  id: string;
  option_values?: Record<string, string>;
  sku?: string | null;
  barcode?: string | null;
  quantity?: number;
  retail_price?: number;
}

export interface BarcodeLookupResult {
  product: BarcodeProduct;
  variant?: BarcodeVariant;
}

interface BarcodeLookupProps {
  onSelect: (product: BarcodeProduct, variant?: BarcodeVariant) => void;
  placeholder?: string;
  className?: string;
  /** Optional: label for the input */
  label?: string;
}

export function BarcodeLookup({
  onSelect,
  placeholder = "Scan or enter barcode / SKU",
  className,
  label = "Find by barcode",
}: BarcodeLookupProps) {
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleLookup = async () => {
    const q = value.trim();
    if (!q) {
      setError("Enter a barcode or SKU");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (/^\d+$/.test(q) || q.length >= 8) {
        params.set("barcode", q);
      } else {
        params.set("sku", q);
      }
      const res = await fetcher.get<{ data: BarcodeLookupResult }>(
        `/api/provider/products/by-barcode?${params.toString()}`
      );
      const data = res.data;
      if (data?.product) {
        onSelect(data.product, data.variant);
        setValue("");
      } else {
        setError("No product found");
      }
    } catch {
      setError("No product found for this barcode or SKU");
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor="barcode-lookup" className="text-sm font-medium text-gray-700">
          {label}
        </Label>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            id="barcode-lookup"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder={placeholder}
            className="pl-9 rounded-xl border border-gray-200 bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-primary/20"
            disabled={isLoading}
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={handleLookup}
          disabled={isLoading}
          className="shrink-0 rounded-xl"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
