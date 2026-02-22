"use client";

import React from "react";
import { FileText, Edit, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AboutUsContent {
  id: string;
  section_key: string;
  title: string;
  content: string;
  display_order: number;
  is_active: boolean;
}

interface AboutUsCardProps {
  content: AboutUsContent;
  onEdit: (content: AboutUsContent) => void;
  onDelete: (id: string) => void;
}

export function AboutUsCard({ content, onEdit, onDelete }: AboutUsCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" />
            {content.title}
          </CardTitle>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(content)}
              className="text-sm text-[#FF0077] hover:text-[#D60565] font-medium"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(content.id)}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">Section: {content.section_key}</p>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200 line-clamp-3">
          {content.content}
        </p>
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <span className="text-xs text-gray-500">Order: {content.display_order}</span>
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              content.is_active
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {content.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
