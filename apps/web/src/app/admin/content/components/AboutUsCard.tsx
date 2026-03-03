"use client";

import React from "react";
import { FileText, Edit, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface AboutUsContent {
  id: string;
  section_key: string;
  title: string;
  content: string;
  display_order: number;
  is_active: boolean;
  image_url?: string | null;
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(content)}
              className="h-8 w-8 text-[#FF0077] hover:text-[#D60565]"
            >
              <Edit className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(content.id)}
              className="h-8 w-8 text-red-600 hover:text-red-800"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">Section: {content.section_key}</p>
        {content.image_url && (
          <div className="relative mt-2 w-full h-24 rounded border border-gray-200 overflow-hidden">
            <Image src={content.image_url} alt="" fill className="object-cover" unoptimized />
          </div>
        )}
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
