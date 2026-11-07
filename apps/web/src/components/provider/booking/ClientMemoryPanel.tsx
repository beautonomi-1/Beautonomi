"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "@beautonomi/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ProviderClientMemory } from "@/lib/provider/provider-client-memory";

type Props = {
  customerId: string;
  memory: ProviderClientMemory | null;
  onUpdated?: () => void;
};

export function ClientMemoryPanel({ customerId, memory, onUpdated }: Props) {
  const { t } = useTranslation();
  const base = "web.provider.bookings.detail.clientMemory";
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  if (!memory) return null;

  const currentNote = savedNote !== undefined ? savedNote : memory.service_note;
  const hasLastVisit = Boolean(memory.last_offering_name || memory.last_staff_name);

  const startEdit = () => {
    setNote(currentNote ?? "");
    setEditing(true);
  };

  const saveNote = async () => {
    setSaving(true);
    try {
      const next = note.trim() || null;
      const res = await fetch(`/api/provider/clients/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_note: next }),
      });
      if (!res.ok) throw new Error("save_failed");
      setSavedNote(next);
      toast.success(t(`${base}.noteSaved`));
      setEditing(false);
      onUpdated?.();
    } catch {
      toast.error(t(`${base}.noteSaveFailed`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      {hasLastVisit && (
        <>
          <p className="text-sm font-semibold text-gray-700">{t(`${base}.title`)}</p>
          <p className="text-sm text-gray-600">
            {memory.last_offering_name}
            {memory.last_staff_name ? ` · ${memory.last_staff_name}` : ""}
          </p>
        </>
      )}
      {memory.explore_post_id ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/provider/explore/${memory.explore_post_id}`}>{t(`${base}.viewLook`)}</Link>
        </Button>
      ) : null}
      <div>
        <p className="text-xs text-gray-500 mb-1">{t(`${base}.serviceNote`)}</p>
        {editing ? (
          <div className="space-y-2">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveNote} disabled={saving}>
                {t(`${base}.save`)}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t(`${base}.cancel`)}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{currentNote || t(`${base}.noNote`)}</p>
            <Button size="sm" variant="ghost" onClick={startEdit}>
              {t(`${base}.edit`)}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
