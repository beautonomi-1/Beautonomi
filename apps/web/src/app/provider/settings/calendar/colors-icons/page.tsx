"use client";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { CalendarColorScheme } from "@/lib/provider-portal/types";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2 } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { CalendarColorSchemeDialog } from "@/components/provider-portal/CalendarColorSchemeDialog";
import { toast } from "sonner";

export default function CalendarColorsIconsPage() {
  const [colorSchemes, setColorSchemes] = useState<CalendarColorScheme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedScheme, setSelectedScheme] = useState<CalendarColorScheme | null>(null);

  const loadColorSchemes = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listCalendarColorSchemes();
      setColorSchemes(data);
    } catch (error) {
      console.error("Failed to load color schemes:", error);
      toast.error("Failed to load color schemes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadColorSchemes();
  }, [loadColorSchemes]);

  const handleCreate = () => {
    setSelectedScheme(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (scheme: CalendarColorScheme) => {
    setSelectedScheme(scheme);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this color scheme?")) return;

    try {
      await providerApi.deleteCalendarColorScheme(id);
      toast.success("Color scheme deleted");
      loadColorSchemes();
    } catch (error) {
      console.error("Failed to delete color scheme:", error);
      toast.error("Failed to delete color scheme");
    }
  };

  const getAppliesToLabel = (scheme: CalendarColorScheme) => {
    if (scheme.applies_to === "service" && scheme.service_id) {
      return "Service";
    }
    if (scheme.applies_to === "status" && scheme.status) {
      return `Status: ${scheme.status}`;
    }
    if (scheme.applies_to === "team_member" && scheme.team_member_id) {
      return "Team Member";
    }
    return scheme.applies_to;
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Calendar", href: "/provider/calendar" },
    { label: "Colors & Icons" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Calendar Colors & Icons"
        subtitle="Customize how appointments appear on your calendar"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading color schemes..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Calendar Colors & Icons"
      subtitle="Customize how appointments appear on your calendar"
      onSave={() => console.log("Save color schemes")}
      breadcrumbs={breadcrumbs}
    >
      <div className="mb-4 flex justify-end">
        <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
          <Plus className="w-4 h-4 mr-2" />
          Add Color Scheme
        </Button>
      </div>

      {colorSchemes.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No color schemes"
            description="Create color schemes to visually organize appointments on your calendar"
            action={{
              label: "Add Color Scheme",
              onClick: handleCreate,
            }}
          />
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Applies To</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Icon</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colorSchemes.map((scheme) => (
                  <TableRow key={scheme.id}>
                    <TableCell className="font-medium">{scheme.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getAppliesToLabel(scheme)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border"
                          style={{ backgroundColor: scheme.color }}
                        />
                        <span className="text-sm">{scheme.color}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {scheme.icon ? (
                        <span className="text-sm">{scheme.icon}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {scheme.is_default ? (
                        <Badge className="bg-green-100 text-green-800">Default</Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(scheme)}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(scheme.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      <CalendarColorSchemeDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        scheme={selectedScheme}
        onSuccess={loadColorSchemes}
      />
    </SettingsDetailLayout>
  );
}