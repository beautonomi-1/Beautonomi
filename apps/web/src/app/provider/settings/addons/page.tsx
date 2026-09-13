"use client";

import { useTranslation } from "@beautonomi/i18n";
import { LAST_RESORT_CURRENCY } from "@/lib/regions/last-resort-currency";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { providerApi } from "@/lib/provider-portal/api";
import { useConfigBundle } from "@/providers/ConfigBundleProvider";

interface ServiceAddon {
  id: string;
  name: string;
  description?: string | null;
  type: "service" | "product" | "upgrade";
  category?: string | null;
  price: number;
  currency: string;
  duration_minutes?: number | null;
  is_active: boolean;
  is_recommended: boolean;
  image_url?: string | null;
  provider_id?: string | null;
  service_ids: string[];
  max_quantity?: number | null;
  requires_service: boolean;
  sort_order: number;
}

export default function ProviderAddons() {
  const { t } = useTranslation();
  const [addons, setAddons] = useState<ServiceAddon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAddon, setEditingAddon] = useState<ServiceAddon | null>(null);
  const [services, setServices] = useState<Array<{ id: string; title: string }>>([]);
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    loadAddons();
    loadServices();
  }, [filterType]);

  const loadAddons = async () => {
    try {
      setIsLoading(true);
      const params = filterType !== "all" ? `?type=${filterType}` : "";
      const response = await fetcher.get<{ data: ServiceAddon[] }>(`/api/provider/addons${params}`);
      setAddons(response.data || []);
    } catch (error) {
      console.error("Error loading addons:", error);
      toast.error(t("web.provider.settings.pages.addons.failedToLoadAddons"));
    } finally {
      setIsLoading(false);
    }
  };

  const loadServices = async () => {
    try {
      const categories = await providerApi.listServiceCategories();
      // Flatten all services from all categories
      const allServices: Array<{ id: string; title: string }> = [];
      categories.forEach((category) => {
        category.services?.forEach((service) => {
          allServices.push({ id: service.id, title: service.name });
        });
      });
      setServices(allServices);
    } catch (error) {
      console.error("Error loading services:", error);
    }
  };

  const handleCreate = () => {
    setEditingAddon(null);
    setShowDialog(true);
  };

  const handleEdit = (addon: ServiceAddon) => {
    setEditingAddon(addon);
    setShowDialog(true);
  };

  const handleDelete = async (addon: ServiceAddon) => {
    if (!confirm(t("web.provider.settings.pages.addons.deleteConfirm", { name: addon.name }))) return;

    try {
      await fetcher.delete(`/api/provider/addons/${addon.id}`);
      toast.success(t("web.provider.settings.pages.addons.addonDeleted"));
      loadAddons();
    } catch {
      toast.error(t("web.provider.settings.pages.addons.failedToDeleteAddon"));
    }
  };

  const handleSave = async (addonData: any) => {
    try {
      if (editingAddon) {
        await fetcher.put(`/api/provider/addons/${editingAddon.id}`, addonData);
        toast.success(t("web.provider.settings.pages.addons.addonUpdated"));
      } else {
        await fetcher.post("/api/provider/addons", addonData);
        toast.success(t("web.provider.settings.pages.addons.addonCreated"));
      }
      setShowDialog(false);
      setEditingAddon(null);
      loadAddons();
    } catch (error: any) {
      toast.error(error.message || t("web.provider.settings.pages.addons.failedToSave"));
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.settings.pages.addons.loadingAddons")} />;
  }

  const filteredAddons = filterType === "all" ? addons : addons.filter((a) => a.type === filterType);

  return (
    <RoleGuard allowedRoles={["provider_owner"]}>
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.services.items.addons.title")}
        subtitle={t("web.provider.settings.categories.services.items.addons.description")}
        backHref="/provider/settings"
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.addons.serviceAddons") },
        ]}
      >
        <SectionCard>
          <div className="mb-6 flex justify-between items-center">
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-4">
                {t("web.provider.settings.pages.addons.intro")}
              </p>
            </div>
            <Button onClick={handleCreate} className="bg-primary hover:bg-primary-hover">
              <Plus className="w-4 h-4 me-2" />
              {t("web.provider.settings.pages.addons.addAddon")}
            </Button>
          </div>

          <div className="mb-4">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t("web.provider.settings.pages.addons.filterByType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("web.provider.settings.pages.addons.allTypes")}</SelectItem>
                <SelectItem value="service">{t("web.provider.settings.pages.addons.services")}</SelectItem>
                <SelectItem value="product">{t("web.provider.settings.pages.addons.products")}</SelectItem>
                <SelectItem value="upgrade">{t("web.provider.settings.pages.addons.upgrades")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredAddons.length === 0 ? (
            <EmptyState
              title={t("web.provider.settings.categories.services.items.addons.title")}
              description={t("web.provider.settings.pages.addons.emptyDescription")}
              action={{
                label: t("web.provider.settings.pages.addons.addAddon"),
                onClick: handleCreate,
              }}
            />
          ) : (
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("web.provider.settings.pages.addons.name")}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("web.provider.settings.pages.addons.type")}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("web.provider.settings.pages.addons.price")}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("web.provider.settings.pages.addons.duration")}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("web.provider.settings.pages.addons.status")}</th>
                    <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">{t("web.provider.settings.pages.addons.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredAddons.map((addon) => (
                    <tr key={addon.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{addon.name}</span>
                          {addon.is_recommended && (
                            <Badge variant="default" className="bg-pink-100 text-pink-800">
                              {t("web.provider.settings.pages.addons.recommended")}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={addon.type === "service" ? "default" : "secondary"}>
                          {addon.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {addon.currency} {addon.price.toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        {addon.duration_minutes ? t("web.provider.settings.pages.addons.mins", { count: addon.duration_minutes }) : t("web.provider.common.emDash")}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={addon.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {addon.is_active ? t("web.provider.settings.pages.addons.active") : t("web.provider.settings.pages.addons.inactive")}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(addon)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(addon)}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showDialog && (
            <AddonDialog
              addon={editingAddon}
              services={services}
              onClose={() => {
                setShowDialog(false);
                setEditingAddon(null);
              }}
              onSave={handleSave}
            />
          )}
        </SectionCard>
      </SettingsDetailLayout>
    </RoleGuard>
  );
}

function AddonDialog({
  addon,
  services,
  onClose,
  onSave,
}: {
  addon: ServiceAddon | null;
  services: Array<{ id: string; title: string }>;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const { t } = useTranslation();
  const { bundle } = useConfigBundle();
  const tenantCurrency = bundle?.meta?.tenant_region?.default_currency ?? LAST_RESORT_CURRENCY;
  const [formData, setFormData] = useState({
    name: addon?.name || "",
    description: addon?.description || "",
    type: (addon?.type || "service") as "service" | "product" | "upgrade",
    category: addon?.category || "",
    price: addon?.price || 0,
    currency: addon?.currency || tenantCurrency,
    duration_minutes: addon?.duration_minutes || null,
    is_active: addon?.is_active ?? true,
    is_recommended: addon?.is_recommended ?? false,
    image_url: addon?.image_url || "",
    service_ids: addon?.service_ids || [],
    max_quantity: addon?.max_quantity || null,
    requires_service: addon?.requires_service ?? false,
    sort_order: addon?.sort_order || 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      duration_minutes: formData.duration_minutes || null,
      max_quantity: formData.max_quantity || null,
      price: parseFloat(formData.price.toString()),
      sort_order: parseInt(formData.sort_order.toString()),
    });
  };

  const toggleService = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(serviceId)
        ? prev.service_ids.filter((id) => id !== serviceId)
        : [...prev.service_ids, serviceId],
    }));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{addon ? t("web.provider.settings.pages.addons.editAddon") : t("web.provider.settings.pages.addons.addAddon")}</DialogTitle>
          <DialogDescription>
            {t("web.provider.settings.pages.addons.dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">{t("web.provider.settings.pages.addons.nameRequired")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">{t("web.provider.settings.pages.addons.description")}</Label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded-md min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">{t("web.provider.settings.pages.addons.typeRequired")}</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">{t("web.provider.settings.pages.addons.service")}</SelectItem>
                  <SelectItem value="product">{t("web.provider.settings.pages.addons.product")}</SelectItem>
                  <SelectItem value="upgrade">{t("web.provider.settings.pages.addons.upgrade")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category">{t("web.provider.settings.pages.addons.category")}</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="price">{t("web.provider.settings.pages.addons.priceRequired")}</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div>
              <Label htmlFor="currency">{t("web.provider.settings.pages.addons.currencyRequired")}</Label>
              <Input
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                maxLength={3}
                required
              />
            </div>

            <div>
              <Label htmlFor="duration_minutes">{t("web.provider.settings.pages.addons.durationMins")}</Label>
              <Input
                id="duration_minutes"
                type="number"
                min="0"
                value={formData.duration_minutes || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration_minutes: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="image_url">{t("web.provider.settings.pages.addons.imageUrl")}</Label>
            <Input
              id="image_url"
              type="url"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
            />
          </div>

          <div>
            <Label>{t("web.provider.settings.pages.addons.associatedServices")}</Label>
            <div className="mt-2 max-h-40 overflow-y-auto border rounded-md p-2">
              {services.length === 0 ? (
                <p className="text-sm text-gray-500">{t("web.provider.settings.pages.addons.noServicesAvailable")}</p>
              ) : (
                <div className="space-y-2">
                  {services.map((service) => (
                    <label key={service.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.service_ids.includes(service.id)}
                        onChange={() => toggleService(service.id)}
                      />
                      <span className="text-sm">{service.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {t("web.provider.settings.pages.addons.associatedServicesHint")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="max_quantity">{t("web.provider.settings.pages.addons.maxQuantity")}</Label>
              <Input
                id="max_quantity"
                type="number"
                min="1"
                value={formData.max_quantity || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_quantity: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>

            <div>
              <Label htmlFor="sort_order">{t("web.provider.settings.pages.addons.sortOrder")}</Label>
              <Input
                id="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={(e) =>
                  setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              <span>{t("web.provider.settings.pages.addons.active")}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_recommended}
                onChange={(e) => setFormData({ ...formData, is_recommended: e.target.checked })}
              />
              <span>{t("web.provider.settings.pages.addons.recommended")}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.requires_service}
                onChange={(e) => setFormData({ ...formData, requires_service: e.target.checked })}
              />
              <span>{t("web.provider.settings.pages.addons.requiresService")}</span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary-hover">
              {addon ? t("web.provider.common.update") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
