"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import Image from "next/image";
import { Camera, X, Upload, Plus } from "lucide-react";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";
import type { ProductItem, ProductVariantOptionType, ProductVariantItem } from "@/lib/provider-portal/types";
import { useReferenceData } from "@/hooks/useReferenceData";
import { fetcher } from "@/lib/http/fetcher";
import {
  Dialog as QuickDialog,
  DialogContent as QuickDialogContent,
  DialogHeader as QuickDialogHeader,
  DialogTitle as QuickDialogTitle,
  DialogFooter as QuickDialogFooter,
} from "@/components/ui/dialog";
import { ChipCombobox } from "@/components/ui/chip-combobox";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

interface ProductCreateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductItem | null;
  onSave: () => void;
}

export function ProductCreateEditDialog({
  open,
  onOpenChange,
  product,
  onSave,
}: ProductCreateEditDialogProps) {
  const { currencyCode } = useReportCurrency();
  const { getOptions } = useReferenceData(["product_unit", "tax_rate"]);
  const [brands, setBrands] = useState<{ name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [isBrandDialogOpen, setIsBrandDialogOpen] = useState(false);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadingImages, setUploadingImages] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    barcode: "",
    brand: "",
    measure: "ml",
    amount: 0,
    shortDescription: "",
    description: "",
    category: "",
    supplyPrice: 0,
    retailSalesEnabled: true,
    retailPrice: 0,
    markup: 0,
    taxEnabled: false, // Inferred from "Default: No Tax"
    taxRate: 0,
    teamMemberCommissionEnabled: false,
    sku: "",
    skuCodes: [] as string[], // Multiple SKU codes
    generateSku: false,
    supplier: "",
    trackStockQuantity: true,
    quantity: 0,
    lowStockLevel: 5,
    reorderQuantity: 0,
    receiveLowStockNotifications: false,
    imageUrls: [] as string[],
    mainImageUrl: "",
    // Variants
    hasVariants: false,
    variantOptionTypes: [] as ProductVariantOptionType[],
    variantRows: [] as Array<{
      option_values: Record<string, string>;
      sku: string;
      barcode: string;
      measure: string;
      amount: number;
      quantity: number;
      low_stock_level: number;
      reorder_quantity: number;
      supply_price: number;
      retail_price: number;
      markup: number;
      image_url: string;
      sort_order?: number;
    }>,
  });

  useEffect(() => {
    if (product) {
      type ProductWithVariantsRow = { has_variants?: boolean; variant_option_types?: unknown[]; variants?: ProductVariantItem[] };
      const productHasVariants = product as ProductWithVariantsRow;
      setFormData({
        name: product.name || "",
        barcode: product.barcode || "",
        brand: product.brand || "",
        measure: product.measure || "ml",
        amount: product.amount || 0,
        shortDescription: product.short_description || "",
        description: product.description || "",
        category: product.category || "",
        supplyPrice: product.supply_price || 0,
        retailSalesEnabled: product.retail_sales_enabled !== false,
        retailPrice: product.retail_price || 0,
        markup: product.markup || 0,
        taxEnabled: (product.tax_rate || 0) > 0,
        taxRate: product.tax_rate || 0,
        teamMemberCommissionEnabled: product.team_member_commission_enabled || false,
        sku: product.sku || "",
        skuCodes: product.sku ? [product.sku] : [],
        generateSku: false,
        supplier: product.supplier || "",
        trackStockQuantity: product.track_stock_quantity !== false,
        quantity: product.quantity || 0,
        lowStockLevel: product.low_stock_level || 5,
        reorderQuantity: product.reorder_quantity || 0,
        receiveLowStockNotifications: product.receive_low_stock_notifications || false,
        imageUrls: product.image_urls || (product.image_url ? [product.image_url] : []),
        mainImageUrl: product.image_url || (product.image_urls?.[0] || ""),
        hasVariants: Boolean(productHasVariants.has_variants),
        variantOptionTypes: Array.isArray(productHasVariants.variant_option_types) ? (productHasVariants.variant_option_types as ProductVariantOptionType[]) : [],
        variantRows: Array.isArray(productHasVariants.variants)
          ? [...productHasVariants.variants]
              .sort((a: ProductVariantItem, b: ProductVariantItem) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((v: ProductVariantItem) => ({
                option_values: v.option_values || {},
                sku: v.sku ?? "",
                barcode: v.barcode ?? "",
                measure: v.measure ?? "",
                amount: v.amount ?? 0,
                quantity: v.quantity ?? 0,
                low_stock_level: v.low_stock_level ?? 5,
                reorder_quantity: v.reorder_quantity ?? 0,
                supply_price: v.supply_price ?? 0,
                retail_price: v.retail_price ?? 0,
                markup: v.markup ?? 0,
                image_url: v.image_url ?? "",
              }))
          : [],
      });
    } else {
      setFormData({
        name: "",
        barcode: "",
        brand: "",
        measure: "ml",
        amount: 0,
        shortDescription: "",
        description: "",
        category: "",
        supplyPrice: 0,
        retailSalesEnabled: true,
        retailPrice: 0,
        markup: 0,
        taxEnabled: false,
        taxRate: 0,
        teamMemberCommissionEnabled: false,
        sku: "",
        skuCodes: [],
        generateSku: false,
        supplier: "",
        trackStockQuantity: true,
        quantity: 0,
        lowStockLevel: 5,
        reorderQuantity: 0,
        receiveLowStockNotifications: false,
        imageUrls: [],
        mainImageUrl: "",
        hasVariants: false,
        variantOptionTypes: [],
        variantRows: [],
      });
    }
  }, [product, open]);

  // Load brands, suppliers, and categories
  useEffect(() => {
    if (open) {
      loadBrands();
      loadSuppliers();
      loadCategories();
    }
  }, [open]);

  const loadBrands = async (): Promise<{ name: string }[]> => {
    try {
      setIsLoadingBrands(true);
      const response = await fetcher.get<{ data: { name: string }[] }>("/api/provider/brands");
      const data = response.data || [];
      setBrands(data);
      return data;
    } catch (error) {
      console.error("Failed to load brands:", error);
      return [];
    } finally {
      setIsLoadingBrands(false);
    }
  };

  /** Load suppliers from GET /api/provider/suppliers. API returns { data: Supplier[] }; we use .name only (compatible with product_suppliers + legacy product.supplier). */
  const loadSuppliers = async (): Promise<{ name: string }[]> => {
    try {
      setIsLoadingSuppliers(true);
      const response = await fetcher.get<{ data: Array<{ name: string }> }>("/api/provider/suppliers");
      const data = response.data ?? [];
      const list = Array.isArray(data) ? data : [];
      setSuppliers(list);
      return list;
    } catch (error) {
      console.error("Failed to load suppliers:", error);
      return [];
    } finally {
      setIsLoadingSuppliers(false);
    }
  };

  const loadCategories = async (): Promise<{ id: string; name: string }[]> => {
    try {
      setIsLoadingCategories(true);
      const response = await fetcher.get<{ data: { id: string; name: string }[] }>("/api/provider/product-categories");
      const data = response.data || [];
      setCategories(data);
      return data;
    } catch (error) {
      console.error("Failed to load product categories:", error);
      return [];
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleCreateBrand = async () => {
    if (!newBrandName.trim()) {
      toast.error("Brand name is required");
      return;
    }
    try {
      const _response = await fetcher.post("/api/provider/brands", { name: newBrandName.trim() });
      const brandName = newBrandName.trim();
      setNewBrandName("");
      setIsBrandDialogOpen(false);
      
      // Reload brands and wait for it to complete
      const updatedBrands = await loadBrands();
      
      // Since brands are stored in products, the new brand won't appear until a product uses it
      // So we'll add it to the local state temporarily and select it
      if (!updatedBrands || !Array.isArray(updatedBrands) || !updatedBrands.some(b => b.name === brandName)) {
        // Add to local state so it appears in dropdown
        setBrands(prev => {
          const existing = prev || [];
          // Check if brand already exists to avoid duplicates
          if (!existing.some(b => b.name === brandName)) {
            return [...existing, { name: brandName }];
          }
          return existing;
        });
      }
      
      // Set the brand in formData
      setFormData(prev => ({ ...prev, brand: brandName }));
      toast.success("Brand created and selected");
    } catch (error: unknown) {
      console.error("Failed to create brand:", error);
      const err = error as { message?: string; details?: string };
      const errorMessage = err?.message ?? err?.details ?? "Failed to create brand. Please check your permissions.";
      toast.error(errorMessage);
    }
  };

  /** Add supplier via POST /api/provider/suppliers with body { name }. Compatible with product_suppliers table. */
  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    try {
      await fetcher.post("/api/provider/suppliers", { name: newSupplierName.trim() });
      const supplierName = newSupplierName.trim();
      setNewSupplierName("");
      setIsSupplierDialogOpen(false);
      
      // Reload suppliers and wait for it to complete
      const updatedSuppliers = await loadSuppliers();
      
      // Since suppliers are stored in products, the new supplier won't appear until a product uses it
      // So we'll add it to the local state temporarily and select it
      if (!updatedSuppliers || !Array.isArray(updatedSuppliers) || !updatedSuppliers.some(s => s.name === supplierName)) {
        // Add to local state so it appears in dropdown
        setSuppliers(prev => {
          const existing = prev || [];
          // Check if supplier already exists to avoid duplicates
          if (!existing.some(s => s.name === supplierName)) {
            return [...existing, { name: supplierName }];
          }
          return existing;
        });
      }
      
      // Set the supplier in formData
      setFormData(prev => ({ ...prev, supplier: supplierName }));
      toast.success("Supplier created and selected");
    } catch (error: unknown) {
      console.error("Failed to create supplier:", error);
      const err = error as { message?: string; details?: string };
      const errorMessage = err?.message ?? err?.details ?? "Failed to create supplier. Please check your permissions.";
      toast.error(errorMessage);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Category name is required");
      return;
    }
    try {
      const response = await fetcher.post<{ data: { id: string; name: string } }>("/api/provider/product-categories", { 
        name: newCategoryName.trim() 
      });
      const categoryName = response.data.name;
      const categoryId = response.data.id;
      setNewCategoryName("");
      setIsCategoryDialogOpen(false);
      
      // Reload categories and wait for it to complete
      const updatedCategories = await loadCategories();
      
      // Add to local state if not found (shouldn't happen for categories as they're in a table)
      if (!updatedCategories || !Array.isArray(updatedCategories) || !updatedCategories.some(c => c.name === categoryName)) {
        setCategories(prev => {
          const existing = prev || [];
          // Check if category already exists to avoid duplicates
          if (!existing.some(c => c.name === categoryName)) {
            return [...existing, { id: categoryId, name: categoryName }];
          }
          return existing;
        });
      }
      
      // Set the category in formData
      setFormData(prev => ({ ...prev, category: categoryName }));
      toast.success("Product category created and selected");
    } catch (error: unknown) {
      console.error("Failed to create product category:", error);
      const err = error as { message?: string; details?: string };
      const errorMessage = err?.message ?? err?.details ?? "Failed to create product category. Please check your permissions.";
      toast.error(errorMessage);
    }
  };

  const generateSku = () => {
    // Generate a simple SKU - will be replaced by server if empty
    const timestamp = Date.now().toString().slice(-6);
    const nameShort = formData.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'PROD';
    const sku = `${nameShort}-${timestamp}`;
    setFormData({ 
      ...formData, 
      sku,
      skuCodes: formData.skuCodes.length === 0 ? [sku] : [...formData.skuCodes, sku]
    });
  };

  const addAnotherSkuCode = () => {
    const timestamp = Date.now().toString().slice(-6);
    const nameShort = formData.name.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'PROD';
    const newSku = `${nameShort}-${timestamp}-${formData.skuCodes.length + 1}`;
    setFormData({ 
      ...formData, 
      skuCodes: [...formData.skuCodes, newSku],
      sku: formData.sku || newSku // Set main SKU if empty
    });
  };

  const removeSkuCode = (index: number) => {
    const newSkuCodes = formData.skuCodes.filter((_, i) => i !== index);
    setFormData({ 
      ...formData, 
      skuCodes: newSkuCodes,
      sku: index === 0 && newSkuCodes.length > 0 ? newSkuCodes[0] : formData.sku
    });
  };

  const updateSkuCode = (index: number, value: string) => {
    const newSkuCodes = [...formData.skuCodes];
    newSkuCodes[index] = value;
    setFormData({ 
      ...formData, 
      skuCodes: newSkuCodes,
      sku: index === 0 ? value : formData.sku
    });
  };

  const readImageDimensions = (file: File): Promise<{ w: number; h: number }> =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read image"));
      };
      img.src = url;
    });

  const handleImageUpload = async (file: File, isMain: boolean) => {
    try {
      setUploadingImages(true);

      // Validate file type
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Invalid file type. Only images are allowed.");
        return;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        toast.error("File size exceeds 5MB limit");
        return;
      }

      try {
        const { w, h } = await readImageDimensions(file);
        if (w < 500 || h < 500) {
          toast.warning(
            "Image is quite small for product grids. Prefer at least 1000×1000px (1600×1600px is ideal), on a white or neutral background."
          );
        } else {
          const ratio = w / Math.max(h, 1);
          if (ratio < 0.9 || ratio > 1.1) {
            toast.info("Tip: Square (1:1) images display most consistently in shop grids.");
          }
        }
      } catch {
        // ignore dimension read failures
      }

      // Upload to Supabase Storage
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("folder", "products");

      const data = await fetcher.post<{ data?: { url: string } }>("/api/upload", uploadFormData);
      const imageUrl = data.data?.url;
      if (!imageUrl) throw new Error("No URL returned from upload");

      if (isMain) {
        setFormData((prev) => {
          const cleanImageUrls = prev.imageUrls.filter(
            (u) => !u.startsWith("data:") && u !== prev.mainImageUrl
          );
          return {
            ...prev,
            mainImageUrl: imageUrl,
            imageUrls: [imageUrl, ...cleanImageUrls],
          };
        });
      } else {
        setFormData((prev) => {
          const withoutDataUrls = prev.imageUrls.filter((u) => !u.startsWith("data:"));
          if (withoutDataUrls.includes(imageUrl)) return prev;
          return { ...prev, imageUrls: [...withoutDataUrls, imageUrl] };
        });
      }

      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload image");
    } finally {
      setUploadingImages(false);
    }
  };

  const handleVariantImageUpload = async (rowIndex: number, file: File) => {
    try {
      setUploadingImages(true);
      const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        toast.error("Invalid file type. Only images are allowed.");
        return;
      }
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error("File size exceeds 5MB limit");
        return;
      }
      try {
        const { w, h } = await readImageDimensions(file);
        if (w < 400 || h < 400) {
          toast.warning("Variant photos look best at 800×800px or larger on a white background.");
        }
      } catch {
        // ignore
      }
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      uploadFormData.append("folder", "products");
      const data = await fetcher.post<{ data?: { url: string } }>("/api/upload", uploadFormData);
      const imageUrl = data.data?.url;
      if (!imageUrl) throw new Error("No URL returned from upload");
      setFormData((prev) => {
        const next = [...prev.variantRows];
        if (!next[rowIndex]) return prev;
        next[rowIndex] = { ...next[rowIndex], image_url: imageUrl };
        return { ...prev, variantRows: next };
      });
      toast.success("Variant image saved");
    } catch (error) {
      console.error("Variant image upload:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingImages(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("Product name is required");
      return;
    }
    const withVariants = formData.hasVariants && formData.variantRows.length > 0;
    if (withVariants && formData.variantRows.some((r) => r.retail_price === undefined || Number(r.retail_price) < 0)) {
      toast.error("Each variant must have a retail price");
      return;
    }
    if (!withVariants && formData.retailPrice === undefined) {
      toast.error("Retail price is required");
      return;
    }

    try {
      const productData: Record<string, unknown> = {
        name: formData.name,
        barcode: withVariants ? undefined : formData.barcode,
        brand: formData.brand,
        measure: withVariants ? undefined : formData.measure,
        amount: withVariants ? undefined : formData.amount,
        short_description: formData.shortDescription,
        description: formData.description,
        category: formData.category,
        supplier: formData.supplier,
        sku: withVariants ? undefined : (formData.sku || formData.skuCodes[0] || undefined),
        sku_codes: withVariants ? undefined : (formData.skuCodes.length > 0 ? formData.skuCodes : undefined),
        quantity: withVariants ? 0 : formData.quantity,
        low_stock_level: withVariants ? 5 : formData.lowStockLevel,
        reorder_quantity: formData.reorderQuantity,
        supply_price: withVariants ? 0 : formData.supplyPrice,
        retail_price: withVariants ? 0 : formData.retailPrice,
        retail_sales_enabled: formData.retailSalesEnabled,
        markup: withVariants ? undefined : formData.markup,
        tax_rate: formData.taxRate,
        team_member_commission_enabled: formData.teamMemberCommissionEnabled,
        track_stock_quantity: formData.trackStockQuantity,
        receive_low_stock_notifications: formData.receiveLowStockNotifications,
        image_urls: formData.imageUrls
          .filter((url) => !url.startsWith("data:"))
          .length > 0
          ? formData.imageUrls.filter((url) => !url.startsWith("data:"))
          : formData.mainImageUrl && !formData.mainImageUrl.startsWith("data:")
          ? [formData.mainImageUrl]
          : [],
        is_active: true,
      };
      if (withVariants) {
        productData.has_variants = true;
        productData.variant_option_types = formData.variantOptionTypes;
        productData.variants = formData.variantRows.map((r) => ({
          option_values: r.option_values,
          sku: r.sku || undefined,
          barcode: r.barcode || undefined,
          measure: r.measure || undefined,
          amount: r.amount ?? undefined,
          quantity: r.quantity ?? 0,
          low_stock_level: r.low_stock_level ?? 5,
          reorder_quantity: r.reorder_quantity ?? 0,
          supply_price: r.supply_price ?? 0,
          retail_price: r.retail_price,
          markup: r.markup ?? undefined,
          image_url: r.image_url || undefined,
        }));
      }

      if (product) {
        await providerApi.updateProduct(product.id, productData);
        toast.success("Product updated");
      } else {
        await providerApi.createProduct(productData);
        toast.success("Product created");
      }

      onSave();
    } catch (error) {
      console.error("Failed to save product:", error);
      toast.error("Failed to save product");
    }
  };

  // Calculate markup when retail or supply price changes
  const updateMarkup = (retail: number, supply: number) => {
    if (supply > 0) {
      const markupVal = ((retail - supply) / supply) * 100;
      return parseFloat(markupVal.toFixed(2));
    }
    return 0;
  };

  const handleRetailPriceChange = (val: number) => {
    setFormData(prev => ({
      ...prev,
      retailPrice: val,
      markup: updateMarkup(val, prev.supplyPrice)
    }));
  };

  const handleSupplyPriceChange = (val: number) => {
    setFormData(prev => ({
      ...prev,
      supplyPrice: val,
      markup: updateMarkup(prev.retailPrice, val)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{product ? "Edit Product" : "Add a Product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left Column - Main Info */}
            <div className="md:col-span-2 space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Product name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Product"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="barcode">Product barcode</Label>
                  <Input
                    id="barcode"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="UPC, EAN, GTN"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="brand">Product brand</Label>
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto text-primary hover:text-primary-hover text-sm font-normal"
                      onClick={() => setIsBrandDialogOpen(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add brand
                    </Button>
                  </div>
                  <ChipCombobox
                    singleSelect
                    value={formData.brand || null}
                    onChange={(v) => setFormData((prev) => ({ ...prev, brand: v ?? "" }))}
                    staticSuggestions={brands.map((b) => ({ value: b.name, label: b.name }))}
                    fetchSuggestions={async (query) => {
                      try {
                        const res = await fetcher.get<{ data: Array<{ value: string; label: string }> }>(
                          `/api/provider/products/suggestions?field=brand&q=${encodeURIComponent(query)}`
                        );
                        return Array.isArray(res?.data) ? res.data : [];
                      } catch {
                        return [];
                      }
                    }}
                    placeholder="Select or type brand"
                    aria-label="Product brand"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="measure">Measure</Label>
                    <Select 
                      value={formData.measure} 
                      onValueChange={(val) => setFormData({ ...formData, measure: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Milliliters (ml)" />
                      </SelectTrigger>
                      <SelectContent>
                        {getOptions("product_unit").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="amount">Amount</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-500 text-sm">{formData.measure}</span>
                      <Input
                        id="amount"
                        type="number"
                        className="pl-12"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="shortDescription">Short description</Label>
                  <Input
                    id="shortDescription"
                    value={formData.shortDescription}
                    onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="description">Product description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label htmlFor="category">Product category</Label>
                    <Button
                      type="button"
                      variant="link"
                      className="p-0 h-auto text-primary hover:text-primary-hover text-sm font-normal"
                      onClick={() => setIsCategoryDialogOpen(true)}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add product category
                    </Button>
                  </div>
                  <ChipCombobox
                    singleSelect
                    value={formData.category || null}
                    onChange={(v) => setFormData((prev) => ({ ...prev, category: v ?? "" }))}
                    staticSuggestions={categories.map((c) => ({ value: c.name, label: c.name }))}
                    fetchSuggestions={async (query) => {
                      try {
                        const res = await fetcher.get<{ data: Array<{ value: string; label: string }> }>(
                          `/api/provider/products/suggestions?field=category&q=${encodeURIComponent(query)}`
                        );
                        return Array.isArray(res?.data) ? res.data : [];
                      } catch {
                        return [];
                      }
                    }}
                    placeholder="Select or type category"
                    aria-label="Product category"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="hasVariants"
                      checked={formData.hasVariants}
                      onCheckedChange={(checked) => {
                        setFormData((prev) => ({
                          ...prev,
                          hasVariants: checked,
                          variantOptionTypes: checked ? prev.variantOptionTypes : [],
                          variantRows: checked ? prev.variantRows : [],
                        }));
                      }}
                    />
                    <Label htmlFor="hasVariants" className="font-normal text-gray-600">Has variants (e.g. size, volume)</Label>
                  </div>
                  <p className="text-xs text-gray-500">Enable to sell this product in multiple options (e.g. 250ml / 500ml) with separate SKU, price and stock per variant.</p>
                </div>

                {formData.hasVariants && (
                  <div className="space-y-3 rounded-lg border border-gray-200 p-4 bg-gray-50/50">
                    <h4 className="font-medium">Variant options</h4>
                    <p className="text-xs text-gray-500">Add one option type (e.g. Size) and its values. Then generate the variant matrix and fill SKU, price and stock per row.</p>
                    <div className="flex flex-wrap gap-2 items-end">
                      <div className="flex-1 min-w-[120px]">
                        <Label className="text-xs">Option name (e.g. Size)</Label>
                        <Input
                          placeholder="e.g. Size"
                          value={formData.variantOptionTypes[0]?.name ?? ""}
                          onChange={(e) => {
                            const name = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              variantOptionTypes: prev.variantOptionTypes.length
                                ? [{ ...prev.variantOptionTypes[0], name }]
                                : [{ name, values: [] }],
                            }));
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <Label className="text-xs">Values (e.g. 250ml, 500ml or S, M, L)</Label>
                        <ChipCombobox
                          singleSelect={false}
                          value={formData.variantOptionTypes[0]?.values ?? []}
                          onChange={(values) => {
                            setFormData((prev) => ({
                              ...prev,
                              variantOptionTypes: prev.variantOptionTypes.length
                                ? [{ ...prev.variantOptionTypes[0], values }]
                                : [{ name: prev.variantOptionTypes[0]?.name ?? "Option", values }],
                            }));
                          }}
                          staticSuggestions={[
                            "250ml", "500ml", "1L", "100ml", "200ml",
                            "S", "M", "L", "XL", "XXL",
                            "Small", "Medium", "Large",
                            "30ml", "50ml", "75ml",
                          ].map((v) => ({ value: v, label: v }))}
                          allowFreeForm
                          placeholder="Add value..."
                          className="mt-1"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const opt = formData.variantOptionTypes[0];
                          if (!opt?.name || !opt.values?.length) {
                            toast.error("Add option name and at least one value");
                            return;
                          }
                          const rows = opt.values.map((val, idx) => {
                            const existing = formData.variantRows.find(
                              (r) => JSON.stringify(r.option_values) === JSON.stringify({ [opt.name]: val })
                            );
                            if (existing) return existing;
                            return {
                              option_values: { [opt.name]: val },
                              sku: "",
                              barcode: "",
                              measure: formData.measure,
                              amount: 0,
                              quantity: 0,
                              low_stock_level: 5,
                              reorder_quantity: 0,
                              supply_price: 0,
                              retail_price: 0,
                              markup: 0,
                              image_url: "",
                              sort_order: idx,
                            };
                          });
                          setFormData((prev) => ({ ...prev, variantRows: rows }));
                          toast.success(`${rows.length} variant(s) generated`);
                        }}
                      >
                        Generate variant matrix
                      </Button>
                    </div>
                    {formData.variantRows.length > 0 && (
                      <div className="overflow-x-auto border rounded-md">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-100">
                              <th className="text-left p-2 font-medium">Variant</th>
                              <th className="text-left p-2 font-medium min-w-[88px]">Photo</th>
                              <th className="text-left p-2 font-medium">SKU</th>
                              <th className="text-left p-2 font-medium">Barcode</th>
                              <th className="text-left p-2 font-medium">Qty</th>
                              <th className="text-left p-2 font-medium">Supply ({currencyCode})</th>
                              <th className="text-left p-2 font-medium">Retail ({currencyCode})</th>
                            </tr>
                          </thead>
                          <tbody>
                            {formData.variantRows.map((row, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="p-2">
                                  {Object.entries(row.option_values)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(", ")}
                                </td>
                                <td className="p-2 align-middle">
                                  <div className="flex flex-col items-start gap-1">
                                    {row.image_url ? (
                                      <div className="relative h-12 w-12 rounded-xl overflow-hidden bg-white border border-gray-200 shrink-0">
                                        <Image src={row.image_url} alt="" fill className="object-contain p-0.5" unoptimized />
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-gray-400">—</span>
                                    )}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      id={`variant-photo-${idx}`}
                                      onChange={async (e) => {
                                        const f = e.target.files?.[0];
                                        if (f) await handleVariantImageUpload(idx, f);
                                        e.target.value = "";
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-[10px] px-2"
                                      onClick={() => document.getElementById(`variant-photo-${idx}`)?.click()}
                                      disabled={uploadingImages}
                                    >
                                      {row.image_url ? "Replace" : "Add photo"}
                                    </Button>
                                  </div>
                                </td>
                                <td className="p-2">
                                  <Input
                                    className="h-8 w-28"
                                    value={row.sku}
                                    onChange={(e) => {
                                      const next = [...formData.variantRows];
                                      next[idx] = { ...next[idx], sku: e.target.value };
                                      setFormData((prev) => ({ ...prev, variantRows: next }));
                                    }}
                                    placeholder="Auto"
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    className="h-8 w-24"
                                    value={row.barcode}
                                    onChange={(e) => {
                                      const next = [...formData.variantRows];
                                      next[idx] = { ...next[idx], barcode: e.target.value };
                                      setFormData((prev) => ({ ...prev, variantRows: next }));
                                    }}
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number"
                                    className="h-8 w-16"
                                    value={row.quantity}
                                    onChange={(e) => {
                                      const next = [...formData.variantRows];
                                      next[idx] = { ...next[idx], quantity: parseInt(e.target.value, 10) || 0 };
                                      setFormData((prev) => ({ ...prev, variantRows: next }));
                                    }}
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-8 w-20"
                                    value={row.supply_price || ""}
                                    onChange={(e) => {
                                      const next = [...formData.variantRows];
                                      next[idx] = { ...next[idx], supply_price: parseFloat(e.target.value) || 0 };
                                      setFormData((prev) => ({ ...prev, variantRows: next }));
                                    }}
                                  />
                                </td>
                                <td className="p-2">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-8 w-20"
                                    value={row.retail_price || ""}
                                    onChange={(e) => {
                                      const next = [...formData.variantRows];
                                      next[idx] = { ...next[idx], retail_price: parseFloat(e.target.value) || 0 };
                                      setFormData((prev) => ({ ...prev, variantRows: next }));
                                    }}
                                    placeholder="0.00"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {!formData.hasVariants && (
              <>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Pricing</h3>
                
                <div>
                  <Label htmlFor="supplyPrice">Supply price</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500 text-sm">{currencyCode}</span>
                    <Input
                      id="supplyPrice"
                      type="number"
                      step="0.01"
                      className="pl-12"
                      value={formData.supplyPrice}
                      onChange={(e) => handleSupplyPriceChange(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Retail sales</h4>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.retailSalesEnabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, retailSalesEnabled: checked })}
                    />
                    <Label className="font-normal text-gray-600">Enable retail sales</Label>
                  </div>
                  <p className="text-xs text-gray-500">Allow sales of this product at checkout.</p>
                </div>

                {formData.retailSalesEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="retailPrice">Retail price</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-500 text-sm">{currencyCode}</span>
                        <Input
                          id="retailPrice"
                          type="number"
                          step="0.01"
                          className="pl-12"
                          value={formData.retailPrice}
                          onChange={(e) => handleRetailPriceChange(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="markup">Markup</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-500 text-sm">%</span>
                        <Input
                          id="markup"
                          type="number"
                          step="0.01"
                          className="pl-8"
                          value={formData.markup}
                          onChange={(e) => {
                             // Reverse calc retail price if markup changes? Or just store markup?
                             // Usually markup is derived, but user might want to set target markup
                             const val = parseFloat(e.target.value) || 0;
                             const newRetail = formData.supplyPrice * (1 + val / 100);
                             setFormData({ ...formData, markup: val, retailPrice: parseFloat(newRetail.toFixed(2)) });
                          }}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="taxRate">Tax</Label>
                  <Select 
                    value={formData.taxRate.toString()} 
                    onValueChange={(val) => {
                      const rate = parseFloat(val) || 0;
                      setFormData({ ...formData, taxEnabled: rate > 0, taxRate: rate });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Default: No Tax" />
                    </SelectTrigger>
                    <SelectContent>
                      {getOptions("tax_rate").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Team member commission</h4>
                  <p className="text-xs text-gray-500">Calculate team member commission when this product is sold.</p>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.teamMemberCommissionEnabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, teamMemberCommissionEnabled: checked })}
                    />
                    <Label className="font-normal text-gray-600">Enable team member commission</Label>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Inventory</h3>
                <p className="text-sm text-gray-500">Manage stock levels of this product through Beautonomi</p>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sku">SKU (Stock Keeping Unit)</Label>
                    <div className="flex gap-2">
                      <Button 
                        variant="link" 
                        className="p-0 h-auto text-primary hover:text-primary-hover text-sm font-normal"
                        onClick={generateSku}
                        type="button"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Generate SKU automatically
                      </Button>
                      <Button 
                        variant="link" 
                        className="p-0 h-auto text-primary hover:text-primary-hover text-sm font-normal"
                        onClick={addAnotherSkuCode}
                        type="button"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add another SKU code
                      </Button>
                    </div>
                  </div>
                  
                  {/* Main SKU Input */}
                  <div>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => {
                        const newSku = e.target.value;
                        setFormData({ 
                          ...formData, 
                          sku: newSku,
                          skuCodes: formData.skuCodes.length > 0 
                            ? [newSku, ...formData.skuCodes.slice(1)] 
                            : [newSku]
                        });
                      }}
                      placeholder="Leave empty to auto-generate"
                    />
                  </div>

                  {/* Additional SKU Codes */}
                  {formData.skuCodes.length > 1 && (
                    <div className="space-y-2">
                      <Label className="text-sm text-gray-600">Additional SKU Codes</Label>
                      {formData.skuCodes.slice(1).map((skuCode, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={skuCode}
                            onChange={(e) => updateSkuCode(index + 1, e.target.value)}
                            placeholder="Enter SKU code"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSkuCode(index + 1)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    {formData.skuCodes.length > 0 
                      ? `${formData.skuCodes.length} SKU code${formData.skuCodes.length > 1 ? 's' : ''} configured`
                      : "SKU will be auto-generated on save if left empty"}
                  </p>
                </div>

                <div>
                  <Label htmlFor="supplier">Supplier</Label>
                  <div className="flex gap-2 items-center">
                    <ChipCombobox
                      singleSelect
                      value={formData.supplier || null}
                      onChange={(v) => setFormData((prev) => ({ ...prev, supplier: v ?? "" }))}
                      staticSuggestions={suppliers.map((s) => ({ value: s.name, label: s.name }))}
                      fetchSuggestions={async (query) => {
                        try {
                          const res = await fetcher.get<{ data: Array<{ value: string; label: string }> }>(
                            `/api/provider/products/suggestions?field=supplier&q=${encodeURIComponent(query)}`
                          );
                          return Array.isArray(res?.data) ? res.data : [];
                        } catch {
                          return [];
                        }
                      }}
                      placeholder="Select or type supplier"
                      aria-label="Supplier"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setIsSupplierDialogOpen(true)}
                      title="Add new supplier"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Stock quantity</h4>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.trackStockQuantity}
                      onCheckedChange={(checked) => setFormData({ ...formData, trackStockQuantity: checked })}
                    />
                    <Label className="font-normal text-gray-600">Track stock quantity</Label>
                  </div>
                </div>

                {formData.trackStockQuantity && (
                  <div>
                    <Label htmlFor="quantity">Current stock quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Low stock and reordering</h3>
                <p className="text-sm text-gray-500">Beautonomi will automatically notify you and pre-fill the reorder quantity set for future stock orders.</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="lowStockLevel">Low stock level</Label>
                    <Input
                      id="lowStockLevel"
                      type="number"
                      value={formData.lowStockLevel}
                      onChange={(e) => setFormData({ ...formData, lowStockLevel: parseInt(e.target.value) || 0 })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reorderQuantity">Reorder quantity</Label>
                    <Input
                      id="reorderQuantity"
                      type="number"
                      value={formData.reorderQuantity}
                      onChange={(e) => setFormData({ ...formData, reorderQuantity: parseInt(e.target.value) || 0 })}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.receiveLowStockNotifications}
                    onCheckedChange={(checked) => setFormData({ ...formData, receiveLowStockNotifications: checked })}
                  />
                  <Label className="font-normal text-gray-600">Receive low stock notifications</Label>
                </div>
              </div>
              </>
              )}
            </div>

            {/* Right Column - Photos */}
            <div className="space-y-6">
               <div className="bg-pink-50 rounded-xl p-4 sm:p-6 text-center border-2 border-dashed border-pink-200 min-h-[min(400px,70vh)] flex flex-col">
                  <h4 className="font-medium mb-1">Product Photo</h4>
                  <p className="text-xs text-gray-600 mb-4 max-w-sm mx-auto leading-snug">
                    Use a <strong>square</strong> image where possible: <strong>1600×1600px</strong> (minimum 1000×1000px) for sharp catalog tiles.
                    A <strong>white or very light background</strong> matches what buyers expect on major marketplaces (max 5MB).
                  </p>
                  
                  {/* Main Photo */}
                  {formData.mainImageUrl ? (
                    <div className="relative mb-4 w-full h-64 rounded-2xl overflow-hidden bg-white ring-1 ring-gray-100">
                      <Image
                        src={formData.mainImageUrl}
                        alt="Main product"
                        fill
                        className="object-contain p-2 rounded-2xl"
                        unoptimized
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 bg-white hover:bg-gray-100"
                        onClick={() => setFormData({ ...formData, mainImageUrl: "", imageUrls: formData.imageUrls.filter(url => url !== formData.mainImageUrl) })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <div className="mt-2">
                        <span className="text-xs bg-primary text-white px-2 py-1 rounded">Main Photo</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center mb-4">
                      <div className="bg-primary text-white rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4">
                        <Camera className="w-12 h-12" />
                      </div>
                      <input
                        type="file"
                        id="mainImageUpload"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            await handleImageUpload(file, true);
                          }
                        }}
                        disabled={uploadingImages}
                      />
                      <Button 
                        type="button"
                        variant="outline" 
                        className="w-full mb-4"
                        onClick={() => document.getElementById("mainImageUpload")?.click()}
                        disabled={uploadingImages}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadingImages ? "Uploading..." : "Add Photo"}
                      </Button>
                    </div>
                  )}
                  
                  {/* Additional Photos */}
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {formData.imageUrls
                      .filter((url) => url !== formData.mainImageUrl && !url.startsWith("data:"))
                      .slice(0, 2)
                      .map((url, index) => (
                        <div key={index} className="relative aspect-square bg-pink-100 rounded-lg overflow-hidden group">
                          <Image src={url} alt={`Product ${index + 2}`} fill className="object-cover" unoptimized />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-1 right-1 bg-white/80 hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              const newUrls = formData.imageUrls.filter((u) => u !== url);
                              const newMain = formData.mainImageUrl === url ? "" : formData.mainImageUrl;
                              setFormData({ ...formData, imageUrls: newUrls, mainImageUrl: newMain });
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    {formData.imageUrls.filter(url => url !== formData.mainImageUrl && !url.startsWith("data:")).length < 2 && (
                      <div 
                        className={`aspect-square bg-pink-100 rounded-lg flex flex-col items-center justify-center text-pink-500 cursor-pointer hover:bg-pink-200 transition-colors ${uploadingImages ? "opacity-50 cursor-not-allowed" : ""}`}
                        onClick={() => !uploadingImages && document.getElementById("additionalImageUpload")?.click()}
                      >
                        <Camera className="w-6 h-6 mb-1" />
                        <span className="text-xs">{uploadingImages ? "Uploading..." : "Add more Photos"}</span>
                      </div>
                    )}
                  </div>
                  
                  <input
                    type="file"
                    id="additionalImageUpload"
                    accept="image/*"
                    className="hidden"
                    multiple
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      for (const file of files) {
                        await handleImageUpload(file, false);
                      }
                    }}
                    disabled={uploadingImages}
                  />
               </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t sticky bottom-0 bg-white pb-4 z-10">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-[#FF0077] hover:bg-[#D60565] min-w-[100px]">
              Save
            </Button>
          </div>
        </form>

        {/* Quick Create Brand Dialog */}
        <QuickDialog open={isBrandDialogOpen} onOpenChange={setIsBrandDialogOpen}>
          <QuickDialogContent>
            <QuickDialogHeader>
              <QuickDialogTitle>Add New Brand</QuickDialogTitle>
            </QuickDialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="newBrandName">Brand Name</Label>
                <Input
                  id="newBrandName"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  placeholder="Enter brand name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateBrand();
                    }
                  }}
                />
              </div>
            </div>
            <QuickDialogFooter>
              <Button variant="outline" onClick={() => setIsBrandDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateBrand} className="bg-[#FF0077] hover:bg-[#D60565]">
                Add Brand
              </Button>
            </QuickDialogFooter>
          </QuickDialogContent>
        </QuickDialog>

        {/* Quick Create Supplier Dialog */}
        <QuickDialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
          <QuickDialogContent>
            <QuickDialogHeader>
              <QuickDialogTitle>Add New Supplier</QuickDialogTitle>
            </QuickDialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="newSupplierName">Supplier Name</Label>
                <Input
                  id="newSupplierName"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  placeholder="Enter supplier name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateSupplier();
                    }
                  }}
                />
              </div>
            </div>
            <QuickDialogFooter>
              <Button variant="outline" onClick={() => setIsSupplierDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateSupplier} className="bg-[#FF0077] hover:bg-[#D60565]">
                Add Supplier
              </Button>
            </QuickDialogFooter>
          </QuickDialogContent>
        </QuickDialog>

        {/* Quick Create Product Category Dialog */}
        <QuickDialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
          <QuickDialogContent>
            <QuickDialogHeader>
              <QuickDialogTitle>Add New Product Category</QuickDialogTitle>
            </QuickDialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="newCategoryName">Product Category Name</Label>
                <Input
                  id="newCategoryName"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter product category name"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateCategory();
                    }
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  This category will be available for products only
                </p>
              </div>
            </div>
            <QuickDialogFooter>
              <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCategory} className="bg-[#FF0077] hover:bg-[#D60565]">
                Add Product Category
              </Button>
            </QuickDialogFooter>
          </QuickDialogContent>
        </QuickDialog>
      </DialogContent>
    </Dialog>
  );
}
