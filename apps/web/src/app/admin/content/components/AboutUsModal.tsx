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
import { Textarea } from "@/components/ui/textarea";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface AboutUsContent {
  id: string;
  section_key: string;
  title: string;
  content: string;
  display_order: number;
  is_active: boolean;
}

interface AboutUsModalProps {
  content: AboutUsContent | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function AboutUsModal({
  content,
  isOpen,
  onClose,
  onSave,
}: AboutUsModalProps) {
  const [title, setTitle] = useState("");
  const [sectionKey, setSectionKey] = useState("");
  const [contentText, setContentText] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (content) {
      setTitle(content.title);
      setSectionKey(content.section_key);
      setContentText(content.content);
      setDisplayOrder(content.display_order);
      setIsActive(content.is_active);
    } else {
      setTitle("");
      setSectionKey("");
      setContentText("");
      setDisplayOrder(0);
      setIsActive(true);
    }
  }, [content, isOpen]);

  const handleSave = async () => {
    if (!title.trim() || !sectionKey.trim() || !contentText.trim()) {
      toast.error("Title, section key, and content are required");
      return;
    }

    try {
      setIsSaving(true);
      if (content) {
        await fetcher.put(`/api/admin/content/about-us/${content.id}`, {
          title: title.trim(),
          content: contentText.trim(),
          display_order: displayOrder,
          is_active: isActive,
        });
        toast.success("About Us content updated");
      } else {
        await fetcher.post("/api/admin/content/about-us", {
          section_key: sectionKey.trim(),
          title: title.trim(),
          content: contentText.trim(),
          display_order: displayOrder,
          is_active: isActive,
        });
        toast.success("About Us content created");
      }
      onSave();
      onClose();
    } catch (error: any) {
      console.error("Error saving about us content:", error);
      toast.error(error.message || "Failed to save about us content");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {content ? `Edit About Us Content: ${content.title}` : "Add About Us Content"}
          </DialogTitle>
          <DialogDescription>
            {content
              ? "Update the about us content section"
              : "Create a new section for the About Us modal"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="section_key">Section Key *</Label>
            <Input
              id="section_key"
              value={sectionKey}
              onChange={(e) => setSectionKey(e.target.value)}
              placeholder="e.g., mission, what_we_do, contact_email"
              disabled={!!content}
              className={content ? "bg-gray-50" : ""}
            />
            <p className="text-xs text-gray-500">
              {content
                ? "The section key cannot be changed after creation"
                : "Unique identifier for this section (e.g., mission, what_we_do)"}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Our Mission, What We Do"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">Content *</Label>
            <Textarea
              id="content"
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              placeholder="Enter the content for this section"
              rows={6}
              className="resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>
            <div className="space-y-2 flex items-end">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4"
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !sectionKey.trim() || !contentText.trim()}
            className="bg-[#FF0077] hover:bg-[#D60565] text-white"
          >
            {isSaving ? "Saving..." : content ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
