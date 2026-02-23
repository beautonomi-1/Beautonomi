"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import {
  Medal,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Link2,
} from "lucide-react";
import Link from "next/link";
import RoleGuard from "@/components/auth/RoleGuard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";

type ProviderBadge = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  tier: number;
  color: string | null;
  requirements: Record<string, number>;
  benefits: Record<string, unknown>;
  is_active: boolean;
  display_order: number;
  created_at?: string;
  updated_at?: string;
};

const defaultRequirements = {
  points: 0,
  min_rating: 0,
  min_reviews: 0,
  min_bookings: 0,
};

const defaultBenefits: Record<string, unknown> = {};

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export default function AdminProviderBadgesPage() {
  const [badges, setBadges] = useState<ProviderBadge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    icon_url: "",
    tier: 1,
    color: "#6b7280",
    requirements: { ...defaultRequirements },
    benefitsJson: "{}",
    is_active: true,
    display_order: 0,
  });

  const loadBadges = useCallback(async () => {
    try {
      setIsLoading(true);
      const url = includeInactive
        ? "/api/admin/gamification/badges?include_inactive=true"
        : "/api/admin/gamification/badges";
      const res = await fetcher.get<{ data: { badges: ProviderBadge[] }; badges?: ProviderBadge[] }>(url);
      const list = (res as { data?: { badges?: ProviderBadge[] }; badges?: ProviderBadge[] }).data?.badges
        ?? (res as { badges?: ProviderBadge[] }).badges
        ?? [];
      setBadges(Array.isArray(list) ? list : []);
    } catch {
      toast.error("Failed to load badges");
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    loadBadges();
  }, [loadBadges]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: "",
      slug: "",
      description: "",
      icon_url: "",
      tier: 1,
      color: "#6b7280",
      requirements: { ...defaultRequirements },
      benefitsJson: "{}",
      is_active: true,
      display_order: 0,
    });
    setDialogOpen(true);
  };

  const openEdit = (badge: ProviderBadge) => {
    setEditingId(badge.id);
    const req = badge.requirements && typeof badge.requirements === "object"
      ? {
          points: Number((badge.requirements as Record<string, unknown>).points) || 0,
          min_rating: Number((badge.requirements as Record<string, unknown>).min_rating) || 0,
          min_reviews: Number((badge.requirements as Record<string, unknown>).min_reviews) || 0,
          min_bookings: Number((badge.requirements as Record<string, unknown>).min_bookings) || 0,
        }
      : { ...defaultRequirements };
    setForm({
      name: badge.name,
      slug: badge.slug,
      description: badge.description ?? "",
      icon_url: badge.icon_url ?? "",
      tier: badge.tier,
      color: badge.color ?? "#6b7280",
      requirements: req,
      benefitsJson: JSON.stringify(badge.benefits ?? {}, null, 2),
      is_active: badge.is_active,
      display_order: badge.display_order ?? 0,
    });
    setDialogOpen(true);
  };

  const updateForm = (updates: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...updates }));
    if ("name" in updates && updates.name !== undefined && !editingId) {
      setForm((prev) => ({ ...prev, slug: slugFromName(updates.name) || prev.slug }));
    }
  };

  const updateRequirement = (key: keyof typeof defaultRequirements, value: number) => {
    setForm((prev) => ({
      ...prev,
      requirements: { ...prev.requirements, [key]: value },
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim() || !form.color.trim()) {
      toast.error("Name, slug and color are required");
      return;
    }
    let benefits: Record<string, unknown>;
    try {
      benefits = JSON.parse(form.benefitsJson || "{}");
    } catch {
      toast.error("Benefits must be valid JSON");
      return;
    }
    const requirements = {
      points: Number(form.requirements.points) || 0,
      min_rating: Number(form.requirements.min_rating) || 0,
      min_reviews: Number(form.requirements.min_reviews) || 0,
      min_bookings: Number(form.requirements.min_bookings) || 0,
    };
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
      description: form.description.trim() || null,
      icon_url: form.icon_url.trim() || null,
      tier: Math.min(10, Math.max(1, Number(form.tier) || 1)),
      color: form.color.trim(),
      requirements,
      benefits,
      is_active: form.is_active,
      display_order: Number(form.display_order) || 0,
    };
    try {
      setIsSaving(true);
      if (editingId) {
        await fetcher.patch(`/api/admin/gamification/badges/${editingId}`, payload);
        toast.success("Badge updated");
      } else {
        await fetcher.post("/api/admin/gamification/badges", payload);
        toast.success("Badge created");
      }
      setDialogOpen(false);
      loadBadges();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Failed to save";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      setIsDeleting(true);
      await fetcher.delete(`/api/admin/gamification/badges/${deleteId}`);
      toast.success("Badge deleted");
      setDeleteId(null);
      loadBadges();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Failed to delete";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="container max-w-6xl py-8 px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Medal className="w-8 h-8 text-amber-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Provider badges</h1>
              <p className="text-sm text-gray-500">
                Tier names, requirements and benefits for provider levels. Used for automatic badge assignment by points and stats.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Point earning rules:{" "}
                <Link href="/admin/gamification/point-rules" className="text-[#FF0077] hover:underline inline-flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" />
                  Point rules
                </Link>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <Checkbox
                checked={includeInactive}
                onCheckedChange={(c) => setIncludeInactive(!!c)}
              />
              Include inactive
            </label>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Add badge
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : badges.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-gray-500">
            No badges yet. Add one to define provider tiers (e.g. Bronze, Silver, Gold).
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-700">Name</th>
                    <th className="text-left p-3 font-medium text-gray-700">Tier</th>
                    <th className="text-left p-3 font-medium text-gray-700">Requirements</th>
                    <th className="text-left p-3 font-medium text-gray-700">Benefits</th>
                    <th className="text-left p-3 font-medium text-gray-700">Status</th>
                    <th className="text-right p-3 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {badges.map((b) => {
                    const req = (b.requirements || {}) as Record<string, unknown>;
                    const pts = Number(req.points) ?? 0;
                    const rating = Number(req.min_rating) ?? 0;
                    const reviews = Number(req.min_reviews) ?? 0;
                    const bookings = Number(req.min_bookings) ?? 0;
                    const benefitKeys = b.benefits && typeof b.benefits === "object" ? Object.keys(b.benefits) : [];
                    return (
                      <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50/50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {b.color && (
                              <span
                                className="w-4 h-4 rounded-full shrink-0 border border-gray-200"
                                style={{ backgroundColor: b.color }}
                              />
                            )}
                            <span className="font-medium text-gray-900">{b.name}</span>
                          </div>
                          <div className="text-xs text-gray-500">{b.slug}</div>
                        </td>
                        <td className="p-3">{b.tier}</td>
                        <td className="p-3 text-gray-600">
                          pts≥{pts} · rating≥{rating} · reviews≥{reviews} · bookings≥{bookings}
                        </td>
                        <td className="p-3 text-gray-600">
                          {benefitKeys.length ? benefitKeys.join(", ") : "—"}
                        </td>
                        <td className="p-3">
                          {b.is_active ? (
                            <Badge className="bg-green-100 text-green-800">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setDeleteId(b.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit badge" : "Add badge"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="badge-name">Name *</Label>
                <Input
                  id="badge-name"
                  value={form.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="e.g. Gold"
                />
              </div>
              <div>
                <Label htmlFor="badge-slug">Slug *</Label>
                <Input
                  id="badge-slug"
                  value={form.slug}
                  onChange={(e) => updateForm({ slug: e.target.value })}
                  placeholder="e.g. gold"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="badge-desc">Description</Label>
              <Textarea
                id="badge-desc"
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                placeholder="Optional description"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="badge-tier">Tier (1–10) *</Label>
                <Input
                  id="badge-tier"
                  type="number"
                  min={1}
                  max={10}
                  value={form.tier}
                  onChange={(e) => updateForm({ tier: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
              <div>
                <Label htmlFor="badge-color">Color (hex) *</Label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => updateForm({ color: e.target.value })}
                    className="h-10 w-14 rounded border cursor-pointer"
                  />
                  <Input
                    id="badge-color"
                    value={form.color}
                    onChange={(e) => updateForm({ color: e.target.value })}
                    placeholder="#6b7280"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="badge-icon">Icon URL</Label>
              <Input
                id="badge-icon"
                value={form.icon_url}
                onChange={(e) => updateForm({ icon_url: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label className="mb-2 block">Requirements</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label htmlFor="req-points" className="text-xs text-gray-500">Points</Label>
                  <Input
                    id="req-points"
                    type="number"
                    min={0}
                    value={form.requirements.points}
                    onChange={(e) => updateRequirement("points", parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="req-rating" className="text-xs text-gray-500">Min rating</Label>
                  <Input
                    id="req-rating"
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={form.requirements.min_rating}
                    onChange={(e) => updateRequirement("min_rating", parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="req-reviews" className="text-xs text-gray-500">Min reviews</Label>
                  <Input
                    id="req-reviews"
                    type="number"
                    min={0}
                    value={form.requirements.min_reviews}
                    onChange={(e) => updateRequirement("min_reviews", parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="req-bookings" className="text-xs text-gray-500">Min bookings</Label>
                  <Input
                    id="req-bookings"
                    type="number"
                    min={0}
                    value={form.requirements.min_bookings}
                    onChange={(e) => updateRequirement("min_bookings", parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="badge-benefits">Benefits (JSON)</Label>
              <Textarea
                id="badge-benefits"
                value={form.benefitsJson}
                onChange={(e) => updateForm({ benefitsJson: e.target.value })}
                placeholder='{"featured": true, "free_subscription": false}'
                rows={3}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="badge-active"
                  checked={form.is_active}
                  onCheckedChange={(c) => updateForm({ is_active: !!c })}
                />
                <Label htmlFor="badge-active">Active</Label>
              </div>
              <div>
                <Label htmlFor="badge-order" className="text-xs text-gray-500">Display order</Label>
                <Input
                  id="badge-order"
                  type="number"
                  min={0}
                  value={form.display_order}
                  onChange={(e) => updateForm({ display_order: parseInt(e.target.value, 10) || 0 })}
                  className="w-24"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : editingId ? (
                "Update badge"
              ) : (
                "Create badge"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete badge?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. If this badge is assigned to any providers, you must deactivate it instead of deleting.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RoleGuard>
  );
}
