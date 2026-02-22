"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";

interface ProfileQuestion {
  id?: string;
  question_key: string;
  question_label: string;
  question_description?: string | null;
  input_type: "input" | "textarea" | "select";
  input_placeholder?: string | null;
  max_chars?: number | null;
  icon_name?: string | null;
  display_order: number;
  section: "profile" | "about" | "preferences" | "interests";
  is_active: boolean;
  is_required: boolean;
}

interface ProfileQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (question: Partial<ProfileQuestion>) => Promise<void>;
  question?: ProfileQuestion | null;
}

export function ProfileQuestionModal({
  isOpen,
  onClose,
  onSave,
  question,
}: ProfileQuestionModalProps) {
  const [formData, setFormData] = useState<Partial<ProfileQuestion>>({
    question_key: "",
    question_label: "",
    question_description: "",
    input_type: "input",
    input_placeholder: "",
    max_chars: 100,
    icon_name: "",
    display_order: 0,
    section: "profile",
    is_active: true,
    is_required: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (question) {
      setFormData(question);
    } else {
      setFormData({
        question_key: "",
        question_label: "",
        question_description: "",
        input_type: "input",
        input_placeholder: "",
        max_chars: 100,
        icon_name: "",
        display_order: 0,
        section: "profile",
        is_active: true,
        is_required: false,
      });
    }
  }, [question, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("Error saving question:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">
            {question ? "Edit Profile Question" : "Add Profile Question"}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="question_key">Question Key *</Label>
            <Input
              id="question_key"
              value={formData.question_key || ""}
              onChange={(e) =>
                setFormData({ ...formData, question_key: e.target.value })
              }
              placeholder="e.g., school, work, favorite_song"
              required
              disabled={!!question} // Can't change key for existing questions
            />
            <p className="text-xs text-gray-500 mt-1">
              Unique identifier (snake_case). Cannot be changed after creation.
            </p>
          </div>

          <div>
            <Label htmlFor="question_label">Question Label *</Label>
            <Input
              id="question_label"
              value={formData.question_label || ""}
              onChange={(e) =>
                setFormData({ ...formData, question_label: e.target.value })
              }
              placeholder="e.g., Where I went to school"
              required
            />
          </div>

          <div>
            <Label htmlFor="question_description">Description</Label>
            <Textarea
              id="question_description"
              value={formData.question_description || ""}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  question_description: e.target.value || null,
                })
              }
              placeholder="Help text shown in modal"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="input_type">Input Type *</Label>
              <Select
                value={formData.input_type || "input"}
                onValueChange={(value: "input" | "textarea" | "select") =>
                  setFormData({ ...formData, input_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="input">Input</SelectItem>
                  <SelectItem value="textarea">Textarea</SelectItem>
                  <SelectItem value="select">Select</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="section">Section *</Label>
              <Select
                value={formData.section || "profile"}
                onValueChange={(
                  value: "profile" | "about" | "preferences" | "interests"
                ) => setFormData({ ...formData, section: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="profile">Profile</SelectItem>
                  <SelectItem value="about">About</SelectItem>
                  <SelectItem value="preferences">Preferences</SelectItem>
                  <SelectItem value="interests">Interests</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="input_placeholder">Placeholder</Label>
              <Input
                id="input_placeholder"
                value={formData.input_placeholder || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    input_placeholder: e.target.value || null,
                  })
                }
                placeholder="Input placeholder text"
              />
            </div>

            <div>
              <Label htmlFor="max_chars">Max Characters</Label>
              <Input
                id="max_chars"
                type="number"
                value={formData.max_chars || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_chars: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                min="0"
                max="1000"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="icon_name">Icon Name</Label>
              <Input
                id="icon_name"
                value={formData.icon_name || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    icon_name: e.target.value || null,
                  })
                }
                placeholder="e.g., GraduationCap, Briefcase"
              />
            </div>

            <div>
              <Label htmlFor="display_order">Display Order *</Label>
              <Input
                id="display_order"
                type="number"
                value={formData.display_order || 0}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    display_order: parseInt(e.target.value) || 0,
                  })
                }
                min="0"
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active ?? true}
                onChange={(e) =>
                  setFormData({ ...formData, is_active: e.target.checked })
                }
              />
              <span>Active</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_required ?? false}
                onChange={(e) =>
                  setFormData({ ...formData, is_required: e.target.checked })
                }
              />
              <span>Required</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : question ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
