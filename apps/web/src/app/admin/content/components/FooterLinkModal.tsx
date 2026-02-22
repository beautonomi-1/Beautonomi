"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface FooterLink {
  id: string;
  section: "about" | "business" | "legal" | "social" | "apps";
  title: string;
  href: string;
  display_order: number;
  is_external: boolean;
  is_active: boolean;
}

export function FooterLinkModal({
  link,
  onClose,
  onSave,
}: {
  link: FooterLink | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    section: (link?.section || "about") as "about" | "business" | "legal" | "social" | "apps",
    title: link?.title || "",
    href: link?.href || "",
    display_order: link?.display_order || 0,
    is_external: link?.is_external ?? false,
    is_active: link?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      if (link) {
        await fetcher.put(`/api/admin/content/footer-links/${link.id}`, formData);
        toast.success("Footer link updated");
      } else {
        await fetcher.post("/api/admin/content/footer-links", formData);
        toast.success("Footer link created");
      }
      onSave();
    } catch {
      toast.error("Failed to save footer link");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {link ? "Edit Footer Link" : "Add Footer Link"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="section">Section *</Label>
            <select
              id="section"
              value={formData.section}
              onChange={(e) => setFormData({ ...formData, section: e.target.value as any })}
              className="w-full p-2 border rounded-md"
              required
            >
              <option value="about">About Beautonomi</option>
              <option value="business">For Business</option>
              <option value="legal">Legal</option>
              <option value="social">Social Media</option>
              <option value="apps">Apps</option>
            </select>
          </div>
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div>
            <Label htmlFor="href">URL/Href *</Label>
            <Input
              id="href"
              type="text"
              value={formData.href}
              onChange={(e) => setFormData({ ...formData, href: e.target.value })}
              placeholder="/career or https://example.com"
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
                id="is_external"
                checked={formData.is_external}
                onChange={(e) =>
                  setFormData({ ...formData, is_external: e.target.checked })
                }
              />
              <Label htmlFor="is_external">External Link</Label>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
