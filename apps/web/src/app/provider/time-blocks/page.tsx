"use client";

import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { TimeBlock, BlockedTimeType } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Clock, Repeat, Calendar } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeBlockDialog } from "@/components/provider-portal/TimeBlockDialog";
import { BlockedTimeTypeDialog } from "@/components/provider-portal/BlockedTimeTypeDialog";
import { toast } from "sonner";

export default function TimeBlocksPage() {
  const { t } = useTranslation();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [blockedTimeTypes, setBlockedTimeTypes] = useState<BlockedTimeType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("blocks");
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isTypeDialogOpen, setIsTypeDialogOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [selectedType, setSelectedType] = useState<BlockedTimeType | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [blocks, types] = await Promise.all([
        providerApi.listTimeBlocks(),
        providerApi.listBlockedTimeTypes(),
      ]);
      setTimeBlocks(blocks);
      setBlockedTimeTypes(types);
    } catch (error) {
      console.error("Failed to load time blocks:", error);
      toast.error(t("web.provider.timeBlocksPage.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateBlock = () => {
    setSelectedBlock(null);
    setIsBlockDialogOpen(true);
  };

  const handleEditBlock = (block: TimeBlock) => {
    setSelectedBlock(block);
    setIsBlockDialogOpen(true);
  };

  const handleDeleteBlock = async (id: string) => {
    if (!confirm(t("web.provider.timeBlocksPage.deleteConfirm"))) return;

    // Optimistic removal so the row disappears immediately
    const prev = timeBlocks;
    setTimeBlocks((blocks) => blocks.filter((b) => b.id !== id));

    try {
      await providerApi.deleteTimeBlock(id);
      toast.success(t("web.provider.timeBlocksPage.deleted"));
      // Bust the GET cache so the background refresh returns fresh data
      const { clearFetcherCache } = await import("@/lib/http/fetcher");
      clearFetcherCache();
      loadData();
    } catch (error) {
      console.error("Failed to delete time block:", error);
      toast.error(t("web.provider.timeBlocksPage.deleteFailed"));
      setTimeBlocks(prev);
    }
  };

  const handleCreateType = () => {
    setSelectedType(null);
    setIsTypeDialogOpen(true);
  };

  const handleEditType = (type: BlockedTimeType) => {
    setSelectedType(type);
    setIsTypeDialogOpen(true);
  };

  const handleDeleteType = async (id: string) => {
    if (!confirm(t("web.provider.timeBlocksPage.deleteTypeConfirm"))) return;

    const prev = blockedTimeTypes;
    setBlockedTimeTypes((types) => types.filter((t) => t.id !== id));

    try {
      await providerApi.deleteBlockedTimeType(id);
      toast.success(t("web.provider.timeBlocksPage.typeDeleted"));
      const { clearFetcherCache } = await import("@/lib/http/fetcher");
      clearFetcherCache();
      loadData();
    } catch (error) {
      console.error("Failed to delete blocked time type:", error);
      toast.error(t("web.provider.timeBlocksPage.deleteTypeFailed"));
      setBlockedTimeTypes(prev);
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.timeBlocksPage.loading")} />;
  }

  return (
    <div>
      <PageHeader
        title={t("web.provider.timeBlocksPage.title")}
        subtitle={t("web.provider.timeBlocksPage.subtitle")}
      />

      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">
          <strong>{t("web.provider.timeBlocksPage.howTitle")}</strong> {t("web.provider.timeBlocksPage.howBody")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="blocks">
            <Clock className="w-4 h-4 me-2" />
            {t("web.provider.timeBlocksPage.title")}
          </TabsTrigger>
          <TabsTrigger value="types">
            <Calendar className="w-4 h-4 me-2" />
            {t("web.provider.timeBlocksPage.blockedTimeTypes")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="blocks" className="mt-6">
          <div className="mb-4 flex justify-end">
            <Button onClick={handleCreateBlock} className="bg-primary hover:bg-primary-hover">
              <Plus className="w-4 h-4 me-2" />
              {t("web.provider.timeBlocksPage.addTimeBlock")}
            </Button>
          </div>

          {timeBlocks.length === 0 ? (
            <SectionCard className="p-12">
              <EmptyState
                title={t("web.provider.timeBlocksPage.emptyTitle")}
                description={t("web.provider.timeBlocksPage.emptyDescription")}
                action={{
                  label: t("web.provider.timeBlocksPage.addTimeBlock"),
                  onClick: handleCreateBlock,
                }}
              />
            </SectionCard>
          ) : (
            <SectionCard className="p-0 overflow-hidden">
              {/* Mobile card layout */}
              <div className="md:hidden divide-y">
                {timeBlocks.map((block) => (
                  <div key={block.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{block.name}</p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {block.team_member_name || t("web.provider.timeBlocksPage.allTeamMembers")}
                        </p>
                      </div>
                      {block.is_active ? (
                        <Badge className="bg-green-100 text-green-800 shrink-0">{t("web.provider.common.active")}</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800 shrink-0">{t("web.provider.common.inactive")}</Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {block.date}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        {block.start_time} - {block.end_time}
                      </span>
                      {block.is_recurring && (
                        <span className="flex items-center gap-1">
                          <Repeat className="w-3.5 h-3.5 text-gray-400" />
                          {t("web.provider.timeBlocksPage.recurring")}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] flex-1"
                        onClick={() => handleEditBlock(block)}
                      >
                        <Edit className="w-4 h-4 me-1" />
                        {t("web.provider.common.edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteBlock(block.id)}
                      >
                        <Trash2 className="w-4 h-4 me-1" />
                        {t("web.provider.common.delete")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table layout */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("web.provider.common.name")}</TableHead>
                      <TableHead>{t("web.provider.timeBlocksPage.date")}</TableHead>
                      <TableHead>{t("web.provider.timeBlocksPage.time")}</TableHead>
                      <TableHead>{t("web.provider.timeBlocksPage.teamMember")}</TableHead>
                      <TableHead>{t("web.provider.common.type")}</TableHead>
                      <TableHead>{t("web.provider.timeBlocksPage.recurring")}</TableHead>
                      <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                      <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeBlocks.map((block) => (
                      <TableRow key={block.id}>
                        <TableCell className="font-medium">{block.name}</TableCell>
                        <TableCell>{block.date}</TableCell>
                        <TableCell>
                          {block.start_time} - {block.end_time}
                        </TableCell>
                        <TableCell>
                          {block.team_member_name || (
                            <span className="text-gray-400">{t("web.provider.timeBlocksPage.allTeamMembers")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {block.blocked_time_type_name || (
                            <span className="text-gray-400">{t("web.provider.common.hyphen")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {block.is_recurring ? (
                            <div className="flex items-center gap-1">
                              <Repeat className="w-3 h-3 text-gray-400" />
                              <span className="text-sm">{t("web.provider.common.yes")}</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">{t("web.provider.common.no")}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {block.is_active ? (
                            <Badge className="bg-green-100 text-green-800">{t("web.provider.common.active")}</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800">{t("web.provider.common.inactive")}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditBlock(block)}
                            >
                              <Edit className="w-3 h-3 me-1" />
                              {t("web.provider.common.edit")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteBlock(block.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3 me-1" />
                              {t("web.provider.common.delete")}
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
        </TabsContent>

        <TabsContent value="types" className="mt-6">
          <div className="mb-4 flex justify-end">
            <Button onClick={handleCreateType} className="bg-primary hover:bg-primary-hover">
              <Plus className="w-4 h-4 me-2" />
              {t("web.provider.timeBlocksPage.addType")}
            </Button>
          </div>

          {blockedTimeTypes.length === 0 ? (
            <SectionCard className="p-12">
              <EmptyState
                title={t("web.provider.timeBlocksPage.emptyTypesTitle")}
                description={t("web.provider.timeBlocksPage.emptyTypesDescription")}
                action={{
                  label: t("web.provider.timeBlocksPage.addType"),
                  onClick: handleCreateType,
                }}
              />
            </SectionCard>
          ) : (
            <SectionCard className="p-0 overflow-hidden">
              {/* Mobile card layout */}
              <div className="md:hidden divide-y">
                {blockedTimeTypes.map((type) => (
                  <div key={type.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div
                          className="w-5 h-5 rounded border shrink-0"
                          style={{ backgroundColor: type.color || "#FF0077" }}
                        />
                        <div className="min-w-0">
                          <p className="font-medium">{type.name}</p>
                          {type.description && (
                            <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">{type.description}</p>
                          )}
                        </div>
                      </div>
                      {type.is_active ? (
                        <Badge className="bg-green-100 text-green-800 shrink-0">{t("web.provider.common.active")}</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800 shrink-0">{t("web.provider.common.inactive")}</Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] flex-1"
                        onClick={() => handleEditType(type)}
                      >
                        <Edit className="w-4 h-4 me-1" />
                        {t("web.provider.common.edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[44px] text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteType(type.id)}
                      >
                        <Trash2 className="w-4 h-4 me-1" />
                        {t("web.provider.common.delete")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table layout */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("web.provider.common.name")}</TableHead>
                      <TableHead>{t("web.provider.common.description")}</TableHead>
                      <TableHead>{t("web.provider.timeBlocksPage.color")}</TableHead>
                      <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                      <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedTimeTypes.map((type) => (
                      <TableRow key={type.id}>
                        <TableCell className="font-medium">{type.name}</TableCell>
                        <TableCell className="max-w-xs truncate">
{type.description || t("web.provider.common.hyphen")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-6 rounded border"
                              style={{ backgroundColor: type.color || "#FF0077" }}
                            />
                            <span className="text-sm">{type.color || "#FF0077"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {type.is_active ? (
                            <Badge className="bg-green-100 text-green-800">{t("web.provider.common.active")}</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-800">{t("web.provider.common.inactive")}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-end">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditType(type)}
                            >
                              <Edit className="w-3 h-3 me-1" />
                              {t("web.provider.common.edit")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteType(type.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3 me-1" />
                              {t("web.provider.common.delete")}
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
        </TabsContent>
      </Tabs>

      <TimeBlockDialog
        open={isBlockDialogOpen}
        onOpenChange={setIsBlockDialogOpen}
        block={selectedBlock}
        blockedTimeTypes={blockedTimeTypes}
          onTypeCreated={(type) => {
            setBlockedTimeTypes((current) =>
              current.some((existing) => existing.id === type.id) ? current : [type, ...current],
            );
          }}
        onSuccess={loadData}
      />

      <BlockedTimeTypeDialog
        open={isTypeDialogOpen}
        onOpenChange={setIsTypeDialogOpen}
        type={selectedType}
        onSuccess={loadData}
      />
    </div>
  );
}