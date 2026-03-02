# Offerings vs Products vs Services

## The `offerings` Table

The `offerings` table is the unified catalog for all sellable items. It uses a `type` column to distinguish:

| Type | Description | Examples |
|------|------------|---------|
| `service` | Time-based appointments | Haircut, Massage, Facial |
| `addon` | Optional extras added to services | Deep conditioning, Hot stones |
| `variant` | Size/duration variations | 30min vs 60min massage |

## The `products` Table

Separate from `offerings`, the `products` table handles **retail inventory**:
- Physical products sold at the salon (shampoo, styling tools)
- Has stock tracking (`stock_quantity`, `low_stock_threshold`)
- Has SKU and barcode fields

### Product variants

Products can have **variants** (e.g. size, volume: 250ml vs 500ml):
- `products.has_variants` — when true, sellable rows live in `product_variants`
- `products.variant_option_types` — JSON e.g. `[{ "name": "Size", "values": ["250ml", "500ml"] }]`
- `product_variants` — one row per variant: `product_id`, `option_values`, per-variant SKU, price, quantity
- Cart, orders, and booking line items store `product_variant_id` when the item is a variant; otherwise they use `product_id` only (legacy single product)

## Why Not Just "Services"?

The `offerings` name was chosen because:
1. It encompasses services, addons, and variants in one table
2. A "service" is just one `type` within offerings
3. This avoids confusion between the table name and the type value

## Relationships

```
offerings (type=service)
  ├── offerings (type=addon) — linked via offering_addons
  ├── offerings (type=variant) — linked via parent_offering_id
  └── booking_services — links to bookings

products
  ├── product_variants — optional; one per variant when has_variants = true
  ├── booking_products — links to bookings (optionally product_variant_id)
  └── product_order_items / cart_items — e-commerce (optionally product_variant_id)
```
