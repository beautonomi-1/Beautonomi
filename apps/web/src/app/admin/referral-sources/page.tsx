"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

type ReferralSource = {
  id: string;
  provider_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Provider = {
  id: string;
  business_name: string;
};

export default function ReferralSourcesPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [providerSearch, setProviderSearch] = useState("");
  const [sources, setSources] = useState<ReferralSource[]>([]);
  const [loading, setLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingSource, setEditingSource] = useState<ReferralSource | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ReferralSource | null>(null);
  const [deleting, setDeleting] = useState(false);

  const searchProviders = useCallback(async (q: string) => {
    if (!q.trim()) { setProviders([]); return; }
    try {
      // The admin providers endpoint returns successResponse({ data: [...], meta: {...} })
      // so the full body shape is { data: { data: Provider[], meta: unknown }, error: null }.
      const res = await fetcher.get<{ data: { data: Provider[] } }>(
        `/api/admin/providers?search=${encodeURIComponent(q)}&limit=10`
      );
      setProviders(res.data?.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadSources = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    try {
      const res = await fetcher.get<{ data: ReferralSource[] }>(
        `/api/admin/referral-sources?provider_id=${pid}`
      );
      setSources(res.data ?? []);
    } catch {
      toast.error("Failed to load referral sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProvider) loadSources(selectedProvider);
  }, [selectedProvider, loadSources]);

  const openCreate = () => {
    setEditingSource(null);
    setFormName("");
    setFormDesc("");
    setFormActive(true);
    setShowForm(true);
  };

  const openEdit = (s: ReferralSource) => {
    setEditingSource(s);
    setFormName(s.name);
    setFormDesc(s.description ?? "");
    setFormActive(s.is_active);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (editingSource) {
        await fetcher.patch(`/api/admin/referral-sources/${editingSource.id}`, {
          name: formName.trim(),
          description: formDesc.trim() || null,
          is_active: formActive,
        });
        toast.success("Referral source updated");
      } else {
        await fetcher.post("/api/admin/referral-sources", {
          provider_id: selectedProvider,
          name: formName.trim(),
          description: formDesc.trim() || undefined,
          is_active: formActive,
        });
        toast.success("Referral source created");
      }
      setShowForm(false);
      loadSources(selectedProvider);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetcher.delete(`/api/admin/referral-sources/${deleteTarget.id}`);
      toast.success("Referral source deleted");
      setDeleteTarget(null);
      loadSources(selectedProvider);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Referral Sources</h1>
          <p className="text-muted-foreground">Manage referral sources for providers (e.g. where customers heard about them).</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Select Provider</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search provider..."
                  className="pl-8"
                  value={providerSearch}
                  onChange={(e) => {
                    setProviderSearch(e.target.value);
                    searchProviders(e.target.value);
                  }}
                />
              </div>
            </div>
            {providers.length > 0 && !selectedProvider && (
              <div className="border rounded-md mt-2 max-h-48 overflow-y-auto">
                {providers.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    onClick={() => {
                      setSelectedProvider(p.id);
                      setProviderSearch(p.business_name);
                      setProviders([]);
                    }}
                  >
                    {p.business_name}
                  </button>
                ))}
              </div>
            )}
            {selectedProvider && (
              <Button
                variant="link"
                size="sm"
                className="mt-1 px-0"
                onClick={() => {
                  setSelectedProvider("");
                  setProviderSearch("");
                  setSources([]);
                }}
              >
                Clear selection
              </Button>
            )}
          </CardContent>
        </Card>

        {selectedProvider && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Referral Sources ({sources.length})</CardTitle>
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" /> Add Source
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground text-center py-4">Loading...</p>
              ) : sources.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No referral sources for this provider.</p>
              ) : (
                <div className="space-y-2">
                  {sources.map((s) => (
                    <div key={s.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={s.is_active ? "default" : "secondary"}>
                          {s.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(s)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={showForm} onOpenChange={(v) => !v && setShowForm(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSource ? "Edit" : "Create"} Referral Source</DialogTitle>
              <DialogDescription>
                {editingSource
                  ? "Update the referral source details."
                  : "Add a new referral source for this provider."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Google, Instagram, Word of mouth" />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief description..." />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={formActive} onCheckedChange={setFormActive} />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : editingSource ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Referral Source</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
