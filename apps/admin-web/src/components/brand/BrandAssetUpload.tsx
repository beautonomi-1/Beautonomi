import { useRef, useState } from "react";
import { adminApi } from "@/lib/adminClient";
import { adminToast } from "@/lib/adminToast";
import { sha256File } from "@/routes/grc/grcShared";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/quicktime";

type Props = {
  campaignId: string;
  onDone: () => void;
};

export function BrandAssetUpload({ campaignId, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const mime = file.type || "application/octet-stream";
      const sha256 = await sha256File(file);
      const slot = await adminApi.postJson<{
        asset_id: string;
        path: string;
        exists: boolean;
        signed_url: string | null;
      }>("/api/admin/brand/assets/upload-url", {
        campaign_id: campaignId,
        name: name.trim() || file.name,
        sha256,
        size_bytes: file.size,
        mime_type: mime,
      });

      if (!slot.exists && slot.signed_url) {
        const res = await fetch(slot.signed_url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": mime },
        });
        if (!res.ok) throw new Error("Storage upload failed");
      }

      await adminApi.postJson("/api/admin/brand/assets/confirm", {
        asset_id: slot.asset_id,
        storage_path: slot.path,
        sha256,
        mime_type: mime,
        size_bytes: file.size,
      });

      adminToast.success("Asset uploaded");
      setName("");
      onDone();
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="mb-1 block text-zinc-600">Asset name</span>
        <input
          className="rounded border px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hero KV"
        />
      </label>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="text-sm"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      {busy ? <span className="text-sm text-zinc-500">Uploading…</span> : null}
    </div>
  );
}
