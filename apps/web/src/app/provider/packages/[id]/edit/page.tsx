"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { toast } from "sonner";
import { Plus, Trash2, Package } from "lucide-react";
import type { OfferingCard } from "@/types/beautonomi";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { unpackPackageDetailPayload, unpackProductsListPayload } from "@/lib/http/unpack-provider-fetch";

interface Product {
  id: string;
  name: string;
  retail_price: number;
  currency?: string;
  sku?: string;
  brand?: string;
  is_active?: boolean;
  has_variants?: boolean;
  variants?: ProductVariant[];
}

interface ProductVariant {
  id: string;
  option_values?: Record<string, string> | null;
  retail_price: number;
  sku?: string | null;
  quantity?: number | null;
}

interface PackageItem {
  type: "service" | "product";
  offering_id?: string;
  product_id?: string;
  product_variant_id?: string | null;
  quantity: number;
  offering?: OfferingCard;
  product?: Product;
  product_variant?: ProductVariant | null;
}

function formatVariantLabel(variant: ProductVariant): string {
  const optionLabel = variant.option_values ? Object.values(variant.option_values).filter(Boolean).join(" / ") : "";
  return optionLabel || variant.sku || "Variant";
}

export default function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [services, setServices] = useState<OfferingCard[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    currency: LAST_RESORT_CURRENCY as string,
    discount_percentage: "",
    is_active: true,
  });
  const [items, setItems] = useState<PackageItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAll();
  }, [id]);

  const loadAll = async () => {
    try {
      setIsLoadingData(true);
      const [pkgResponse, servicesResponse, productsResponse] = await Promise.all([
        fetcher.get<unknown>(`/api/provider/packages/${id}`),
        fetcher.get<{ data: OfferingCard[] }>("/api/provider/services?include_variants=true"),
        fetcher.get<unknown>("/api/provider/products?limit=1000"),
      ]);

      const pkg = unpackPackageDetailPayload(pkgResponse);
      if (!pkg) {
        throw new Error("Package not found");
      }
      setFormData({
        name: String(pkg.name ?? ""),
        description: String(pkg.description ?? ""),
        price: pkg.price != null ? String(pkg.price) : "",
        currency: String(pkg.currency ?? LAST_RESORT_CURRENCY),
        discount_percentage:
          pkg.discount_percentage != null ? String(pkg.discount_percentage) : "",
        is_active: pkg.is_active !== false,
      });

      const svcPayload = servicesResponse.data;
      const allServices: OfferingCard[] = Array.isArray(svcPayload) ? svcPayload : [];
      const productsData = unpackProductsListPayload(productsResponse) as Product[];
      const allProducts: Product[] = productsData.filter(
        (p: Product) => p.is_active !== false
      );

      setServices(allServices);
      setProducts(allProducts);

      // Map existing items
      const rawItems = Array.isArray(pkg.items) ? pkg.items : [];
      const existingItems: PackageItem[] = rawItems.map((item: Record<string, unknown>) => {
        if (item.offering_id) {
          const oid = String(item.offering_id);
          return {
            type: "service" as const,
            offering_id: oid,
            quantity: Number(item.quantity) || 1,
            offering: allServices.find((s) => s.id === oid),
          };
        }
        const pid = item.product_id != null ? String(item.product_id) : "";
        return {
          type: "product" as const,
          product_id: pid,
            product_variant_id: item.product_variant_id != null ? String(item.product_variant_id) : undefined,
          quantity: Number(item.quantity) || 1,
          product: allProducts.find((p) => p.id === pid),
            product_variant: allProducts.find((p) => p.id === pid)?.variants?.find((v) => v.id === item.product_variant_id) ?? null,
        };
      });
      setItems(existingItems);
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to load package");
      console.error("Error loading package:", err);
      router.push("/provider/packages");
    } finally {
      setIsLoadingData(false);
    }
  };

  const addItem = () => {
    if (services.length === 0 && products.length === 0) {
      toast.error("No services or products available.");
      return;
    }
    setItems([...items, { type: "service", quantity: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof PackageItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index] };
    if (field === "type") {
      if (value === "service") {
        item.type = "service";
        item.offering_id = "";
        item.product_id = undefined;
        item.offering = undefined;
        item.product = undefined;
      } else {
        item.type = "product";
        item.offering_id = undefined;
        item.product_id = "";
        item.product_variant_id = undefined;
        item.offering = undefined;
        item.product = undefined;
        item.product_variant = undefined;
      }
    } else if (field === "offering_id") {
      item.offering_id = value;
      item.offering = services.find((s) => s.id === value);
    } else if (field === "product_id") {
      item.product_id = value;
      item.product = products.find((p) => p.id === value);
      item.product_variant_id = undefined;
      item.product_variant = undefined;
    } else if (field === "product_variant_id") {
      item.product_variant_id = value || undefined;
      item.product_variant = item.product?.variants?.find((variant) => variant.id === value) ?? null;
    } else {
      (item as any)[field] = value;
    }
    updated[index] = item;
    setItems(updated);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Package name is required";
    if (!formData.price || parseFloat(formData.price) <= 0)
      newErrors.price = "Price must be a positive number";
    if (formData.discount_percentage) {
      const d = parseFloat(formData.discount_percentage);
      if (isNaN(d) || d < 0 || d > 100)
        newErrors.discount_percentage = "Discount must be between 0 and 100";
    }
    if (items.length === 0) {
      newErrors.items = "At least one service or product is required";
    } else {
      items.forEach((item, i) => {
        if (item.type === "service" && !item.offering_id)
          newErrors[`item_${i}`] = "Please select a service";
        else if (item.type === "product" && !item.product_id)
          newErrors[`item_${i}`] = "Please select a product";
        else if (
          item.type === "product" &&
          item.product?.has_variants &&
          (item.product.variants?.length ?? 0) > 0 &&
          !item.product_variant_id
        )
          newErrors[`item_${i}`] = "Please select a product variant";
        if (item.quantity < 1)
          newErrors[`quantity_${i}`] = "Quantity must be at least 1";
      });
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the errors in the form");
      return;
    }
    try {
      setIsLoading(true);
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        price: parseFloat(formData.price),
        currency: formData.currency,
        discount_percentage: formData.discount_percentage
          ? parseFloat(formData.discount_percentage)
          : undefined,
        is_active: formData.is_active,
        items: items.map((item) => ({
          ...(item.type === "service"
            ? { offering_id: item.offering_id }
            : { product_id: item.product_id, product_variant_id: item.product_variant_id || undefined }),
          quantity: item.quantity,
        })),
      };
      await fetcher.patch(`/api/provider/packages/${id}`, payload);
      toast.success("Package updated successfully");
      router.push("/provider/packages");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to update package");
      console.error("Error updating package:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingData) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Packages", href: "/provider/packages" },
          { label: "Edit Package" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading package..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Packages", href: "/provider/packages" },
        { label: "Edit Package" },
      ]}
      showCloseButton={true}
    >
      <div className="space-y-6">
        <PageHeader
          title="Edit Package"
          subtitle="Update your package details and included items"
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Package Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">
                  Package Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Complete Beauty Package"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe what's included in this package..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">
                    Price <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    className={errors.price ? "border-red-500" : ""}
                  />
                  {errors.price && (
                    <p className="text-sm text-red-500 mt-1">{errors.price}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Input
                    id="currency"
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    placeholder={LAST_RESORT_CURRENCY}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="discount_percentage">
                  Discount Percentage (optional)
                </Label>
                <Input
                  id="discount_percentage"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={formData.discount_percentage}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_percentage: e.target.value })
                  }
                  placeholder="0"
                  className={errors.discount_percentage ? "border-red-500" : ""}
                />
                {errors.discount_percentage && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.discount_percentage}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  Percentage discount applied to the total package price
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
                <Label htmlFor="is_active">Package is active</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Items Included</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  disabled={services.length === 0 && products.length === 0}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {errors.items && (
                <p className="text-sm text-red-500">{errors.items}</p>
              )}
              {items.length === 0 && (
                <div className="text-center py-6">
                  <Package className="w-10 h-10 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-500 text-sm">
                    No items added yet. Click "Add Item" to include services or products.
                  </p>
                </div>
              )}
              {items.map((item, index) => (
                <div
                  key={index}
                  className="rounded-2xl border bg-white p-4 shadow-sm space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">
                      Item {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      className="text-red-500 hover:text-red-700 h-8 w-8 p-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={item.type}
                        onValueChange={(v) => updateItem(index, "type", v)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="service">Service</SelectItem>
                          <SelectItem value="product">Product</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">
                        {item.type === "service" ? "Service" : "Product"}
                      </Label>
                      {item.type === "service" ? (
                        <Select
                          value={item.offering_id ?? ""}
                          onValueChange={(v) => updateItem(index, "offering_id", v)}
                        >
                          <SelectTrigger
                            className={`h-9 ${errors[`item_${index}`] ? "border-red-500" : ""}`}
                          >
                            <SelectValue placeholder="Select service" />
                          </SelectTrigger>
                          <SelectContent>
                            {services.map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="space-y-2">
                          <Select
                            value={item.product_id ?? ""}
                            onValueChange={(v) => updateItem(index, "product_id", v)}
                          >
                            <SelectTrigger
                              className={`h-9 ${errors[`item_${index}`] ? "border-red-500" : ""}`}
                            >
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {item.product?.has_variants && (item.product.variants?.length ?? 0) > 0 && (
                            <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3">
                              <Label className="text-xs text-purple-900">Variant</Label>
                              <Select
                                value={item.product_variant_id ?? ""}
                                onValueChange={(v) => updateItem(index, "product_variant_id", v)}
                              >
                                <SelectTrigger className="mt-1 h-9 bg-white">
                                  <SelectValue placeholder="Choose variant" />
                                </SelectTrigger>
                                <SelectContent>
                                  {item.product.variants?.map((variant) => (
                                    <SelectItem key={variant.id} value={variant.id}>
                                      {formatVariantLabel(variant)} - {item.product?.currency || LAST_RESORT_CURRENCY} {variant.retail_price}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="mt-1 text-xs text-purple-700">
                                Pick the exact size, colour, or option included in this package.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {errors[`item_${index}`] && (
                        <p className="text-xs text-red-500 mt-1">
                          {errors[`item_${index}`]}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, "quantity", parseInt(e.target.value) || 1)
                        }
                        className={`h-9 ${errors[`quantity_${index}`] ? "border-red-500" : ""}`}
                      />
                      {errors[`quantity_${index}`] && (
                        <p className="text-xs text-red-500 mt-1">
                          {errors[`quantity_${index}`]}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/provider/packages")}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover"
            >
              {isLoading ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </SettingsDetailLayout>
  );
}
