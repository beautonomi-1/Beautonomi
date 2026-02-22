"use client";

import React, { useState, useEffect } from "react";
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

interface Product {
  id: string;
  name: string;
  retail_price: number;
  currency?: string;
  sku?: string;
  brand?: string;
  is_active?: boolean;
}

interface PackageItem {
  type: "service" | "product";
  offering_id?: string;
  product_id?: string;
  quantity: number;
  offering?: OfferingCard;
  product?: Product;
}

export default function CreatePackagePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [services, setServices] = useState<OfferingCard[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    currency: "ZAR",
    discount_percentage: "",
    is_active: true,
  });
  const [items, setItems] = useState<PackageItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setIsLoadingItems(true);
      // Load both services and products in parallel
      const [servicesResponse, productsResponse] = await Promise.all([
        fetcher.get<{ data: OfferingCard[] }>("/api/provider/services"),
        fetcher.get<{ data: Product[]; total?: number }>("/api/provider/products?limit=1000"),
      ]);
      setServices(servicesResponse.data || []);
      // Products API returns { data: { data: [], total, ... } } structure
      const productsData = (productsResponse as any).data?.data || productsResponse.data || [];
      setProducts(productsData.filter((p: Product) => p.is_active !== false));
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to load items");
      console.error("Error loading items:", err);
    } finally {
      setIsLoadingItems(false);
    }
  };

  const addItem = () => {
    if (services.length === 0 && products.length === 0) {
      toast.error("No services or products available. Please create services or products first.");
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
    
    // When changing type, clear the other ID
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
        item.offering = undefined;
        item.product = undefined;
      }
    } else if (field === "offering_id") {
      item.offering_id = value;
      const selectedService = services.find((s) => s.id === value);
      item.offering = selectedService;
    } else if (field === "product_id") {
      item.product_id = value;
      const selectedProduct = products.find((p) => p.id === value);
      item.product = selectedProduct;
    } else {
      (item as any)[field] = value;
    }
    
    updated[index] = item;
    setItems(updated);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Package name is required";
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = "Price must be a positive number";
    }

    if (formData.discount_percentage) {
      const discount = parseFloat(formData.discount_percentage);
      if (isNaN(discount) || discount < 0 || discount > 100) {
        newErrors.discount_percentage = "Discount must be between 0 and 100";
      }
    }

    if (items.length === 0) {
      newErrors.items = "At least one service or product is required";
    } else {
      items.forEach((item, index) => {
        if (item.type === "service" && !item.offering_id) {
          newErrors[`item_${index}`] = "Please select a service";
        } else if (item.type === "product" && !item.product_id) {
          newErrors[`item_${index}`] = "Please select a product";
        }
        if (item.quantity < 1) {
          newErrors[`quantity_${index}`] = "Quantity must be at least 1";
        }
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
            : { product_id: item.product_id }
          ),
          quantity: item.quantity,
        })),
      };

      await fetcher.post("/api/provider/packages", payload);
      toast.success("Package created successfully");
      router.push("/provider/packages");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to create package");
      console.error("Error creating package:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingItems) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Packages", href: "/provider/packages" },
          { label: "Create Package" },
        ]}
      >
        <LoadingTimeout loadingMessage="Loading services and products..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Packages", href: "/provider/packages" },
        { label: "Create Package" },
      ]}
      showCloseButton={true}
    >
      <div className="space-y-6">
        <PageHeader
          title="Create Package"
          subtitle="Create a package by bundling services and products together"
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
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
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
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
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
                    placeholder="ZAR"
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
                    setFormData({
                      ...formData,
                      discount_percentage: e.target.value,
                    })
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
              {services.length === 0 && products.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 mb-4">
                    No services or products available. Please create services or products first.
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/provider/services")}
                    >
                      Go to Services
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/provider/products")}
                    >
                      Go to Products
                    </Button>
                  </div>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">
                    No items added yet. Click "Add Item" to get started.
                  </p>
                </div>
              ) : (
                <>
                  {errors.items && (
                    <p className="text-sm text-red-500">{errors.items}</p>
                  )}
                  {items.map((item, index) => {
                    const selectedService = item.type === "service" 
                      ? services.find((s) => s.id === item.offering_id)
                      : null;
                    const selectedProduct = item.type === "product"
                      ? products.find((p) => p.id === item.product_id)
                      : null;
                    return (
                      <div
                        key={index}
                        className="flex gap-4 items-start p-4 border rounded-lg"
                      >
                        <div className="flex-1 space-y-4">
                          <div>
                            <Label>
                              Type <span className="text-red-500">*</span>
                            </Label>
                            <select
                              value={item.type}
                              onChange={(e) =>
                                updateItem(index, "type", e.target.value)
                              }
                              className="w-full px-3 py-2 border rounded-md"
                            >
                              <option value="service">Service</option>
                              <option value="product">Product</option>
                            </select>
                          </div>

                          <div>
                            <Label>
                              {item.type === "service" ? "Service" : "Product"}{" "}
                              <span className="text-red-500">*</span>
                            </Label>
                            {item.type === "service" ? (
                              <>
                                <select
                                  value={item.offering_id || ""}
                                  onChange={(e) =>
                                    updateItem(index, "offering_id", e.target.value)
                                  }
                                  className={`w-full px-3 py-2 border rounded-md ${
                                    errors[`item_${index}`] ? "border-red-500" : ""
                                  }`}
                                >
                                  <option value="">Select a service</option>
                                  {services.map((service) => (
                                    <option key={service.id} value={service.id}>
                                      {service.title} - {service.currency}{" "}
                                      {service.price}
                                    </option>
                                  ))}
                                </select>
                                {selectedService && (
                                  <p className="text-sm text-gray-500 mt-1">
                                    Duration: {selectedService.duration_minutes} minutes
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <select
                                  value={item.product_id || ""}
                                  onChange={(e) =>
                                    updateItem(index, "product_id", e.target.value)
                                  }
                                  className={`w-full px-3 py-2 border rounded-md ${
                                    errors[`item_${index}`] ? "border-red-500" : ""
                                  }`}
                                >
                                  <option value="">Select a product</option>
                                  {products.map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {product.name} - {product.currency || "ZAR"}{" "}
                                      {product.retail_price}
                                      {product.sku && ` (SKU: ${product.sku})`}
                                    </option>
                                  ))}
                                </select>
                                {selectedProduct && (
                                  <p className="text-sm text-gray-500 mt-1">
                                    {selectedProduct.brand && `${selectedProduct.brand} • `}
                                    {selectedProduct.sku && `SKU: ${selectedProduct.sku}`}
                                  </p>
                                )}
                              </>
                            )}
                            {errors[`item_${index}`] && (
                              <p className="text-sm text-red-500 mt-1">
                                {errors[`item_${index}`]}
                              </p>
                            )}
                          </div>

                          <div>
                            <Label>
                              Quantity <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(
                                  index,
                                  "quantity",
                                  parseInt(e.target.value) || 1
                                )
                              }
                              className={
                                errors[`quantity_${index}`] ? "border-red-500" : ""
                              }
                            />
                            {errors[`quantity_${index}`] && (
                              <p className="text-sm text-red-500 mt-1">
                                {errors[`quantity_${index}`]}
                              </p>
                            )}
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating..." : "Create Package"}
            </Button>
          </div>
        </form>
      </div>
    </SettingsDetailLayout>
  );
}
