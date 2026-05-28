import type { ProductFormState } from "./types";

export function buildProductPayload(form: ProductFormState) {
  const name = form.name.trim();
  const image_urls = [...new Set(form.image_urls.filter(Boolean))];
  const withVariants = Boolean(form.hasVariants && form.variantRows.length > 0);

  const payload: Record<string, unknown> = {
    name,
    barcode: form.barcode || undefined,
    brand: form.brand || undefined,
    measure: withVariants ? undefined : form.measure || undefined,
    amount: withVariants ? undefined : form.amount ? parseFloat(form.amount) : undefined,
    short_description: form.short_description || undefined,
    description: form.description || undefined,
    category: form.category || undefined,
    supplier: form.supplier || undefined,
    sku: withVariants ? undefined : form.sku || undefined,
    quantity: withVariants ? 0 : parseInt(form.quantity, 10) || 0,
    low_stock_level: withVariants ? 5 : parseInt(form.low_stock_level, 10) || 5,
    reorder_quantity: parseInt(form.reorder_quantity, 10) || 0,
    supply_price: withVariants ? 0 : parseFloat(form.supply_price) || 0,
    retail_price: withVariants ? 0 : parseFloat(form.retail_price),
    retail_sales_enabled: form.retail_sales_enabled,
    markup: withVariants ? undefined : form.markup ? parseFloat(form.markup) : undefined,
    tax_rate: parseFloat(form.tax_rate) || 0,
    team_member_commission_enabled: form.team_member_commission_enabled,
    track_stock_quantity: form.track_stock_quantity,
    receive_low_stock_notifications: form.receive_low_stock_notifications,
    image_urls,
    is_active: form.is_active,
    has_variants: withVariants,
  };

  if (withVariants) {
    const validTypes = form.variantOptionTypes
      .map((t) => ({
        name: t.name.trim(),
        values: [...new Set(t.values.map((x) => x.trim()).filter(Boolean))],
      }))
      .filter((t) => t.name.length > 0 && t.values.length > 0);
    payload.variant_option_types = validTypes;
    payload.variants = form.variantRows.map((r, idx) => ({
      option_values: r.option_values,
      sort_order: r.sort_order ?? idx,
      sku: r.sku.trim() || undefined,
      barcode: r.barcode.trim() || undefined,
      measure: r.measure.trim() || undefined,
      amount: r.amount > 0 ? r.amount : undefined,
      quantity: r.quantity ?? 0,
      low_stock_level: r.low_stock_level ?? 5,
      reorder_quantity: r.reorder_quantity ?? 0,
      supply_price: r.supply_price ?? 0,
      retail_price: Number(r.retail_price),
      markup: r.markup > 0 ? r.markup : undefined,
      image_url: r.image_url.trim() || undefined,
    }));
  }

  return { payload, withVariants };
}
