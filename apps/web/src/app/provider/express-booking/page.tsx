"use client";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { ExpressBookingLink } from "@/lib/provider-portal/types";
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
import { RADIX_SELECT_ANY } from "@/lib/ui/select-radix-sentinels";
import { copyTextToClipboard } from "@/lib/browser/clipboard";

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

  const handleCopyLink = async (link: ExpressBookingLink) => {
    const copied = await copyTextToClipboard(link.full_url);
    if (copied) {
      toast.success("Link copied to clipboard");
      return;
    }
    toast.error("Unable to copy link on this browser");
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
                    <Badge className="bg-gray-100 text-gray-800 shrink-0">Inactive</Badge>
                  ) : isExpired(link) ? (
                    <Badge className="bg-red-100 text-red-800 shrink-0">Expired</Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 shrink-0">Active</Badge>
                  )}
                </div>

                <p className="text-sm text-gray-500 truncate" title={link.full_url}>
                  {link.full_url}
                </p>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-gray-400" />
                    {link.usage_count} clicks
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
                      Expires {new Date(link.expires_at).toLocaleDateString()}
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
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] flex-1"
                    onClick={() => handleViewLink(link)}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Open
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
                  <TableHead>Name</TableHead>
                  <TableHead>Short Code</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Team Member</TableHead>
                  <TableHead>Venue</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Max</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Embed</TableHead>
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
                      {(link.service_ids?.length ?? (link.service_id ? 1 : 0)) > 0 ? (
                        <Badge variant="outline">
                          {(link.service_ids?.length ?? (link.service_id ? 1 : 0))} selected
                        </Badge>
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
                      {link.location_type === "at_home" ? (
                        <span className="text-sm flex items-center gap-1">
                          <Home className="w-3.5 h-3.5" /> At home
                        </span>
                      ) : link.location_type === "at_salon" || link.location_id ? (
                        <span className="text-sm flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" /> At salon
                        </span>
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
                      {link.max_uses != null ? (
                        <span className="text-sm">{link.max_uses}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
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
                              toast.success("Embed URL copied");
                              return;
                            }
                            toast.error("Unable to copy embed URL on this browser");
                          }}
                          title="Copy embed URL"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
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
    service_ids: [] as string[],
    team_member_id: "",
    location_type: "" as "" | "at_salon" | "at_home",
    location_id: "",
    expires_at: "",
    max_uses: "",
    is_active: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

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
      setServices(categories.flatMap((cat) => cat.services));
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
      const slug = formData.short_code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || undefined;
      if (!slug) {
        toast.error("Short code must contain at least one letter or number");
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
              URL: {typeof window !== "undefined" && window.location.origin}/book/l/
              {formData.short_code ? formData.short_code.toLowerCase().replace(/[^a-z0-9-]/g, "") : "…"}
            </p>
          </div>

          <div>
            <Label className="mb-2 block">Pre-select Services (Optional)</Label>
            <p className="text-xs text-gray-500 mb-2">Select one or more; clients will see these pre-filled.</p>
            <div className="max-h-40 overflow-y-auto border rounded-lg p-3 space-y-2">
              {services.length === 0 ? (
                <p className="text-sm text-gray-500">Loading services…</p>
              ) : (
                services.map((service) => (
                  <div key={service.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`svc-${service.id}`}
                      checked={formData.service_ids.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                    />
                    <Label htmlFor={`svc-${service.id}`} className="cursor-pointer text-sm font-normal flex-1">
                      {service.name ?? service.title}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="team_member_id">Pre-select Team Member (Optional)</Label>
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
                  <SelectValue placeholder="Any team member" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RADIX_SELECT_ANY}>Any team member</SelectItem>
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
            <Label className="mb-2 block">Pre-select venue (Optional)</Label>
            <p className="text-xs text-gray-500 mb-2">Choose where the appointment takes place. Any = customer chooses.</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="venue_any"
                  checked={!formData.location_type}
                  onCheckedChange={(checked) =>
                    checked && setFormData({ ...formData, location_type: "", location_id: "" })
                  }
                />
                <Label htmlFor="venue_any" className="cursor-pointer font-normal">Any (customer chooses)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="venue_at_home"
                  checked={formData.location_type === "at_home"}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, location_type: checked ? "at_home" : "", location_id: "" })
                  }
                />
                <Label htmlFor="venue_at_home" className="cursor-pointer font-normal">At home (house call)</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="venue_at_salon"
                  checked={formData.location_type === "at_salon"}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, location_type: checked ? "at_salon" : "", location_id: checked ? formData.location_id : "" })
                  }
                />
                <Label htmlFor="venue_at_salon" className="cursor-pointer font-normal">At salon</Label>
                {formData.location_type === "at_salon" &&
                  (locations.length === 0 ? (
                    <span className="text-sm text-gray-500 ml-2 self-center">No locations</span>
                  ) : (
                    <Select
                      value={formData.location_id}
                      onValueChange={(value) => setFormData({ ...formData, location_id: value })}
                    >
                      <SelectTrigger className="w-[200px] ml-2">
                        <SelectValue placeholder="Choose branch" />
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
              <Label htmlFor="expires_at">Expiration Date (Optional)</Label>
              <Input
                id="expires_at"
                type="date"
                value={formData.expires_at}
                onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty for no expiration</p>
            </div>
            <div>
              <Label htmlFor="max_uses">Max Uses (Optional)</Label>
              <Input
                id="max_uses"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={formData.max_uses}
                onChange={(e) => setFormData({ ...formData, max_uses: e.target.value.replace(/\D/g, "") })}
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty for unlimited clicks</p>
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
              className="bg-primary hover:bg-primary-hover"
            >
              {isLoading ? "Saving..." : link ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
