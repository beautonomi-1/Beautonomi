"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Facebook, Twitter, Linkedin, Instagram, Youtube } from "lucide-react";

interface SocialMediaLink {
  id: string;
  title: string;
  href: string;
  display_order: number;
  is_active: boolean;
}

interface SocialMediaModalProps {
  link: SocialMediaLink | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const socialMediaOptions = [
  { value: "Facebook", icon: Facebook },
  { value: "Twitter", icon: Twitter },
  { value: "LinkedIn", icon: Linkedin },
  { value: "Instagram", icon: Instagram },
  { value: "YouTube", icon: Youtube },
  { value: "TikTok", icon: null }, // TikTok icon not available in lucide-react
];

export function SocialMediaModal({
  link,
  isOpen,
  onClose,
  onSave,
}: SocialMediaModalProps) {
  const [formData, setFormData] = useState({
    title: "",
    href: "",
    display_order: 0,
    is_active: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (link) {
      setFormData({
        title: link.title,
        href: link.href,
        display_order: link.display_order,
        is_active: link.is_active,
      });
    } else {
      setFormData({
        title: "",
        href: "",
        display_order: 0,
        is_active: true,
      });
    }
  }, [link, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.href.trim()) {
      toast.error("Title and URL are required");
      return;
    }

    // Validate URL format
    const urlPattern = /^(https?:\/\/|www\.)/i;
    if (!urlPattern.test(formData.href)) {
      toast.error("Please enter a valid URL (must start with http://, https://, or www.)");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        section: "social" as const,
        title: formData.title.trim(),
        href: formData.href.trim(),
        display_order: formData.display_order,
        is_external: true,
        is_active: formData.is_active,
      };

      if (link) {
        await fetcher.put(`/api/admin/content/footer-links/${link.id}`, payload);
        toast.success("Social media link updated");
      } else {
        await fetcher.post("/api/admin/content/footer-links", payload);
        toast.success("Social media link created");
      }
      onSave();
      onClose();
    } catch (error: any) {
      console.error("Error saving social media link:", error);
      toast.error(error.message || "Failed to save social media link");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlatformSelect = (platform: string) => {
    setFormData({
      ...formData,
      title: platform,
      href: formData.href || `https://${platform.toLowerCase()}.com/`,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {link ? "Edit Social Media Link" : "Add Social Media Link"}
          </DialogTitle>
          <DialogDescription>
            Manage your social media links that appear in the footer
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="platform">Platform (Quick Select)</Label>
            <Select onValueChange={handlePlatformSelect} value={formData.title}>
              <SelectTrigger>
                <SelectValue placeholder="Select a platform or type custom name" />
              </SelectTrigger>
              <SelectContent>
                {socialMediaOptions.map((option) => {
                  const IconComponent = option.icon;
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        {IconComponent && <IconComponent className="w-4 h-4" />}
                        {option.value}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">
              Select a platform to auto-fill, or type a custom name below
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Platform Name *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Facebook, Twitter, Instagram"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="href">URL *</Label>
            <Input
              id="href"
              type="url"
              value={formData.href}
              onChange={(e) => setFormData({ ...formData, href: e.target.value })}
              placeholder="https://facebook.com/yourpage"
              required
            />
            <p className="text-xs text-gray-500">
              Must start with http://, https://, or www.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                }
                min="0"
              />
              <p className="text-xs text-gray-500">
                Lower numbers appear first
              </p>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
                className="w-4 h-4"
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Active (visible in footer)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !formData.title.trim() || !formData.href.trim()}
              className="bg-[#FF0077] hover:bg-[#D60565] text-white"
            >
              {isSaving ? "Saving..." : link ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
