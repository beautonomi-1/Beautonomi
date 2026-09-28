import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BRAND_ASSETS_BUCKET } from "./assets";

export async function assembleBrandEvidencePack(
  supabase: SupabaseClient,
  packId: string,
): Promise<{ storage_path: string; manifest_hash: string }> {
  const { data: pack } = await supabase
    .from("brand_evidence_packs")
    .select("*")
    .eq("id", packId)
    .maybeSingle();
  if (!pack) throw new Error("Pack not found");

  await supabase.from("brand_evidence_packs").update({ status: "building" }).eq("id", packId);

  const files: Record<string, Uint8Array> = {};
  const manifest: Array<{ path: string; sha256: string; bytes: number }> = [];

  const pushText = (path: string, text: string) => {
    const buf = new TextEncoder().encode(text);
    manifest.push({ path, sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length });
    files[path] = buf;
  };

  pushText("README.txt", `Brand evidence pack: ${pack.label}\nGenerated: ${new Date().toISOString()}\n`);

  if (pack.campaign_id) {
    const { data: campaign } = await supabase
      .from("brand_campaigns")
      .select("name, stage, closeout_worked, closeout_did_not, closeout_run_again")
      .eq("id", pack.campaign_id)
      .maybeSingle();
    pushText("campaign/summary.json", JSON.stringify(campaign ?? {}, null, 2));

    const { data: approvals } = await supabase
      .from("brand_approvals")
      .select("subject_type, status, version_hash, decided_at, comment")
      .eq("subject_id", pack.campaign_id);
    pushText("campaign/approvals.json", JSON.stringify(approvals ?? [], null, 2));

    const { data: assets } = await supabase
      .from("brand_assets")
      .select("id, name, status")
      .eq("campaign_id", pack.campaign_id);
    pushText("campaign/assets.json", JSON.stringify(assets ?? [], null, 2));

    for (const asset of assets ?? []) {
      const { data: versions } = await supabase
        .from("brand_asset_versions")
        .select("storage_path, sha256, mime_type")
        .eq("asset_id", asset.id)
        .order("version_number", { ascending: false })
        .limit(1);
      const v = versions?.[0];
      if (!v?.storage_path) continue;
      const admin = getSupabaseAdmin();
      const { data: blob, error } = await admin.storage.from(BRAND_ASSETS_BUCKET).download(v.storage_path);
      if (error || !blob) continue;
      const ab = new Uint8Array(await blob.arrayBuffer());
      const path = `assets/${asset.id}-${v.sha256.slice(0, 8)}`;
      manifest.push({ path, sha256: v.sha256, bytes: ab.length });
      files[path] = ab;
    }
  }

  pushText("manifest.json", JSON.stringify({ files: manifest }, null, 2));
  const zipBytes = zipSync(files, { level: 6 });
  const manifest_hash = createHash("sha256").update(zipBytes).digest("hex");
  const storage_path = `${pack.tenant_id}/packs/${packId}/${manifest_hash}.zip`;

  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage.from(BRAND_ASSETS_BUCKET).upload(storage_path, zipBytes, {
    contentType: "application/zip",
    upsert: true,
  });
  if (upErr) throw upErr;

  await supabase
    .from("brand_evidence_packs")
    .update({
      status: "ready",
      storage_path,
      manifest_hash,
      ready_at: new Date().toISOString(),
    })
    .eq("id", packId);

  return { storage_path, manifest_hash };
}
