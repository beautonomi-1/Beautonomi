"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface AppLink {
  id: string;
  platform: "ios" | "android";
  title: string;
  href: string;
  display_order: number;
  is_active: boolean;
}

export function AppLinkModal({
  link,
  onClose,
  onSave,
}: {
  link: AppLink | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    platform: (link?.platform || "ios") as "ios" | "android",
    title: link?.title || "",
    href: link?.href || "",
    display_order: link?.display_order || 0,
    is_active: link?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      if (link) {
        await fetcher.put(`/api/admin/content/app-links/${link.id}`, formData);
        toast.success("App link updated");
      } else {
        await fetcher.post("/api/admin/content/app-links", formData);
        toast.success("App link created");
      }
      onSave();
    } catch {
      toast.error("Failed to save app link");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {link ? "Edit App Link" : "Add App Link"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="platform">Platform *</Label>
            <select
              id="platform"
              value={formData.platform}
              onChange={(e) => setFormData({ ...formData, platform: e.target.value as any })}
              className="w-full p-2 border rounded-md"
              required
              disabled={!!link} // Can't change platform after creation
            >
              <option value="ios">iOS (App Store)</option>
              <option value="android">Android (Google Play)</option>
            </select>
            {link && <p className="text-xs text-gray-500 mt-1">Platform cannot be changed after creation</p>}
          </div>
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Download app from iOS App Store"
              required
            />
          </div>
          <div>
            <Label htmlFor="href">App Store URL *</Label>
            <Input
              id="href"
              type="url"
              value={formData.href}
              onChange={(e) => setFormData({ ...formData, href: e.target.value })}
              placeholder="https://apps.apple.com/app/... or https://play.google.com/store/apps/..."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Saving..." : link ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
