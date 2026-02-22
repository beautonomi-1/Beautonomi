"use client";

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

export default function CalendarLinksPage() {
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
      toast.error("Failed to load calendar links");
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
    if (!confirm("Are you sure you want to delete this calendar link?")) return;

    try {
      await providerApi.deleteCalendarLink(id);
      toast.success("Calendar link deleted");
      loadLinks();
    } catch (error) {
      console.error("Failed to delete calendar link:", error);
      toast.error("Failed to delete calendar link");
    }
  };

  const handleCopyLink = (link: CalendarLink) => {
    navigator.clipboard.writeText(link.full_url);
    toast.success("Link copied to clipboard");
  };

  const handleViewLink = (link: CalendarLink) => {
    window.open(link.full_url, "_blank");
  };

  const isExpired = (link: CalendarLink) => {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Calendar", href: "/provider/calendar" },
    { label: "Calendar Links" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Calendar Links"
        subtitle="Share your calendar with clients via public links or subscriptions"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading calendar links..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Calendar Links"
      subtitle="Share your calendar with clients via public links or subscriptions"
      onSave={() => console.log("Save calendar links")}
      breadcrumbs={breadcrumbs}
    >
      <div className="mb-4 flex justify-end">
        <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
          <Plus className="w-4 h-4 mr-2" />
          Create Calendar Link
        </Button>
      </div>

      {links.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No calendar links"
            description="Create calendar links to share your schedule with clients"
            action={{
              label: "Create Calendar Link",
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
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Access Count</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="font-medium">{link.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {link.calendar_type === "public" ? "Public" : "Subscription"}
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
                    <TableCell>{link.access_count} views</TableCell>
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
                        <span className="text-gray-400">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!link.is_active ? (
                        <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>
                      ) : isExpired(link) ? (
                        <Badge className="bg-red-100 text-red-800">Expired</Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink(link)}
                          title="Copy link"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewLink(link)}
                          title="View link"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(link)}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(link.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
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