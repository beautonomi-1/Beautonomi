"use client";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { ExpressBookingLink } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Copy, ExternalLink, Eye } from "lucide-react";
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

export default function ExpressBookingLinksPage() {
  const [links, setLinks] = useState<ExpressBookingLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<ExpressBookingLink | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listExpressBookingLinks();
      setLinks(data);
    } catch (error) {
      console.error("Failed to load express booking links:", error);
      toast.error("Failed to load express booking links");
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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this booking link?")) return;

    try {
      await providerApi.deleteExpressBookingLink(id);
      toast.success("Link deleted");
      loadLinks();
    } catch (error) {
      console.error("Failed to delete link:", error);
      toast.error("Failed to delete link");
    }
  };

  const handleCopyLink = (link: ExpressBookingLink) => {
    navigator.clipboard.writeText(link.full_url);
    toast.success("Link copied to clipboard");
  };

  const handleViewLink = (link: ExpressBookingLink) => {
    window.open(link.full_url, "_blank");
  };

  const isExpired = (link: ExpressBookingLink) => {
    if (!link.expires_at) return false;
    return new Date(link.expires_at) < new Date();
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading express booking links..." />;
  }

  return (
    <div>
      <PageHeader
        title="Express Booking Links"
        subtitle="Create quick booking links for specific services or team members"
        primaryAction={{
          label: "New Link",
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      {links.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No express booking links"
            description="Create booking links to share with clients for quick appointment booking"
            action={{
              label: "Create Link",
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
                  <TableHead>Short Code</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Team Member</TableHead>
                  <TableHead>Usage</TableHead>
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
                      <code className="px-2 py-1 bg-gray-100 rounded text-sm">
                        {link.short_code}
                      </code>
                    </TableCell>
                    <TableCell>
                      {link.service_id ? (
                        <Badge variant="outline">Pre-selected</Badge>
                      ) : (
                        <span className="text-gray-400">Any</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.team_member_id ? (
                        <Badge variant="outline">Pre-selected</Badge>
                      ) : (
                        <span className="text-gray-400">Any</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Eye className="w-3 h-3 text-gray-400" />
                        <span>{link.usage_count} clicks</span>
                      </div>
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

      <ExpressBookingLinkDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        link={selectedLink}
        onSuccess={loadLinks}
      />
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
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    short_code: "",
    service_id: "",
    team_member_id: "",
    expires_at: "",
    is_active: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  useEffect(() => {
    if (open) {
      loadData();
      if (link) {
        setFormData({
          name: link.name,
          short_code: link.short_code,
          service_id: link.service_id || "",
          team_member_id: link.team_member_id || "",
          expires_at: link.expires_at
            ? new Date(link.expires_at).toISOString().split("T")[0]
            : "",
          is_active: link.is_active,
        });
      } else {
        // Generate random short code for new links
        const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        setFormData({
          name: "",
          short_code: randomCode,
          service_id: "",
          team_member_id: "",
          expires_at: "",
          is_active: true,
        });
      }
    }
  }, [open, link]);

  const loadData = async () => {
    try {
      const [categories, members] = await Promise.all([
        providerApi.listServiceCategories(),
        providerApi.listTeamMembers(),
      ]);
      setServices(categories.flatMap((cat) => cat.services));
      setTeamMembers(members);
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const linkData: any = {
        name: formData.name,
        short_code: formData.short_code,
        is_active: formData.is_active,
        expires_at: formData.expires_at
          ? new Date(formData.expires_at).toISOString()
          : undefined,
      };

      if (formData.service_id) {
        linkData.service_id = formData.service_id;
      }

      if (formData.team_member_id) {
        linkData.team_member_id = formData.team_member_id;
      }

      if (link) {
        await providerApi.updateExpressBookingLink(link.id, linkData);
        toast.success("Link updated");
      } else {
        await providerApi.createExpressBookingLink(linkData);
        toast.success("Link created");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save link:", error);
      toast.error("Failed to save link");
    } finally {
      setIsLoading(false);
    }
  };

  const generateRandomCode = () => {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setFormData({ ...formData, short_code: randomCode });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{link ? "Edit Booking Link" : "New Express Booking Link"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Link Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Haircut Special Booking"
              required
            />
          </div>

          <div>
            <Label htmlFor="short_code">Short Code *</Label>
            <div className="flex gap-2">
              <Input
                id="short_code"
                value={formData.short_code}
                onChange={(e) =>
                  setFormData({ ...formData, short_code: e.target.value.toUpperCase() })
                }
                placeholder="ABC123"
                required
                maxLength={10}
              />
              <Button
                type="button"
                variant="outline"
                onClick={generateRandomCode}
              >
                Generate
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              URL will be: {typeof window !== "undefined" && window.location.origin}/book/
              {formData.short_code}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="service_id">Pre-select Service (Optional)</Label>
              <Select
                value={formData.service_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, service_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any service</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="team_member_id">Pre-select Team Member (Optional)</Label>
              <Select
                value={formData.team_member_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, team_member_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any team member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any team member</SelectItem>
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
            <Label htmlFor="expires_at">Expiration Date (Optional)</Label>
            <Input
              id="expires_at"
              type="date"
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty for no expiration
            </p>
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
              Active
            </Label>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Share the generated link with clients</li>
              <li>Clients can book appointments directly</li>
              <li>Pre-selected options will be pre-filled in the booking form</li>
              <li>Track usage to see how many clients use each link</li>
            </ul>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isLoading ? "Saving..." : link ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
