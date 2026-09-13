"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { CalendarLink } from "@/lib/provider-portal/types";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Copy, ExternalLink, Calendar } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { CalendarLinkDialog } from "@/components/provider-portal/CalendarLinkDialog";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/browser/clipboard";

export default function CalendarLinksPage() {
  const { t } = useTranslation();
  const [links, setLinks] = useState<CalendarLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<CalendarLink | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listCalendarLinks();
      setLinks(data);
    } catch (error) {
      console.error("Failed to load calendar links:", error);
      toast.error(t("web.provider.settings.pages.calendar/links.failedToLoadCalendarLinks"));
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

  const handleEdit = (link: CalendarLink) => {
    setSelectedLink(link);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.calendar/links.deleteConfirm"))) return;

    try {
      await providerApi.deleteCalendarLink(id);
      toast.success(t("web.provider.settings.pages.calendar/links.calendarLinkDeleted"));
      loadLinks();
    } catch (error) {
      console.error("Failed to delete calendar link:", error);
      toast.error(t("web.provider.settings.pages.calendar/links.failedToDeleteCalendarLink"));
    }
  };

  const handleCopyLink = async (link: CalendarLink) => {
    const copied = await copyTextToClipboard(link.full_url);
    if (copied) {
      toast.success(t("web.provider.settings.pages.calendar/links.linkCopiedToClipboard"));
      return;
    }
    toast.error(t("web.provider.settings.pages.calendar/links.unableToCopyLinkOnThis"));
  };

  const handleViewLink = (link: CalendarLink) => {
    window.open(link.full_url, "_blank");
  };

  const isExpired = (link: CalendarLink) => {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.calendar/links.calendar"), href: "/provider/calendar" },
    { label: t("web.provider.settings.pages.calendar/links.calendarLinks") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.calendarLinks.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.calendarLinks.description")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.calendar/links.loadingCalendarLinks")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.appointmentActivity.items.calendarLinks.title")}
      subtitle={t("web.provider.settings.categories.appointmentActivity.items.calendarLinks.description")}
      breadcrumbs={breadcrumbs}
    >
      <div className="mb-4 flex justify-end">
        <Button onClick={handleCreate} className="bg-primary hover:bg-primary-hover">
          <Plus className="w-4 h-4 me-2" />
          {t("web.provider.settings.pages.calendar/links.createCalendarLink")}
        </Button>
      </div>

      {links.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title={t("web.provider.settings.pages.calendar/links.noCalendarLinks")}
            description={t("web.provider.settings.pages.calendar/links.emptyDescription")}
            action={{
              label: t("web.provider.settings.pages.calendar/links.createCalendarLink"),
              onClick: handleCreate,
            }}
          />
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("web.provider.common.name")}</TableHead>
                  <TableHead>{t("web.provider.common.type")}</TableHead>
                  <TableHead>{t("web.provider.common.breadcrumbProvider")}</TableHead>
                  <TableHead>{t("web.provider.settings.pages.calendar/links.link")}</TableHead>
                  <TableHead>{t("web.provider.settings.pages.calendar/links.accessCount")}</TableHead>
                  <TableHead>{t("web.provider.settings.pages.calendar/links.expires")}</TableHead>
                  <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                  <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {link.calendar_type === "public" ? t("web.provider.common.public") : t("web.provider.settings.pages.calendar/links.subscription")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span className="capitalize">{link.provider}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="px-2 py-1 bg-gray-100 rounded text-sm">
                        {link.full_url.substring(0, 40)}...
                      </code>
                    </TableCell>
                    <TableCell>{t("web.provider.settings.pages.calendar/links.viewsCount", { count: link.access_count })}</TableCell>
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
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink(link)}
                          title={t("web.provider.settings.pages.calendar/links.copyLink")}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewLink(link)}
                          title={t("web.provider.settings.pages.calendar/links.viewLink")}
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

      <CalendarLinkDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        link={selectedLink}
        onSuccess={loadLinks}
      />
    </SettingsDetailLayout>
  );
}