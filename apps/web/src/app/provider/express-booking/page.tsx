"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import { ExpressLinkQr } from "@/components/provider/booking/commerce/ExpressLinkQr";
import type { ExpressBookingLink, ServiceItem } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Copy, ExternalLink, Eye, MapPin, Home } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { FetchError } from "@/lib/http/fetcher";
import { SubscriptionGate } from "@/components/provider/SubscriptionGate";
import { getUpgradeMessage, isPlanGateErrorCode } from "@/lib/subscriptions/subscription-upgrade-copy";
import { RADIX_SELECT_ANY } from "@/lib/ui/select-radix-sentinels";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { copyTextToClipboard } from "@/lib/browser/clipboard";

export default function ExpressBookingLinksPage() {
  const { t } = useTranslation();
  const [links, setLinks] = useState<ExpressBookingLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteLinkId, setDeleteLinkId] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<ExpressBookingLink | null>(null);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);

  const loadLinks = useCallback(async () => {
    try {
      setIsLoading(true);
      setSubscriptionRequired(false);
      const data = await providerApi.listExpressBookingLinks();
      setLinks(data);
    } catch (error) {
      if (error instanceof FetchError && error.code === "SUBSCRIPTION_REQUIRED") {
        setSubscriptionRequired(true);
        return;
      }
      console.error("Failed to load express booking links:", error);
      toast.error(t("web.provider.expressBooking.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleCreate = () => {
    setSelectedLink(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (link: ExpressBookingLink) => {
    setSelectedLink(link);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteLinkId(id);
  };

  const confirmDelete = async () => {
    if (!deleteLinkId) return;
    try {
      await providerApi.deleteExpressBookingLink(deleteLinkId);
      setLinks((current) => current.filter((link) => link.id !== deleteLinkId));
      toast.success(t("web.provider.expressBooking.linkDeleted"));
      void loadLinks();
    } catch (error) {
      console.error("Failed to delete link:", error);
      toast.error(t("web.provider.expressBooking.deleteFailed"));
    } finally {
      setDeleteLinkId(null);
    }
  };

  const handleCopyLink = async (link: ExpressBookingLink) => {
    const copied = await copyTextToClipboard(link.full_url);
    if (copied) {
      toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.linkCopiedToClipboard"));
      return;
    }
    toast.error(t("web.provider.settings.pages.calendar/links.unableToCopyLinkOnThis"));
  };

  const handleViewLink = (link: ExpressBookingLink) => {
    window.open(link.full_url, "_blank");
  };

  const isExpired = (link: ExpressBookingLink) => {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.expressBooking.loading")} />;
  }

  if (subscriptionRequired) {
    return (
      <div>
        <PageHeader
          title={t("web.provider.expressBooking.title")}
          subtitle={t("web.provider.expressBooking.subtitle")}
        />
        <SectionCard className="p-12">
          <SubscriptionGate
            feature={t("web.provider.expressBooking.feature")}
            message={getUpgradeMessage("express.feature")}
          />
        </SectionCard>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("web.provider.expressBooking.title")}
        subtitle={t("web.provider.expressBooking.subtitle")}
        primaryAction={{
          label: t("web.provider.expressBooking.newLink"),
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 me-2" />,
        }}
      />

      {links.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title={t("web.provider.expressBooking.emptyTitle")}
            description={t("web.provider.expressBooking.emptyDescription")}
            action={{
              label: t("web.provider.expressBooking.createLink"),
              onClick: handleCreate,
            }}
          />
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden">
          {/* Mobile card layout */}
          <div className="md:hidden divide-y">
            {links.map((link) => (
              <div key={link.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{link.name}</p>
                    <code className="text-xs px-1.5 py-0.5 bg-gray-100 rounded mt-1 inline-block">
                      {link.short_code}
                    </code>
                  </div>
                  {!link.is_active ? (
<Badge className="bg-gray-100 text-gray-800 shrink-0">{t("web.provider.common.inactive")}</Badge>
                  ) : isExpired(link) ? (
<Badge className="bg-red-100 text-red-800 shrink-0">{t("web.provider.common.expired")}</Badge>
                  ) : (
<Badge className="bg-green-100 text-green-800 shrink-0">{t("web.provider.common.active")}</Badge>
                  )}
                </div>

                <p className="text-sm text-gray-500 truncate" title={link.full_url}>
                  {link.full_url}
                </p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-gray-400" />
{t("web.provider.expressBooking.clicks", { count: link.usage_count })}
                  </span>
                  {link.expires_at && (
                    <span
                      className={
                        isExpired(link)
                          ? "text-red-600"
                          : new Date(link.expires_at) <
                            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                          ? "text-yellow-600"
                          : ""
                      }
                    >
{t("web.provider.expressBooking.expiresOn", { date: new Date(link.expires_at).toLocaleDateString() })}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] flex-1"
                    onClick={() => handleCopyLink(link)}
                  >
                    <Copy className="w-4 h-4 me-1" />
                    {t("web.provider.common.copy")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] flex-1"
                    onClick={() => handleViewLink(link)}
                  >
                    <ExternalLink className="w-4 h-4 me-1" />
                    {t("web.provider.common.open")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    onClick={() => handleEdit(link)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(link.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table layout */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("web.provider.common.name")}</TableHead>
                  <TableHead>{t("web.provider.expressBooking.shortCodeCol")}</TableHead>
                  <TableHead>{t("web.provider.expressBooking.services")}</TableHead>
                  <TableHead>{t("web.provider.portal.newSaleDialog.teamMember")}</TableHead>
                  <TableHead>{t("web.provider.common.venue")}</TableHead>
                  <TableHead>{t("web.provider.common.usage")}</TableHead>
                  <TableHead>{t("web.provider.common.max")}</TableHead>
                  <TableHead>{t("web.provider.expressBooking.expiresCol")}</TableHead>
                  <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                  <TableHead>{t("web.provider.common.embed")}</TableHead>
                  <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.name}</TableCell>
                    <TableCell>
                      <code className="px-2 py-1 bg-gray-100 rounded text-sm">
                        {link.short_code}
                      </code>
                    </TableCell>
                    <TableCell>
                      {(link.service_ids?.length ?? (link.service_id ? 1 : 0)) > 0 ? (
                        <Badge variant="outline">
{t("web.provider.expressBooking.selectedCount", { count: (link.service_ids?.length ?? (link.service_id ? 1 : 0)) })}
                        </Badge>
                      ) : (
<span className="text-gray-400">{t("web.provider.common.any")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.team_member_id ? (
<Badge variant="outline">{t("web.provider.expressBooking.preSelected")}</Badge>
                      ) : (
<span className="text-gray-400">{t("web.provider.common.any")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.location_type === "at_home" ? (
                        <span className="text-sm flex items-center gap-1">
<Home className="w-3.5 h-3.5" /> {t("web.provider.expressBooking.atHome")}
                        </span>
                      ) : link.location_type === "at_salon" || link.location_id ? (
                        <span className="text-sm flex items-center gap-1">
<MapPin className="w-3.5 h-3.5" /> {t("web.provider.common.locationType.atSalon")}
                        </span>
                      ) : (
<span className="text-gray-400">{t("web.provider.common.any")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Eye className="w-3 h-3 text-gray-400" />
<span>{t("web.provider.expressBooking.clicks", { count: link.usage_count })}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {link.max_uses != null ? (
                        <span className="text-sm">{link.max_uses}</span>
                      ) : (
<span className="text-gray-400">{t("web.provider.common.emDash")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.expires_at ? (
                        <span
                          className={
                            isExpired(link)
                              ? "text-red-600"
                              : new Date(link.expires_at) <
                                new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                              ? "text-yellow-600"
                              : ""
                          }
                        >
                          {new Date(link.expires_at).toLocaleDateString()}
                        </span>
                      ) : (
<span className="text-gray-400">{t("web.provider.common.never")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!link.is_active ? (
<Badge className="bg-gray-100 text-gray-800">{t("web.provider.common.inactive")}</Badge>
                      ) : isExpired(link) ? (
<Badge className="bg-red-100 text-red-800">{t("web.provider.common.expired")}</Badge>
                      ) : (
<Badge className="bg-green-100 text-green-800">{t("web.provider.common.active")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={async () => {
                            const embedUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/book/l/${encodeURIComponent(link.short_code)}?embed=1`;
                            const copied = await copyTextToClipboard(embedUrl);
                            if (copied) {
toast.success(t("web.provider.settings.pages.appointment-activity/online-booking.embedUrlCopied"));
                              return;
                            }
toast.error(t("web.provider.expressBooking.unableToCopyEmbed"));
                          }}
title={t("web.provider.expressBooking.copyEmbedUrl")}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink(link)}
title={t("web.provider.expressBooking.copyLink")}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewLink(link)}
title={t("web.provider.expressBooking.viewLink")}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(link)}
                        >
                          <Edit className="w-3 h-3 me-1" />
                          {t("web.provider.common.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(link.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3 me-1" />
                          {t("web.provider.common.delete")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      <ExpressBookingLinkDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        link={selectedLink}
        onSuccess={(savedLink) => {
          setLinks((current) => {
            const existingIndex = current.findIndex((item) => item.id === savedLink.id);
            if (existingIndex === -1) {
              return [savedLink, ...current];
            }
            return current.map((item) => (item.id === savedLink.id ? savedLink : item));
          });
          void loadLinks();
        }}
      />

      <AlertDialog open={deleteLinkId != null} onOpenChange={(open) => !open && setDeleteLinkId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
<AlertDialogTitle>{t("web.provider.expressBooking.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
{t("web.provider.expressBooking.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
<AlertDialogCancel>{t("web.provider.common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              {t("web.provider.common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Express Booking Link Create/Edit Dialog
function ExpressBookingLinkDialog({
  open,
  onOpenChange,
  link,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  link: ExpressBookingLink | null;
  onSuccess: (savedLink: ExpressBookingLink) => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    short_code: "",
    service_ids: [] as string[],
    team_member_id: "",
    location_type: "" as "" | "at_salon" | "at_home",
    location_id: "",
    expires_at: "",
    max_uses: "",
    is_active: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    if (open) {
      loadData();
      if (link) {
        const ids = link.service_ids?.length ? link.service_ids : (link.service_id ? [link.service_id] : []);
        setFormData({
          name: link.name,
          short_code: link.short_code,
          service_ids: ids,
          team_member_id: link.team_member_id || "",
          location_type: (link.location_type === "at_salon" || link.location_type === "at_home" ? link.location_type : "") as "" | "at_salon" | "at_home",
          location_id: link.location_id || "",
          expires_at: link.expires_at
            ? new Date(link.expires_at).toISOString().split("T")[0]
            : "",
          max_uses: link.max_uses != null ? String(link.max_uses) : "",
          is_active: link.is_active,
        });
      } else {
        const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        setFormData({
          name: "",
          short_code: randomCode,
          service_ids: [],
          team_member_id: "",
          location_type: "",
          location_id: "",
          expires_at: "",
          max_uses: "",
          is_active: true,
        });
      }
    }
  }, [open, link]);

  const loadData = async () => {
    try {
      const [categories, members, locs] = await Promise.all([
        providerApi.listServiceCategories(),
        providerApi.listTeamMembers(),
        providerApi.listLocations().catch(() => []),
      ]);
      // Include all bookable items: base services, variants (as siblings with parent_service_id), packages, addons
      setServices(
        categories.flatMap((cat) =>
          (cat.services || []).flatMap((svc: any) => {
            const variants: any[] = svc.variants || [];
            if (variants.length > 0) {
              // Keep parent as a label-only entry AND add each variant as a selectable item
              return [
                svc,
                ...variants.map((v: any) => ({
                  ...v,
                  name: v.name || svc.name,
                  parent_service_id: v.parent_service_id || svc.id,
                  service_type: v.service_type || "variant",
                })),
              ];
            }
            return [svc];
          })
        )
      );
      setTeamMembers(members);
      const salonLocs = Array.isArray(locs) ? locs.filter((l: { location_type?: string }) => (l.location_type || "salon") === "salon") : [];
      setLocations(salonLocs.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })));
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Match the provider mobile app's normalization (spaces/invalid chars → hyphen,
      // trim stray hyphens) so an identically-typed short code yields the SAME slug
      // on both platforms instead of "summerpromo" (web) vs "summer-promo" (mobile).
      const slug =
        formData.short_code
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/^-+|-+$/g, "")
          .replace(/-{2,}/g, "-") || undefined;
      if (!slug) {
toast.error(t("web.provider.expressBooking.shortCodeInvalid"));
        setIsLoading(false);
        return;
      }
      const linkData: any = {
        name: formData.name,
        short_code: formData.short_code.trim(),
        is_active: formData.is_active,
        expires_at: formData.expires_at
          ? new Date(formData.expires_at).toISOString()
          : undefined,
        max_uses: formData.max_uses.trim() ? parseInt(formData.max_uses, 10) : undefined,
      };
      if (formData.service_ids.length) linkData.service_ids = formData.service_ids;
      if (formData.team_member_id) linkData.team_member_id = formData.team_member_id;
      if (formData.location_type === "at_home") {
        linkData.location_type = "at_home";
        linkData.location_id = null;
      } else if (formData.location_type === "at_salon") {
        linkData.location_type = "at_salon";
        linkData.location_id = formData.location_id || null;
      } else {
        linkData.location_type = null;
        linkData.location_id = null;
      }

      if (link) {
        const savedLink = await providerApi.updateExpressBookingLink(link.id, linkData);
toast.success(t("web.provider.expressBooking.linkUpdated"));
        onSuccess(savedLink);
      } else {
        const savedLink = await providerApi.createExpressBookingLink(linkData);
toast.success(t("web.provider.expressBooking.linkCreated"));
        onSuccess(savedLink);
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof FetchError && isPlanGateErrorCode(error.code)) {
        toast.error(error.message || getUpgradeMessage("limits.express_links"), {
          action: {
label: t("web.provider.portal.appointmentDialog.viewPlans"),
            onClick: () => {
              window.location.assign("/provider/subscription");
            },
          },
        });
        return;
      }
      console.error("Failed to save link:", error);
toast.error(t("web.provider.expressBooking.saveFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const toggleService = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(id)
        ? prev.service_ids.filter((s) => s !== id)
        : [...prev.service_ids, id],
    }));
  };

  const generateRandomCode = () => {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setFormData({ ...formData, short_code: randomCode });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
<DialogTitle>{link ? t("web.provider.expressBooking.editTitle") : t("web.provider.expressBooking.newTitle")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
<Label htmlFor="name">{t("web.provider.expressBooking.linkName")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
placeholder={t("web.provider.expressBooking.linkNamePlaceholder")}
              required
            />
          </div>

          <div>
<Label htmlFor="short_code">{t("web.provider.expressBooking.shortCode")}</Label>
            <div className="flex gap-2">
              <Input
                id="short_code"
                value={formData.short_code}
                onChange={(e) =>
                  setFormData({ ...formData, short_code: e.target.value.toUpperCase() })
                }
placeholder={t("web.provider.expressBooking.shortCodePlaceholder")}
                required
                maxLength={10}
              />
              <Button
                type="button"
                variant="outline"
                onClick={generateRandomCode}
              >
                {t("web.provider.common.generate")}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
{t("web.provider.expressBooking.urlPreview")} {typeof window !== "undefined" && window.location.origin}/book/l/
              {formData.short_code
                ? formData.short_code
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .replace(/-{2,}/g, "-")
                : "…"}
            </p>
          </div>

          <div>
<Label className="mb-2 block">{t("web.provider.expressBooking.preselectServices")}</Label>
            <p className="text-xs text-gray-500 mb-2">
{t("web.provider.expressBooking.preselectServicesHint")}
            </p>
            <div className="max-h-56 overflow-y-auto border rounded-lg p-3 space-y-1">
              {services.length === 0 ? (
<p className="text-sm text-gray-500">{t("web.provider.expressBooking.loadingServices")}</p>
              ) : (
                (() => {
                  // Group: variants under parents; packages labelled
                  const parents = services.filter((s) => !s.parent_service_id && s.service_type !== "variant");
                  const variantMap = new Map<string, typeof services>();
                  services.filter((s) => s.service_type === "variant" || s.parent_service_id).forEach((v) => {
                    const key = v.parent_service_id ?? v.id;
                    if (!variantMap.has(key)) variantMap.set(key, []);
                    variantMap.get(key)!.push(v);
                  });

                  return parents.flatMap((svc) => {
                    const variants = variantMap.get(svc.id) ?? [];
                    if (variants.length > 0) {
                      return [
                        <p key={`hdr-${svc.id}`} className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2 pb-1">
                          {svc.name}
                        </p>,
                        ...variants.map((v) => (
                          <div key={v.id} className="flex items-center gap-2 ps-2">
                            <Checkbox
                              id={`svc-${v.id}`}
                              checked={formData.service_ids.includes(v.id)}
                              onCheckedChange={() => toggleService(v.id)}
                            />
                            <Label htmlFor={`svc-${v.id}`} className="cursor-pointer text-sm font-normal flex-1">
                              {v.variant_name ?? v.name}
<span className="text-gray-400 ms-1">• {t("web.provider.expressBooking.durationMin", { count: v.duration_minutes })}</span>
                            </Label>
                          </div>
                        )),
                      ];
                    }
                    return [
                      <div key={svc.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`svc-${svc.id}`}
                          checked={formData.service_ids.includes(svc.id)}
                          onCheckedChange={() => toggleService(svc.id)}
                        />
                        <Label htmlFor={`svc-${svc.id}`} className="cursor-pointer text-sm font-normal flex-1">
                          {svc.name ?? (svc as any).title}
                          {svc.service_type === "package" && (
<span className="ms-1.5 text-xs bg-purple-100 text-purple-700 px-1 rounded">{t("web.provider.portal.newSaleDialog.packageBadge")}</span>
                          )}
                          {svc.service_type === "addon" && (
<span className="ms-1.5 text-xs bg-blue-100 text-blue-700 px-1 rounded">{t("web.provider.common.addOn")}</span>
                          )}
                        </Label>
                      </div>,
                    ];
                  });
                })()
              )}
            </div>
            {formData.service_ids.length > 0 && (
<p className="text-xs text-green-600 mt-1">{t("web.provider.expressBooking.itemsSelected", { count: formData.service_ids.length })}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
<Label htmlFor="team_member_id">{t("web.provider.expressBooking.preselectTeam")}</Label>
              <Select
                value={formData.team_member_id || RADIX_SELECT_ANY}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    team_member_id: value === RADIX_SELECT_ANY ? "" : value,
                  })
                }
              >
                <SelectTrigger>
<SelectValue placeholder={t("web.provider.expressBooking.anyTeamMember")} />
                </SelectTrigger>
                <SelectContent>
<SelectItem value={RADIX_SELECT_ANY}>{t("web.provider.expressBooking.anyTeamMember")}</SelectItem>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
<Label className="mb-2 block">{t("web.provider.expressBooking.preselectVenue")}</Label>
<p className="text-xs text-gray-500 mb-2">{t("web.provider.expressBooking.preselectVenueHint")}</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="venue_any"
                  checked={!formData.location_type}
                  onCheckedChange={(checked) =>
                    checked && setFormData({ ...formData, location_type: "", location_id: "" })
                  }
                />
<Label htmlFor="venue_any" className="cursor-pointer font-normal">{t("web.provider.expressBooking.anyCustomerChooses")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="venue_at_home"
                  checked={formData.location_type === "at_home"}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, location_type: checked ? "at_home" : "", location_id: "" })
                  }
                />
<Label htmlFor="venue_at_home" className="cursor-pointer font-normal">{t("web.provider.expressBooking.atHomeHouseCall")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="venue_at_salon"
                  checked={formData.location_type === "at_salon"}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, location_type: checked ? "at_salon" : "", location_id: checked ? formData.location_id : "" })
                  }
                />
<Label htmlFor="venue_at_salon" className="cursor-pointer font-normal">{t("web.provider.common.locationType.atSalon")}</Label>
                {formData.location_type === "at_salon" &&
                  (locations.length === 0 ? (
<span className="text-sm text-gray-500 ms-2 self-center">{t("web.provider.expressBooking.noLocations")}</span>
                  ) : (
                    <Select
                      value={formData.location_id}
                      onValueChange={(value) => setFormData({ ...formData, location_id: value })}
                    >
                      <SelectTrigger className="w-[200px] ms-2">
<SelectValue placeholder={t("web.provider.expressBooking.chooseBranch")} />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
<Label htmlFor="expires_at">{t("web.provider.expressBooking.expirationDate")}</Label>
              <Input
                id="expires_at"
                type="date"
                value={formData.expires_at}
                onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              />
<p className="text-xs text-gray-500 mt-1">{t("web.provider.expressBooking.leaveEmptyNoExpiration")}</p>
            </div>
            <div>
<Label htmlFor="max_uses">{t("web.provider.expressBooking.maxUses")}</Label>
              <Input
                id="max_uses"
                type="number"
                min={1}
placeholder={t("web.provider.common.unlimited")}
                value={formData.max_uses}
                onChange={(e) => setFormData({ ...formData, max_uses: e.target.value.replace(/\D/g, "") })}
              />
<p className="text-xs text-gray-500 mt-1">{t("web.provider.expressBooking.leaveEmptyUnlimited")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_active: !!checked })
              }
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              {t("web.provider.common.active")}
            </Label>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
<p className="font-medium mb-1">{t("web.provider.expressBooking.howItWorks")}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t("web.provider.expressBooking.howShare")}</li>
              <li>{t("web.provider.expressBooking.howBook")}</li>
              <li>{t("web.provider.expressBooking.howPrefill")}</li>
              <li>{t("web.provider.expressBooking.howTrack")}</li>
            </ul>
          </div>

          {link?.full_url ? (
<ExpressLinkQr url={link.full_url} label={t("web.provider.expressBooking.scanExpress")} />
          ) : formData.short_code && typeof window !== "undefined" ? (
            <ExpressLinkQr
              url={`${window.location.origin}/book/l/${formData.short_code
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "-")
                .replace(/^-+|-+$/g, "")
                .replace(/-{2,}/g, "-")}`}
label={t("web.provider.expressBooking.previewQr")}
            />
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover"
            >
{isLoading ? t("web.provider.common.saving") : link ? t("web.provider.common.update") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
