"use client";

import { useTranslation } from "@beautonomi/i18n";

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
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";
import { unpackProductsListPayload } from "@/lib/http/unpack-provider-fetch";

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

function formatVariantLabel(variant: ProductVariant, fallback: string): string {
  const optionLabel = variant.option_values ? Object.values(variant.option_values).filter(Boolean).join(" / ") : "";
  return optionLabel || variant.sku || fallback;
}

export default function CreatePackagePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
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
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setIsLoadingItems(true);
      // Load both services and products in parallel
      const [servicesResponse, productsResponse] = await Promise.all([
        fetcher.get<{ data: OfferingCard[] }>("/api/provider/services?include_variants=true"),
        fetcher.get<unknown>("/api/provider/products?limit=1000"),
      ]);
      const svcPayload = servicesResponse.data;
      setServices(Array.isArray(svcPayload) ? svcPayload : []);
      const productsData = unpackProductsListPayload(productsResponse) as Product[];
      setProducts(productsData.filter((p) => p.is_active !== false));
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.packages/new.failedToLoadItems"));
      console.error("Error loading items:", err);
    } finally {
      setIsLoadingItems(false);
    }
  };

  const addItem = () => {
    if (services.length === 0 && products.length === 0) {
      toast.error(t("web.provider.pages.packages/new.noServicesOrProducts"));
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
        item.product_variant_id = undefined;
        item.offering = undefined;
        item.product = undefined;
        item.product_variant = undefined;
      }
    } else if (field === "offering_id") {
      item.offering_id = value;
      const selectedService = services.find((s) => s.id === value);
      item.offering = selectedService;
    } else if (field === "product_id") {
      item.product_id = value;
      const selectedProduct = products.find((p) => p.id === value);
      item.product = selectedProduct;
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

    if (!formData.name.trim()) {
      newErrors.name = t("web.provider.pages.packages/new.packageNameRequired");
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = t("web.provider.pages.packages/new.pricePositive");
    }

    if (formData.discount_percentage) {
      const discount = parseFloat(formData.discount_percentage);
      if (isNaN(discount) || discount < 0 || discount > 100) {
        newErrors.discount_percentage = t("web.provider.pages.packages/new.discountRange");
      }
    }

    if (items.length === 0) {
      newErrors.items = t("web.provider.pages.packages/new.atLeastOneItem");
    } else {
      items.forEach((item, index) => {
        if (item.type === "service" && !item.offering_id) {
          newErrors[`item_${index}`] = t("web.provider.pages.packages/new.pleaseSelectService");
        } else if (item.type === "product" && !item.product_id) {
          newErrors[`item_${index}`] = t("web.provider.pages.packages/new.pleaseSelectProduct");
        } else if (
          item.type === "product" &&
          item.product?.has_variants &&
          (item.product.variants?.length ?? 0) > 0 &&
          !item.product_variant_id
        ) {
          newErrors[`item_${index}`] = t("web.provider.pages.packages/new.pleaseSelectVariant");
        }
        if (item.quantity < 1) {
          newErrors[`quantity_${index}`] = t("web.provider.pages.packages/new.quantityAtLeast1");
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast.error(t("web.provider.pages.packages/new.pleaseFixErrors"));
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
            : { product_id: item.product_id, product_variant_id: item.product_variant_id || undefined }
          ),
          quantity: item.quantity,
        })),
      };

      await fetcher.post("/api/provider/packages", payload);
      toast.success(t("web.provider.pages.packages/new.createdSuccessfully"));
      router.push("/provider/packages");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : t("web.provider.pages.packages/new.failedToCreate"));
      console.error("Error creating package:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingItems) {
    return (
      <SettingsDetailLayout
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.sidebar.items.packages"), href: "/provider/packages" },
          { label: t("web.provider.pages.packages/new.createPackage") },
        ]}
      >
        <LoadingTimeout loadingMessage={t("web.provider.pages.packages/new.loadingServicesAndProducts")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.sidebar.items.packages"), href: "/provider/packages" },
        { label: t("web.provider.pages.packages/new.createPackage") },
      ]}
      showCloseButton={true}
    >
      <div className="space-y-6">
        <PageHeader
          title={t("web.provider.pages.packages/new.createPackage")}
          subtitle={t("web.provider.pages.packages/new.subtitle")}
        />

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("web.provider.pages.packages/new.packageDetails")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">
                  {t("web.provider.pages.packages/new.packageName")} <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder={t("web.provider.pages.packages/new.eGCompleteBeauty")}
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-sm text-red-500 mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="description">{t("web.provider.pages.packages/new.description")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t("web.provider.pages.packages/new.describeWhatsIncluded")}
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">
                    {t("web.provider.pages.packages/new.price")} <span className="text-red-500">*</span>
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
                    placeholder={t("web.provider.pages.packages/new.n000")}
                    className={errors.price ? "border-red-500" : ""}
                  />
                  {errors.price && (
                    <p className="text-sm text-red-500 mt-1">{errors.price}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="currency">{t("web.provider.pages.packages/new.currency")}</Label>
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
                  {t("web.provider.pages.packages/new.discountOptional")}
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
                  placeholder={t("web.provider.pages.packages/new.n0")}
                  className={errors.discount_percentage ? "border-red-500" : ""}
                />
                {errors.discount_percentage && (
                  <p className="text-sm text-red-500 mt-1">
                    {errors.discount_percentage}
                  </p>
                )}
                <p className="text-sm text-gray-500 mt-1">
                  {t("web.provider.pages.packages/new.discountHint")}
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
                <Label htmlFor="is_active">{t("web.provider.pages.packages/new.packageIsActive")}</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{t("web.provider.pages.packages/new.itemsIncluded")}</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addItem}
                  disabled={services.length === 0 && products.length === 0}
                >
                  <Plus className="w-4 h-4 me-2" />
                  {t("web.provider.pages.packages/new.addItem")}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {services.length === 0 && products.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 mb-4">
                    {t("web.provider.pages.packages/new.noServicesOrProducts")}
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/provider/services")}
                    >
                      {t("web.provider.pages.packages/new.goToServices")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/provider/products")}
                    >
                      {t("web.provider.pages.packages/new.goToProducts")}
                    </Button>
                  </div>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 mb-4">
                    {t("web.provider.pages.packages/new.noItemsYet")}
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
                        className="flex gap-4 items-start p-4 border rounded-2xl bg-white shadow-sm"
                      >
                        <div className="flex-1 space-y-4">
                          <div>
                            <Label>
                              {t("web.provider.pages.packages/new.type")} <span className="text-red-500">*</span>
                            </Label>
                            <select
                              value={item.type}
                              onChange={(e) =>
                                updateItem(index, "type", e.target.value)
                              }
                              className="w-full px-3 py-2 border rounded-md"
                            >
                              <option value="service">{t("web.provider.common.service")}</option>
                              <option value="product">{t("web.provider.pages.packages/new.product")}</option>
                            </select>
                          </div>

                          <div>
                            <Label>
                              {item.type === "service" ? t("web.provider.common.service") : t("web.provider.pages.packages/new.product")}{" "}
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
                                  <option value="">{t("web.provider.pages.packages/new.selectAService")}</option>
                                  {services.map((service) => (
                                    <option key={service.id} value={service.id}>
                                      {service.title} - {service.currency}{" "}
                                      {service.price}
                                    </option>
                                  ))}
                                </select>
                                {selectedService && (
                                  <p className="text-sm text-gray-500 mt-1">
{t("web.provider.pages.packages/new.durationMinutes", { minutes: selectedService.duration_minutes })}
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
                                  <option value="">{t("web.provider.pages.packages/new.selectAProduct")}</option>
                                  {products.map((product) => (
                                    <option key={product.id} value={product.id}>
                                      {product.name} - {product.currency || LAST_RESORT_CURRENCY}{" "}
                                      {product.retail_price}
{product.sku && t("web.provider.pages.packages/new.skuParen", { sku: product.sku })}
                                    </option>
                                  ))}
                                </select>
                                {selectedProduct && (
                                  <div className="mt-2 space-y-2">
                                    <p className="text-sm text-gray-500">
{selectedProduct.brand && t("web.provider.pages.packages/new.brandSku", { brand: selectedProduct.brand })}
{selectedProduct.sku && t("web.provider.pages.packages/new.skuLabel", { sku: selectedProduct.sku })}
                                    </p>
                                    {selectedProduct.has_variants && (selectedProduct.variants?.length ?? 0) > 0 && (
                                      <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3">
                                        <Label className="text-xs text-purple-900">{t("web.provider.pages.packages/new.variant")}</Label>
                                        <select
                                          value={item.product_variant_id || ""}
                                          onChange={(e) => updateItem(index, "product_variant_id", e.target.value)}
                                          className="mt-1 w-full rounded-md border border-purple-200 bg-white px-3 py-2 text-sm"
                                        >
                                          <option value="">{t("web.provider.pages.packages/new.chooseAVariant")}</option>
                                          {selectedProduct.variants?.map((variant) => (
                                            <option key={variant.id} value={variant.id}>
{formatVariantLabel(variant, t("web.provider.pages.packages/new.variant"))} - {selectedProduct.currency || LAST_RESORT_CURRENCY} {variant.retail_price}
{variant.sku ? t("web.provider.pages.packages/new.skuParen", { sku: variant.sku }) : ""}
                                            </option>
                                          ))}
                                        </select>
                                        <p className="mt-1 text-xs text-purple-700">
                                          {t("web.provider.pages.packages/new.variantHint")}
                                        </p>
                                      </div>
                                    )}
                                  </div>
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
                              {t("web.provider.pages.packages/new.quantity")} <span className="text-red-500">*</span>
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
              {t("web.provider.common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t("web.provider.pages.packages/new.creating") : t("web.provider.pages.packages/new.createPackage")}
            </Button>
          </div>
        </form>
      </div>
    </SettingsDetailLayout>
  );
}
