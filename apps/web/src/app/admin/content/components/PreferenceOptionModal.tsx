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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";

interface PreferenceOption {
  id: string;
  type: 'language' | 'currency' | 'timezone';
  code: string | null;
  name: string;
  display_order: number;
  is_active: boolean;
  metadata?: any;
}

interface PreferenceOptionModalProps {
  option: PreferenceOption | null;
  type: 'language' | 'currency' | 'timezone';
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function PreferenceOptionModal({
  option,
  type,
  isOpen,
  onClose,
  onSave,
}: PreferenceOptionModalProps) {
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    display_order: 0,
    is_active: true,
    metadata: {} as any,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (option) {
      setFormData({
        code: option.code || "",
        name: option.name,
        display_order: option.display_order,
        is_active: option.is_active,
        metadata: option.metadata || {},
      });
    } else {
      setFormData({
        code: "",
        name: "",
        display_order: 0,
        is_active: true,
        metadata: {},
      });
    }
  }, [option, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error("Name is required");
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        type,
        code: formData.code.trim() || null,
        name: formData.name.trim(),
        display_order: formData.display_order,
        is_active: formData.is_active,
        metadata: Object.keys(formData.metadata).length > 0 ? formData.metadata : null,
      };

      if (option) {
        await fetcher.put(`/api/admin/content/preference-options/${option.id}`, payload);
        toast.success(`${type} updated`);
      } else {
        await fetcher.post("/api/admin/content/preference-options", payload);
        toast.success(`${type} created`);
      }
      onSave();
    } catch (error: any) {
      console.error("Failed to save preference option:", error);
      // Extract error message from API response
      let errorMessage = `Failed to save ${type}`;
      if (error.message) {
        errorMessage = error.message;
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {option ? `Edit ${type}` : `Add ${type}`}
          </DialogTitle>
          <DialogDescription>
            {option ? `Update the ${type} option` : `Create a new ${type} option for users to select`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={type === 'language' ? 'e.g., English' : type === 'currency' ? 'e.g., United States dollar' : 'e.g., (GMT-05:00) Eastern Time'}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">
              Code {type === 'timezone' ? '(Optional)' : '(Recommended)'}
            </Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder={type === 'language' ? 'e.g., en' : type === 'currency' ? 'e.g., USD' : 'e.g., GMT-5'}
            />
            <p className="text-xs text-gray-500">
              {type === 'language' && 'ISO language code (e.g., en, es, fr)'}
              {type === 'currency' && 'ISO currency code (e.g., USD, EUR, GBP)'}
              {type === 'timezone' && 'Timezone identifier (optional)'}
            </p>
          </div>

          {type === 'currency' && (
            <div className="space-y-2">
              <Label htmlFor="symbol">Currency Symbol (Optional)</Label>
              <Input
                id="symbol"
                value={formData.metadata?.symbol || ""}
                onChange={(e) => setFormData({
                  ...formData,
                  metadata: { ...formData.metadata, symbol: e.target.value }
                })}
                placeholder="e.g., R, €, £"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                min="0"
              />
              <p className="text-xs text-gray-500">Lower numbers appear first</p>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Active (visible to users)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !formData.name.trim()}
              className="bg-[#FF0077] hover:bg-[#D60565] text-white"
            >
              {isSaving ? "Saving..." : option ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
