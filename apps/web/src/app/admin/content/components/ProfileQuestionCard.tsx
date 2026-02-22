"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProfileQuestion {
  id: string;
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

interface ProfileQuestionCardProps {
  question: ProfileQuestion;
  onEdit: (question: ProfileQuestion) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}

export function ProfileQuestionCard({
  question,
  onEdit,
  onDelete,
  onToggleActive,
}: ProfileQuestionCardProps) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-lg">{question.question_label}</h3>
            {!question.is_active && (
              <Badge variant="secondary">Inactive</Badge>
            )}
            {question.is_required && (
              <Badge variant="destructive">Required</Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 mb-2">
            <span className="font-medium">Key:</span> {question.question_key}
          </p>
          {question.question_description && (
            <p className="text-sm text-gray-500 mb-2">{question.question_description}</p>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-gray-500">
            <span>Type: {question.input_type}</span>
            {question.max_chars && <span>Max: {question.max_chars} chars</span>}
            {question.icon_name && <span>Icon: {question.icon_name}</span>}
            <span>Section: {question.section}</span>
            <span>Order: {question.display_order}</span>
          </div>
        </div>
        <div className="flex gap-2 ml-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleActive(question.id, !question.is_active)}
            title={question.is_active ? "Deactivate" : "Activate"}
          >
            {question.is_active ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(question)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(question.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
