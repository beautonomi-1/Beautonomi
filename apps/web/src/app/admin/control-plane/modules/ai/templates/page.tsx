"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft, Plus, Pencil } from "lucide-react";

interface TemplateRow {
  id: string;
  key: string;
  version: number;
  enabled: boolean;
  platform_scopes: string[] | null;
  role_scopes: string[] | null;
  template: string;
  system_instructions: string;
  output_schema: Record<string, unknown>;
  updated_at: string;
}

const defaultForm = {
  key: "",
  version: 1,
  enabled: true,
  platform_scopes: "",
  role_scopes: "",
  template: "",
  system_instructions: "",
  output_schema: "{}",
};

type EditForm = {
  enabled: boolean;
  platform_scopes: string;
  role_scopes: string;
  template: string;
  system_instructions: string;
  output_schema: string;
};

export default function AiTemplatesPage() {
  const [items, setItems] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    enabled: true,
    platform_scopes: "",
    role_scopes: "",
    template: "",
    system_instructions: "",
    output_schema: "{}",
  });

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: TemplateRow[] }>("/api/admin/control-plane/modules/ai/templates");
      setItems(res.data ?? []);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleCreate = async () => {
    if (!form.key.trim()) {
      toast.error("Key is required");
      return;
    }
    setSubmitting(true);
    try {
      const platform_scopes = form.platform_scopes
        ? form.platform_scopes.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const role_scopes = form.role_scopes
        ? form.role_scopes.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      let output_schema: Record<string, unknown> = {};
      try {
        if (form.output_schema.trim()) output_schema = JSON.parse(form.output_schema) as Record<string, unknown>;
      } catch {
        toast.error("output_schema must be valid JSON");
        setSubmitting(false);
        return;
      }
      await fetcher.post("/api/admin/control-plane/modules/ai/templates", {
        key: form.key.trim(),
        version: form.version,
        enabled: form.enabled,
        platform_scopes: platform_scopes?.length ? platform_scopes : null,
        role_scopes: role_scopes?.length ? role_scopes : null,
        template: form.template,
        system_instructions: form.system_instructions,
        output_schema,
      });
      toast.success("Template created");
      setForm(defaultForm);
      setCreateOpen(false);
      await fetchTemplates();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Failed to create template";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (t: TemplateRow) => {
    setEditingTemplate(t);
    setEditForm({
      enabled: t.enabled,
      platform_scopes: (t.platform_scopes ?? []).join(", "),
      role_scopes: (t.role_scopes ?? []).join(", "),
      template: t.template ?? "",
      system_instructions: t.system_instructions ?? "",
      output_schema: JSON.stringify(t.output_schema ?? {}, null, 2),
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editingTemplate) return;
    setSubmitting(true);
    try {
      const platform_scopes = editForm.platform_scopes
        ? editForm.platform_scopes.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const role_scopes = editForm.role_scopes
        ? editForm.role_scopes.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      let output_schema: Record<string, unknown> = {};
      try {
        if (editForm.output_schema.trim()) {
          output_schema = JSON.parse(editForm.output_schema) as Record<string, unknown>;
        }
      } catch {
        toast.error("output_schema must be valid JSON");
        setSubmitting(false);
        return;
      }
      await fetcher.patch(`/api/admin/control-plane/modules/ai/templates/${editingTemplate.id}`, {
        enabled: editForm.enabled,
        platform_scopes: platform_scopes?.length ? platform_scopes : null,
        role_scopes: role_scopes?.length ? role_scopes : null,
        template: editForm.template,
        system_instructions: editForm.system_instructions,
        output_schema,
      });
      toast.success("Template updated");
      setEditOpen(false);
      setEditingTemplate(null);
      await fetchTemplates();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "Failed to update template";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/control-plane/modules/ai">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">AI Prompt Templates</h1>
            <p className="text-muted-foreground">Manage prompt templates by key and version.</p>
          </div>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create AI Prompt Template</DialogTitle>
              <DialogDescription>
                Add a new template. Key examples: ai.provider.profile_completion, ai.provider.content_studio
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="create-key">Key *</Label>
                  <Input
                    id="create-key"
                    value={form.key}
                    onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
                    placeholder="ai.provider.profile_completion"
                  />
                </div>
                <div>
                  <Label htmlFor="create-version">Version</Label>
                  <Input
                    id="create-version"
                    type="number"
                    min={1}
                    value={form.version}
                    onChange={(e) => setForm((p) => ({ ...p, version: parseInt(e.target.value, 10) || 1 }))}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="create-enabled"
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm((p) => ({ ...p, enabled: checked }))}
                />
                <Label htmlFor="create-enabled">Enabled</Label>
              </div>
              <div>
                <Label htmlFor="create-platforms">Platform scopes (comma-separated)</Label>
                <Input
                  id="create-platforms"
                  value={form.platform_scopes}
                  onChange={(e) => setForm((p) => ({ ...p, platform_scopes: e.target.value }))}
                  placeholder="web, provider"
                />
              </div>
              <div>
                <Label htmlFor="create-roles">Role scopes (comma-separated)</Label>
                <Input
                  id="create-roles"
                  value={form.role_scopes}
                  onChange={(e) => setForm((p) => ({ ...p, role_scopes: e.target.value }))}
                  placeholder="provider_owner, provider_staff"
                />
              </div>
              <div>
                <Label htmlFor="create-template">Template (prompt text)</Label>
                <Textarea
                  id="create-template"
                  value={form.template}
                  onChange={(e) => setForm((p) => ({ ...p, template: e.target.value }))}
                  placeholder="Optional placeholder text, e.g. {{provider_name}}"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="create-system">System instructions</Label>
                <Textarea
                  id="create-system"
                  value={form.system_instructions}
                  onChange={(e) => setForm((p) => ({ ...p, system_instructions: e.target.value }))}
                  placeholder="Instructions for the model"
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="create-schema">Output schema (JSON)</Label>
                <Textarea
                  id="create-schema"
                  value={form.output_schema}
                  onChange={(e) => setForm((p) => ({ ...p, output_schema: e.target.value }))}
                  placeholder="{}"
                  rows={2}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditingTemplate(null); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit template</DialogTitle>
            <DialogDescription>
              {editingTemplate ? `${editingTemplate.key} v${editingTemplate.version}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-enabled"
                checked={editForm.enabled}
                onCheckedChange={(checked) => setEditForm((p) => ({ ...p, enabled: checked }))}
              />
              <Label htmlFor="edit-enabled">Enabled</Label>
            </div>
            <div>
              <Label htmlFor="edit-platforms">Platform scopes (comma-separated)</Label>
              <Input
                id="edit-platforms"
                value={editForm.platform_scopes}
                onChange={(e) => setEditForm((p) => ({ ...p, platform_scopes: e.target.value }))}
                placeholder="web, provider"
              />
            </div>
            <div>
              <Label htmlFor="edit-roles">Role scopes (comma-separated)</Label>
              <Input
                id="edit-roles"
                value={editForm.role_scopes}
                onChange={(e) => setEditForm((p) => ({ ...p, role_scopes: e.target.value }))}
                placeholder="provider_owner, provider_staff"
              />
            </div>
            <div>
              <Label htmlFor="edit-template">Template (prompt text)</Label>
              <Textarea
                id="edit-template"
                value={editForm.template}
                onChange={(e) => setEditForm((p) => ({ ...p, template: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-system">System instructions</Label>
              <Textarea
                id="edit-system"
                value={editForm.system_instructions}
                onChange={(e) => setEditForm((p) => ({ ...p, system_instructions: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="edit-schema">Output schema (JSON)</Label>
              <Textarea
                id="edit-schema"
                value={editForm.output_schema}
                onChange={(e) => setEditForm((p) => ({ ...p, output_schema: e.target.value }))}
                rows={3}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>Keys: ai.provider.profile_completion, ai.provider.content_studio, etc.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">No templates yet. Create one with the button above.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 border rounded p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={t.enabled ? "default" : "secondary"}>{t.key}</Badge>
                    <span className="text-sm text-muted-foreground">v{t.version}</span>
                    {t.platform_scopes?.length ? (
                      <span className="text-xs">platforms: {t.platform_scopes.join(", ")}</span>
                    ) : null}
                    {t.role_scopes?.length ? (
                      <span className="text-xs">roles: {t.role_scopes.join(", ")}</span>
                    ) : null}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
