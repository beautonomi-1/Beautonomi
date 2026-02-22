"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { BlockedTimeType } from "@/lib/provider-portal/types";
import { providerApi } from "@/lib/provider-portal/api";
import { toast } from "sonner";

interface BlockedTimeTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type?: BlockedTimeType | null;
  onSuccess?: () => void;
}

export function BlockedTimeTypeDialog({
  open,
  onOpenChange,
  type,
  onSuccess,
}: BlockedTimeTypeDialogProps) {
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: type?.name || "",
    description: type?.description || "",
    color: type?.color || "#FF0077",
    icon: type?.icon || "",
    is_active: type?.is_active ?? true,
  });

  useEffect(() => {
    if (open && type) {
      setFormData({
        name: type.name,
        description: type.description || "",
        color: type.color || "#FF0077",
        icon: type.icon || "",
        is_active: type.is_active,
      });
    } else if (open) {
      setFormData({
        name: "",
        description: "",
        color: "#FF0077",
        icon: "",
        is_active: true,
      });
    }
  }, [open, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (type) {
        await providerApi.updateBlockedTimeType(type.id, formData);
        toast.success("Blocked time type updated");
      } else {
        await providerApi.createBlockedTimeType(formData);
        toast.success("Blocked time type created");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save blocked time type:", error);
      toast.error("Failed to save blocked time type");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {type ? "Edit Blocked Time Type" : "New Blocked Time Type"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Lunch Break, Training, Meeting"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="color">Color</Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-20"
                />
                <Input
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#FF0077"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="icon">Icon (Optional)</Label>
              <Input
                id="icon"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="Icon name or URL"
              />
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
              {isLoading ? "Saving..." : type ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}