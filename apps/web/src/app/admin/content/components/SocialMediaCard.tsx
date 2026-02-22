"use client";

import React from "react";
import { Edit, Trash2, Facebook, Twitter, Linkedin, Instagram, Youtube, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SocialMediaLink {
  id: string;
  title: string;
  href: string;
  display_order: number;
  is_active: boolean;
}

interface SocialMediaCardProps {
  link: SocialMediaLink;
  onEdit: (link: SocialMediaLink) => void;
  onDelete: (id: string) => void;
}

const iconMap: Record<string, React.ReactNode> = {
  facebook: <Facebook className="w-5 h-5" />,
  twitter: <Twitter className="w-5 h-5" />,
  linkedin: <Linkedin className="w-5 h-5" />,
  instagram: <Instagram className="w-5 h-5" />,
  youtube: <Youtube className="w-5 h-5" />,
  tiktok: <ArrowRight className="w-5 h-5" />, // TikTok icon not available in lucide-react
};

export function SocialMediaCard({ link, onEdit, onDelete }: SocialMediaCardProps) {
  const iconKey = link.title.toLowerCase().replace(/\s+/g, '');
  const icon = iconMap[iconKey] || <ArrowRight className="w-5 h-5" />;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 text-gray-600">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg mb-1">{link.title}</h3>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline truncate block"
                onClick={(e) => e.stopPropagation()}
              >
                {link.href}
              </a>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span>Order: {link.display_order}</span>
                <span
                  className={`px-2 py-1 rounded font-medium ${
                    link.is_active
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {link.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            <button
              onClick={() => onEdit(link)}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Edit"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => onDelete(link.id)}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
