"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PreferenceOption {
  id: string;
  type: 'language' | 'currency' | 'timezone';
  code: string | null;
  name: string;
  display_order: number;
  is_active: boolean;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

interface PreferenceOptionCardProps {
  option: PreferenceOption;
  onEdit: (option: PreferenceOption) => void;
  onDelete: (id: string) => void;
}

export function PreferenceOptionCard({ option, onEdit, onDelete }: PreferenceOptionCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-lg font-semibold">{option.name}</CardTitle>
          {option.code && (
            <Badge variant="outline" className="text-xs">
              {option.code}
            </Badge>
          )}
          <Badge variant={option.is_active ? "default" : "secondary"}>
            {option.is_active ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Inactive
              </span>
            )}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => onEdit(option)}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onDelete(option.id)}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Display Order: {option.display_order}</span>
          {option.metadata && option.metadata.symbol && (
            <span>Symbol: {option.metadata.symbol}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
