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
  └── booking_products — links to bookings
```
