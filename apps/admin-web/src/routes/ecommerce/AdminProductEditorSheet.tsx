import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/adminClient";
import { adminQueryKeys } from "@/lib/adminQueryKeys";
import { adminToast } from "@/lib/adminToast";
import { AdminModal } from "@/components/admin/AdminModal";

type VariantOptType = { name: string; values: string[] };

type VariantFormRow = {
  option_values: Record<string, string>;
  sku: string;
  barcode: string;
  measure: string;
  amount: number;
  quantity: number;
  low_stock_level: number;
  reorder_quantity: number;
  supply_price: number;
  retail_price: number;
  markup: number;
  image_url: string;
  sort_order: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object";
}

function parseVariantOpts(raw: unknown): VariantOptType[] {
  if (!Array.isArray(raw)) return [];
  const out: VariantOptType[] = [];
  for (const x of raw) {
    if (!isRecord(x)) continue;
    const name = typeof x.name === "string" ? x.name : "";
    const values = Array.isArray(x.values) ? x.values.filter((v): v is string => typeof v === "string") : [];
    if (name) out.push({ name, values });
  }
  return out;
}

function normalizeVariantRow(v: unknown, idx: number): VariantFormRow {
  if (!isRecord(v)) {
    return {
      option_values: {},
      sku: "",
      barcode: "",
      measure: "",
      amount: 0,
      quantity: 0,
      low_stock_level: 5,
      reorder_quantity: 0,
      supply_price: 0,
      retail_price: 0,
      markup: 0,
      image_url: "",
      sort_order: idx,
    };
  }
  const ov = v.option_values;
  return {
    option_values: isRecord(ov) ? (ov as Record<string, string>) : {},
    sku: typeof v.sku === "string" ? v.sku : "",
    barcode: typeof v.barcode === "string" ? v.barcode : "",
    measure: typeof v.measure === "string" ? v.measure : "",
    amount: Number(v.amount) || 0,
    quantity: Number(v.quantity) || 0,
    low_stock_level: Number(v.low_stock_level) || 5,
    reorder_quantity: Number(v.reorder_quantity) || 0,
    supply_price: Number(v.supply_price) || 0,
    retail_price: Number(v.retail_price) || 0,
    markup: Number(v.markup) || 0,
    image_url: typeof v.image_url === "string" ? v.image_url : "",
    sort_order: Number(v.sort_order) || idx,
  };
}

async function uploadProductImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", "products");
  const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { url?: string };
    error?: string | { message?: string };
  };
  if (!res.ok) {
    const msg =
      typeof json.error === "string"
        ? json.error
        : json.error && typeof json.error === "object" && typeof json.error.message === "string"
          ? json.error.message
          : `Upload failed (${res.status})`;
    throw new Error(msg);
  }
  const url = json.data?.url;
  if (!url) throw new Error("No image URL returned");
  return url;
}

const inputClass =
  "mt-0.5 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 shadow-sm focus:border-primary focus:ring-primary";

export function AdminProductEditorSheet(props: {
  open: boolean;
  productId: string | null;
  onClose: () => void;
  /** Called after successful save (parent should invalidate catalog list). */
  onSaved: () => void;
}) {
  const { open, productId, onClose, onSaved } = props;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: productId ? adminQueryKeys.productCatalogDetail(productId) : ["admin", "product-catalog", "detail", "none"],
    queryFn: () => adminApi.getJson<Record<string, unknown>>(`/api/admin/ecommerce/catalog/${productId}`),
    enabled: open && !!productId,
  });

  const product = q.data;
  const currency = String(product?.preferred_currency ?? "ZAR");
  const fmt = useMemo(
    () => (n: number) =>
      new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n),
    [currency],
  );

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [measure, setMeasure] = useState("ml");
  const [amount, setAmount] = useState(0);
  const [supplyPrice, setSupplyPrice] = useState(0);
  const [retailPrice, setRetailPrice] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [lowStock, setLowStock] = useState(5);
  const [reorderQty, setReorderQty] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [markup, setMarkup] = useState(0);
  const [trackStock, setTrackStock] = useState(true);
  const [retailEnabled, setRetailEnabled] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [hasVariants, setHasVariants] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [variantOpts, setVariantOpts] = useState<VariantOptType[]>([]);
  const [variantRows, setVariantRows] = useState<VariantFormRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const hydrateFromProduct = useCallback((p: Record<string, unknown>) => {
    setName(String(p.name ?? ""));
    setSku(String(p.sku ?? ""));
    setBarcode(String(p.barcode ?? ""));
    setBrand(String(p.brand ?? ""));
    setCategory(String(p.category ?? ""));
    setDescription(String(p.description ?? ""));
    setShortDescription(String(p.short_description ?? ""));
    setSupplier(String(p.supplier ?? ""));
    setMeasure(String(p.measure ?? "ml"));
    setAmount(Number(p.amount) || 0);
    setSupplyPrice(Number(p.supply_price) || 0);
    setRetailPrice(Number(p.retail_price) || 0);
    setQuantity(Number(p.quantity) || 0);
    setLowStock(Number(p.low_stock_level) || 5);
    setReorderQty(Number(p.reorder_quantity) || 0);
    setTaxRate(Number(p.tax_rate) || 0);
    setMarkup(Number(p.markup) || 0);
    setTrackStock(p.track_stock_quantity !== false);
    setRetailEnabled(p.retail_sales_enabled !== false);
    setIsActive(p.is_active !== false);
    setHasVariants(Boolean(p.has_variants));
    const imgs = Array.isArray(p.image_urls) ? p.image_urls.filter((x): x is string => typeof x === "string") : [];
    setImageUrls(imgs);
    setVariantOpts(parseVariantOpts(p.variant_option_types));
    const vars = Array.isArray(p.variants) ? p.variants : [];
    setVariantRows(vars.map((v, i) => normalizeVariantRow(v, i)));
  }, []);

  useEffect(() => {
    if (product && open) hydrateFromProduct(product);
  }, [product, open, hydrateFromProduct]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Missing product");
      const variant_option_types = variantOpts.filter((o) => o.name.trim()).map((o) => ({
        name: o.name.trim(),
        values: o.values.map((v) => v.trim()).filter(Boolean),
      }));
      const variants = hasVariants
        ? variantRows.map((row, idx) => ({
            option_values: row.option_values,
            sku: row.sku,
            barcode: row.barcode || null,
            measure: row.measure || null,
            amount: row.amount,
            quantity: row.quantity,
            low_stock_level: row.low_stock_level,
            reorder_quantity: row.reorder_quantity,
            supply_price: row.supply_price,
            retail_price: row.retail_price,
            markup: row.markup || null,
            image_url: row.image_url || null,
            sort_order: idx,
          }))
        : [];

      const body: Record<string, unknown> = {
        name,
        sku,
        barcode,
        brand,
        category,
        description,
        short_description: shortDescription,
        supplier,
        measure,
        amount,
        supply_price: supplyPrice,
        retail_price: retailPrice,
        quantity,
        low_stock_level: lowStock,
        reorder_quantity: reorderQty,
        tax_rate: taxRate,
        markup,
        track_stock_quantity: trackStock,
        retail_sales_enabled: retailEnabled,
        is_active: isActive,
        has_variants: hasVariants,
        variant_option_types: hasVariants ? variant_option_types : [],
        image_urls: imageUrls,
        variants,
      };
      return adminApi.patchJson<Record<string, unknown>>(`/api/admin/ecommerce/catalog/${productId}`, body);
    },
    onSuccess: () => {
      adminToast.success("Product saved");
      void qc.invalidateQueries({ queryKey: adminQueryKeys.root });
      onSaved();
      onClose();
    },
    onError: (e: Error) => adminToast.error(e.message || "Save failed"),
  });

  const addImageByUrl = () => {
    const u = newImageUrl.trim();
    if (!u) return;
    setImageUrls((prev) => [...prev, u]);
    setNewImageUrl("");
  };

  const onPickMainImage = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setImageUrls((prev) => [url, ...prev.filter((x) => x !== url)]);
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onPickGalleryImage = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductImage(file);
      setImageUrls((prev) => [...prev, url]);
    } catch (e) {
      adminToast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const addVariantOptionRow = () => {
    setVariantOpts((prev) => [...prev, { name: "", values: [] }]);
  };

  const updateVariantOpt = (i: number, patch: Partial<VariantOptType>) => {
    setVariantOpts((prev) => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  };

  const setVariantOptValuesCsv = (i: number, csv: string) => {
    const values = csv.split(",").map((s) => s.trim()).filter(Boolean);
    updateVariantOpt(i, { values });
  };

  const addVariantRow = () => {
    setVariantRows((prev) => [
      ...prev,
      {
        option_values: {},
        sku: "",
        barcode: "",
        measure: "",
        amount: 0,
        quantity: 0,
        low_stock_level: 5,
        reorder_quantity: 0,
        supply_price: 0,
        retail_price: 0,
        markup: 0,
        image_url: "",
        sort_order: prev.length,
      },
    ]);
  };

  const updateVariantRow = (i: number, patch: Partial<VariantFormRow>) => {
    setVariantRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const variantOptionsJson = (row: VariantFormRow, i: number) => (
    <textarea
      className={inputClass + " font-mono text-xs"}
      rows={2}
      value={JSON.stringify(row.option_values || {}, null, 0)}
      onChange={(e) => {
        try {
          const parsed = JSON.parse(e.target.value) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const flat: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
              flat[k] = String(v ?? "");
            }
            updateVariantRow(i, { option_values: flat });
          }
        } catch {
          /* keep typing */
        }
      }}
      spellCheck={false}
    />
  );

  return (
    <AdminModal
      open={open}
      onClose={onClose}
      title={product ? `Edit: ${String(product.name ?? "")}` : "Edit product"}
      description="Changes apply to this SKU across the tenant catalog (same data model as the provider portal)."
      size="2xl"
      footer={
        <>
          <button
            type="button"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
            disabled={saveMut.isPending || q.isLoading || !productId}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      {q.isLoading ? (
        <p className="text-sm text-gray-500">Loading product…</p>
      ) : q.error ? (
        <p className="text-sm text-red-600">{(q.error as Error).message}</p>
      ) : product ? (
        <div className="space-y-8">
          <section className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-gray-700">
              Name *
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-700">
              SKU
              <input className={inputClass} value={sku} onChange={(e) => setSku(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-700">
              Barcode
              <input className={inputClass} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-700">
              Brand
              <input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-700">
              Category
              <input className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-700">
              Supplier
              <input className={inputClass} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-700 sm:col-span-2">
              Short description
              <input className={inputClass} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-700 sm:col-span-2">
              Description
              <textarea className={inputClass} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-900">Pricing & stock (parent SKU)</h4>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <label className="text-sm text-gray-700">
                Supply price ({currency})
                <input
                  type="number"
                  className={inputClass}
                  value={supplyPrice}
                  onChange={(e) => setSupplyPrice(parseFloat(e.target.value) || 0)}
                />
              </label>
              <label className="text-sm text-gray-700">
                Retail price ({currency})
                <input
                  type="number"
                  className={inputClass}
                  value={retailPrice}
                  onChange={(e) => setRetailPrice(parseFloat(e.target.value) || 0)}
                />
              </label>
              <label className="text-sm text-gray-700">
                Quantity
                <input
                  type="number"
                  className={inputClass}
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 0)}
                />
              </label>
              <label className="text-sm text-gray-700">
                Low stock alert at
                <input
                  type="number"
                  className={inputClass}
                  value={lowStock}
                  onChange={(e) => setLowStock(parseInt(e.target.value, 10) || 0)}
                />
              </label>
              <label className="text-sm text-gray-700">
                Reorder qty
                <input
                  type="number"
                  className={inputClass}
                  value={reorderQty}
                  onChange={(e) => setReorderQty(parseInt(e.target.value, 10) || 0)}
                />
              </label>
              <label className="text-sm text-gray-700">
                Tax rate %
                <input
                  type="number"
                  className={inputClass}
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                />
              </label>
              <label className="text-sm text-gray-700">
                Markup
                <input
                  type="number"
                  className={inputClass}
                  value={markup}
                  onChange={(e) => setMarkup(parseFloat(e.target.value) || 0)}
                />
              </label>
              <label className="text-sm text-gray-700">
                Measure
                <input className={inputClass} value={measure} onChange={(e) => setMeasure(e.target.value)} />
              </label>
              <label className="text-sm text-gray-700">
                Amount
                <input
                  type="number"
                  className={inputClass}
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-6 text-sm text-gray-800">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
                Track stock quantity
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={retailEnabled} onChange={(e) => setRetailEnabled(e.target.checked)} />
                Retail sales enabled
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} />
                Has variants
              </label>
            </div>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-900">Images</h4>
            <p className="mt-1 text-xs text-gray-500">First image is the primary listing image. Upload uses the same storage bucket as the provider portal.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {imageUrls.map((url) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-lg border bg-gray-50">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-0 top-0 rounded-bl bg-black/60 px-1 text-xs text-white"
                    onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-600">
                Upload main
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block text-xs"
                  disabled={uploading}
                  onChange={(e) => void onPickMainImage(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="text-xs text-gray-600">
                Add gallery image
                <input
                  type="file"
                  accept="image/*"
                  className="mt-1 block text-xs"
                  disabled={uploading}
                  onChange={(e) => void onPickGalleryImage(e.target.files?.[0] ?? null)}
                />
              </label>
              <input
                className={inputClass + " max-w-xs"}
                placeholder="Image URL"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
              />
              <button type="button" className="rounded border border-gray-300 px-3 py-1.5 text-xs" onClick={addImageByUrl}>
                Add URL
              </button>
            </div>
            {uploading ? <p className="mt-2 text-xs text-gray-500">Uploading…</p> : null}
          </section>

          {hasVariants ? (
            <section className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900">Variant options (e.g. Size, Color)</h4>
              {variantOpts.map((opt, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-gray-100 p-3 sm:grid-cols-2">
                  <label className="text-xs text-gray-600">
                    Option name
                    <input
                      className={inputClass}
                      value={opt.name}
                      onChange={(e) => updateVariantOpt(i, { name: e.target.value })}
                    />
                  </label>
                  <label className="text-xs text-gray-600">
                    Values (comma-separated)
                    <input
                      className={inputClass}
                      value={opt.values.join(", ")}
                      onChange={(e) => setVariantOptValuesCsv(i, e.target.value)}
                    />
                  </label>
                </div>
              ))}
              <button type="button" className="text-xs font-medium text-primary underline" onClick={addVariantOptionRow}>
                + Add option type
              </button>

              <h4 className="text-sm font-semibold text-gray-900">Variant SKUs</h4>
              <p className="text-xs text-gray-500">
                Set <code className="rounded bg-gray-100 px-1">option_values</code> JSON keys to match option names (e.g.{" "}
                <code className="rounded bg-gray-100 px-1">{`{"Size":"M"}`}</code>).
              </p>
              <div className="max-h-72 overflow-auto rounded-lg border">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-2 py-2">Options JSON</th>
                      <th className="px-2 py-2">SKU</th>
                      <th className="px-2 py-2">Qty</th>
                      <th className="px-2 py-2">Supply</th>
                      <th className="px-2 py-2">Retail</th>
                      <th className="px-2 py-2">Variant image URL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantRows.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-2 align-top">{variantOptionsJson(row, i)}</td>
                        <td className="px-2 py-2 align-top">
                          <input className={inputClass} value={row.sku} onChange={(e) => updateVariantRow(i, { sku: e.target.value })} />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="number"
                            className={inputClass}
                            value={row.quantity}
                            onChange={(e) => updateVariantRow(i, { quantity: parseInt(e.target.value, 10) || 0 })}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="number"
                            className={inputClass}
                            value={row.supply_price}
                            onChange={(e) => updateVariantRow(i, { supply_price: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="number"
                            className={inputClass}
                            value={row.retail_price}
                            onChange={(e) => updateVariantRow(i, { retail_price: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <input
                            className={inputClass}
                            value={row.image_url}
                            onChange={(e) => updateVariantRow(i, { image_url: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="text-xs font-medium text-primary underline" onClick={addVariantRow}>
                + Add variant row
              </button>
            </section>
          ) : null}

          <p className="text-xs text-gray-400">
            Preview: parent list price {fmt(retailPrice)} · stock {quantity}
            {hasVariants && variantRows.length > 0
              ? (() => {
                  const prices = variantRows.map((r) => Number(r.retail_price) || 0).filter((x) => x > 0);
                  const minV = prices.length ? Math.min(...prices) : 0;
                  return minV > 0 ? ` · lowest variant retail ${fmt(minV)}` : "";
                })()
              : ""}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No product selected.</p>
      )}
    </AdminModal>
  );
}
