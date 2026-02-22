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

interface FooterSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

interface FooterSettingsModalProps {
  setting: FooterSetting | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function FooterSettingsModal({
  setting,
  isOpen,
  onClose,
  onSave,
}: FooterSettingsModalProps) {
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (setting) {
      setValue(setting.value);
      setDescription(setting.description || "");
    } else {
      setValue("");
      setDescription("");
    }
  }, [setting, isOpen]);

  const handleSave = async () => {
    if (!setting) return;

    if (!value.trim()) {
      toast.error("Value is required");
      return;
    }

    try {
      setIsSaving(true);
      await fetcher.put(`/api/admin/content/footer-settings/${setting.id}`, {
        value: value.trim(),
        description: description.trim() || null,
      });
      toast.success("Footer setting updated");
      onSave();
      onClose();
    } catch (error: any) {
      console.error("Error updating footer setting:", error);
      toast.error(error.message || "Failed to update footer setting");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {setting ? `Edit Footer Setting: ${setting.key}` : "Add Footer Setting"}
          </DialogTitle>
          <DialogDescription>
            {setting?.description || "Update the footer setting value"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              value={setting?.key || ""}
              disabled
              className="bg-gray-50"
            />
            <p className="text-xs text-gray-500">
              The key cannot be changed after creation
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="value">Value *</Label>
            <Textarea
              id="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter the setting value"
              rows={3}
              className="resize-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter a description for this setting"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !value.trim()}
            className="bg-[#FF0077] hover:bg-[#D60565] text-white"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
