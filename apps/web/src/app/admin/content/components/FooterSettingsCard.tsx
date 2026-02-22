"use client";

import React from "react";
import { Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FooterSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

interface FooterSettingsCardProps {
  setting: FooterSetting;
  onEdit: (setting: FooterSetting) => void;
}

export function FooterSettingsCard({ setting, onEdit }: FooterSettingsCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
            {setting.key}
          </CardTitle>
          <button
            onClick={() => onEdit(setting)}
            className="text-sm text-[#FF0077] hover:text-[#D60565] font-medium"
          >
            Edit
          </button>
        </div>
        {setting.description && (
          <p className="text-xs text-gray-500 mt-1">{setting.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200">
          {setting.value}
        </p>
      </CardContent>
    </Card>
  );
}
