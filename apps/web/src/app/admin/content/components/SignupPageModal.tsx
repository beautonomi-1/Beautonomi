"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import WysiwygEditor from "@/components/admin/WysiwygEditor";

/** Accepts PageContent (order) or SignupPageContent (display_order) */
interface SignupPageContent {
  id?: string;
  section_key: string;
  content_type: "text" | "html" | "json" | "image" | "video";
  content: string;
  metadata?: Record<string, any>;
  display_order?: number;
  order?: number;
  is_active: boolean;
}

const getDisplayOrder = (c: SignupPageContent | null) =>
  c ? (c.display_order ?? c.order ?? 0) : 0;

interface SignupPageModalProps {
  content: SignupPageContent | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function SignupPageModal({ content, isOpen, onClose, onSave }: SignupPageModalProps) {
  const [formData, setFormData] = useState<SignupPageContent>({
    section_key: content?.section_key || "",
    content_type: content?.content_type || "text",
    content: content?.content || "",
    metadata: content?.metadata || {},
    display_order: getDisplayOrder(content),
    is_active: content?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [metadataJson, setMetadataJson] = useState(JSON.stringify(formData.metadata || {}, null, 2));

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      
      // Parse metadata JSON
      let parsedMetadata = {};
      try {
        parsedMetadata = metadataJson.trim() ? JSON.parse(metadataJson) : {};
      } catch {
        toast.error("Invalid JSON in metadata field");
        return;
      }

      const payload = {
        page_slug: "signup",
        section_key: formData.section_key,
        content_type: formData.content_type,
        content: formData.content,
        metadata: parsedMetadata,
        display_order: formData.display_order,
        is_active: formData.is_active,
      };

      if (content?.id) {
        await fetcher.put(`/api/admin/content/pages/${content.id}`, payload);
        toast.success("Signup page content updated");
      } else {
        await fetcher.post("/api/admin/content/pages", payload);
        toast.success("Signup page content created");
      }
      onSave();
    } catch (error: any) {
      toast.error(error.message || "Failed to save content");
    } finally {
      setIsSaving(false);
    }
  };

  const sectionKeyOptions = [
    { value: "headline", label: "Headline (Main title)" },
    { value: "sub_heading", label: "Sub-heading" },
    { value: "provider_card_title", label: "Provider Card - Title" },
    { value: "provider_card_micro_copy", label: "Provider Card - Micro Copy" },
    { value: "provider_card_description", label: "Provider Card - Description" },
    { value: "provider_card_badge", label: "Provider Card - Badge Text" },
    { value: "customer_card_title", label: "Customer Card - Title" },
    { value: "customer_card_description", label: "Customer Card - Description" },
    { value: "customer_card_sub_description", label: "Customer Card - Sub Description" },
    { value: "testimonial_quote", label: "Testimonial - Quote" },
    { value: "testimonial_attribution", label: "Testimonial - Attribution" },
    { value: "testimonial_pure_commerce", label: "Testimonial - Pure Commerce Badge" },
    { value: "testimonial_yoco_support", label: "Testimonial - Yoco Support Badge" },
    { value: "background_image_url", label: "Background Image URL" },
    { value: "footer_text", label: "Footer Text" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          {content?.id ? "Edit Signup Page Content" : "Add Signup Page Content"}
        </h2>
        
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>💡 Signup Page Content Management:</strong> Manage all content for the signup entry portal. 
            Use <strong>HTML</strong> content type for rich text formatting. The <strong>background_image_url</strong> 
            section should use <strong>image</strong> content type.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="section_key" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">
                Section Key *
              </Label>
              <select
                id="section_key"
                value={formData.section_key}
                onChange={(e) => setFormData({ ...formData, section_key: e.target.value })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-primary focus:ring-primary"
                required
              >
                <option value="">Select a section...</option>
                {sectionKeyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Input
                type="text"
                value={formData.section_key}
                onChange={(e) => setFormData({ ...formData, section_key: e.target.value })}
                placeholder="Or type custom section key"
                className="mt-2 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <Label htmlFor="content_type" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">
                Content Type *
              </Label>
              <select
                id="content_type"
                value={formData.content_type}
                onChange={(e) => setFormData({ ...formData, content_type: e.target.value as any })}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-primary focus:ring-primary"
                required
              >
                <option value="text">Text</option>
                <option value="html">HTML</option>
                <option value="json">JSON</option>
                <option value="image">Image URL</option>
                <option value="video">Video URL</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="display_order" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">
                Display Order
              </Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2 pt-8">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-primary border-gray-300 dark:border-gray-600 rounded focus:ring-primary"
              />
              <Label htmlFor="is_active" className="text-sm font-medium text-gray-900 dark:text-white">
                Active
              </Label>
            </div>
          </div>

          <div>
            <Label htmlFor="content" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">
              Content *
            </Label>
            {formData.content_type === "html" ? (
              <div className="mt-2">
                <WysiwygEditor
                  value={formData.content}
                  onChange={(value) => setFormData({ ...formData, content: value })}
                  placeholder="Enter your HTML content here..."
                />
              </div>
            ) : (
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md min-h-[150px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-primary focus:ring-primary resize-y font-mono text-sm"
                required
                placeholder={formData.content_type === "image" ? "Enter image URL..." : "Enter content..."}
              />
            )}
          </div>

          <div>
            <Label htmlFor="metadata" className="text-sm font-semibold text-gray-900 dark:text-white mb-2 block">
              Metadata (JSON - Optional)
            </Label>
            <Textarea
              id="metadata"
              value={metadataJson}
              onChange={(e) => setMetadataJson(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md min-h-[100px] bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:border-primary focus:ring-primary resize-y font-mono text-xs"
              placeholder='{"key": "value"}'
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-primary hover:bg-primary/90 text-white shadow-md"
            >
              {isSaving ? "Saving..." : content?.id ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
