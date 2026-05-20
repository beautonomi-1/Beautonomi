import { describe, expect, it, vi } from "vitest";
import { syncAppointmentProductOrder } from "../sync-appointment-product-order";

type QueryState = {
  table: string;
  filters: Record<string, unknown>;
};

describe("syncAppointmentProductOrder", () => {
  it("falls back tenant and primary location when booking has null values", async () => {
    let insertedOrder: Record<string, unknown> | null = null;

    const supabase = {
      rpc: vi.fn(async () => ({ data: 101, error: null })),
      from: vi.fn((table: string) => {
        const state: QueryState = { table, filters: {} };
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((key: string, value: unknown) => {
            state.filters[key] = value;
            return query;
          }),
          neq: vi.fn(() => query),
          not: vi.fn(() => query),
          limit: vi.fn(() => query),
          order: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (state.table === "bookings") {
              return {
                data: {
                  id: "booking-1",
                  booking_number: "B-1",
                  provider_id: "provider-1",
                  customer_id: null,
                  tenant_id: null,
                  location_id: null,
                  status: "confirmed",
                  payment_status: "pending",
                  currency: "ZAR",
                  scheduled_at: "2026-01-01T10:00:00.000Z",
                  customer_name: null,
                  customer_phone: null,
                  recurring_series_id: null,
                  customers: null,
                  booking_products: [
                    {
                      id: "bp-1",
                      product_id: "product-1",
                      product_variant_id: null,
                      quantity: 1,
                      unit_price: 120,
                      total_price: 120,
                      products: { name: "Shampoo" },
                    },
                  ],
                },
                error: null,
              };
            }
            if (state.table === "providers") {
              return { data: { tenant_id: "tenant-1" }, error: null };
            }
            if (state.table === "provider_locations") {
              return { data: { id: "location-1" }, error: null };
            }
            if (state.table === "product_orders") {
              return { data: null, error: null };
            }
            return { data: null, error: null };
          }),
          single: vi.fn(async () => ({ data: { id: "order-1" }, error: null })),
          insert: vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            if (state.table === "product_orders") {
              insertedOrder = payload as Record<string, unknown>;
              return {
                select: () => ({
                  single: async () => ({ data: { id: "order-1" }, error: null }),
                }),
              };
            }
            return Promise.resolve({ data: null, error: null });
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
          then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return query;
      }),
    };

    const result = await syncAppointmentProductOrder(supabase as never, "booking-1");

    expect(result).toEqual({ orderId: "order-1" });
    expect(insertedOrder).not.toBeNull();
    expect(insertedOrder?.tenant_id).toBe("tenant-1");
    expect(insertedOrder?.collection_location_id).toBe("location-1");
  });

  it("retries booking select with a leaner shape when a 42703 surfaces", async () => {
    let insertedOrder: Record<string, unknown> | null = null;
    let bookingSelectAttempts = 0;

    const supabase = {
      rpc: vi.fn(async () => ({ data: 202, error: null })),
      from: vi.fn((table: string) => {
        const state: QueryState = { table, filters: {} };
        const query: any = {
          select: vi.fn(() => query),
          in: vi.fn(() => query),
          eq: vi.fn((key: string, value: unknown) => {
            state.filters[key] = value;
            return query;
          }),
          neq: vi.fn(() => query),
          not: vi.fn(() => query),
          limit: vi.fn(() => query),
          order: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (state.table === "bookings") {
              bookingSelectAttempts += 1;
              if (bookingSelectAttempts === 1) {
                return {
                  data: null,
                  error: {
                    code: "42703",
                    message:
                      'column bookings.recurring_series_id does not exist',
                  },
                };
              }
              return {
                data: {
                  id: "booking-2",
                  booking_number: "B-2",
                  provider_id: "provider-2",
                  customer_id: null,
                  tenant_id: "tenant-2",
                  location_id: "location-2",
                  status: "confirmed",
                  payment_status: "pending",
                  currency: "ZAR",
                  scheduled_at: "2026-02-01T10:00:00.000Z",
                  customer_name: null,
                  customer_phone: null,
                  customers: null,
                  booking_products: [
                    {
                      id: "bp-2",
                      product_id: "product-2",
                      product_variant_id: null,
                      quantity: 2,
                      unit_price: 50,
                      total_price: 100,
                    },
                  ],
                },
                error: null,
              };
            }
            if (state.table === "product_orders") {
              return { data: null, error: null };
            }
            return { data: null, error: null };
          }),
          single: vi.fn(async () => ({ data: { id: "order-2" }, error: null })),
          insert: vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            if (state.table === "product_orders") {
              insertedOrder = payload as Record<string, unknown>;
              return {
                select: () => ({
                  single: async () => ({ data: { id: "order-2" }, error: null }),
                }),
              };
            }
            return Promise.resolve({ data: null, error: null });
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
          then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return query;
      }),
    };

    const result = await syncAppointmentProductOrder(supabase as never, "booking-2");

    expect(result).toEqual({ orderId: "order-2" });
    expect(bookingSelectAttempts).toBeGreaterThanOrEqual(2);
    expect(insertedOrder).not.toBeNull();
    expect(insertedOrder?.subtotal).toBe(100);
  });

  // §Provider-audit 2026-05: regression guard for the 42703 root cause.
  // `bookings.customer_name` / `bookings.customer_phone` are NOT real columns
  // (those fields live on `product_orders` per migration 240). Before the
  // fix, every select variant in loadBookingForSync — including the scalar
  // fallback — included those columns, so a mixed service+product booking
  // returned `Failed to sync product order for this appointment (db:42703)`.
  it("does not select customer_name / customer_phone from bookings", async () => {
    const bookingSelects: string[] = [];

    const supabase = {
      rpc: vi.fn(async () => ({ data: 303, error: null })),
      from: vi.fn((table: string) => {
        const state: QueryState = { table, filters: {} };
        const query: any = {
          select: vi.fn((columns?: string) => {
            if (state.table === "bookings" && typeof columns === "string") {
              bookingSelects.push(columns);
            }
            return query;
          }),
          in: vi.fn(() => query),
          eq: vi.fn((key: string, value: unknown) => {
            state.filters[key] = value;
            return query;
          }),
          neq: vi.fn(() => query),
          not: vi.fn(() => query),
          limit: vi.fn(() => query),
          order: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (state.table === "bookings") {
              return {
                data: {
                  id: "booking-3",
                  booking_number: "B-3",
                  provider_id: "provider-3",
                  customer_id: null,
                  tenant_id: "tenant-3",
                  location_id: "location-3",
                  status: "confirmed",
                  payment_status: "pending",
                  currency: "ZAR",
                  scheduled_at: "2026-03-01T10:00:00.000Z",
                  customers: { id: "u1", full_name: "Walk-in", phone: null },
                  booking_products: [
                    {
                      id: "bp-3",
                      product_id: "product-3",
                      product_variant_id: null,
                      quantity: 1,
                      unit_price: 75,
                      total_price: 75,
                    },
                  ],
                },
                error: null,
              };
            }
            if (state.table === "product_orders") {
              return { data: null, error: null };
            }
            return { data: null, error: null };
          }),
          single: vi.fn(async () => ({ data: { id: "order-3" }, error: null })),
          insert: vi.fn((_payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            if (state.table === "product_orders") {
              return {
                select: () => ({
                  single: async () => ({ data: { id: "order-3" }, error: null }),
                }),
              };
            }
            return Promise.resolve({ data: null, error: null });
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
          then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return query;
      }),
    };

    await syncAppointmentProductOrder(supabase as never, "booking-3");

    expect(bookingSelects.length).toBeGreaterThan(0);
    for (const sel of bookingSelects) {
      expect(sel).not.toMatch(/\bcustomer_name\b/);
      expect(sel).not.toMatch(/\bcustomer_phone\b/);
    }
  });

  // §Provider-audit 2026-05: when an older database is missing
  // `product_orders.customer_name` / `product_orders.customer_phone`
  // (migration 240), the first insert returns 42703. The retry path must
  // drop those columns so the booking still gets a product order.
  it("retries product_orders insert without customer_name when 42703 surfaces", async () => {
    const productOrderInsertPayloads: Array<Record<string, unknown>> = [];
    let productOrderInsertAttempts = 0;

    const supabase = {
      rpc: vi.fn(async () => ({ data: 404, error: null })),
      from: vi.fn((table: string) => {
        const state: QueryState = { table, filters: {} };
        const query: any = {
          select: vi.fn(() => query),
          in: vi.fn(() => query),
          eq: vi.fn((key: string, value: unknown) => {
            state.filters[key] = value;
            return query;
          }),
          neq: vi.fn(() => query),
          not: vi.fn(() => query),
          limit: vi.fn(() => query),
          order: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (state.table === "bookings") {
              return {
                data: {
                  id: "booking-4",
                  booking_number: "B-4",
                  provider_id: "provider-4",
                  customer_id: null,
                  tenant_id: "tenant-4",
                  location_id: "location-4",
                  status: "confirmed",
                  payment_status: "pending",
                  currency: "ZAR",
                  scheduled_at: "2026-04-01T10:00:00.000Z",
                  customers: { id: "u2", full_name: "Sample", phone: "+27110000000" },
                  booking_products: [
                    {
                      id: "bp-4",
                      product_id: "product-4",
                      product_variant_id: null,
                      quantity: 1,
                      unit_price: 60,
                      total_price: 60,
                    },
                  ],
                },
                error: null,
              };
            }
            if (state.table === "product_orders") {
              return { data: null, error: null };
            }
            return { data: null, error: null };
          }),
          single: vi.fn(async () => ({ data: { id: "order-4" }, error: null })),
          insert: vi.fn((payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
            if (state.table === "product_orders") {
              productOrderInsertAttempts += 1;
              productOrderInsertPayloads.push(payload as Record<string, unknown>);
              if (productOrderInsertAttempts === 1) {
                return {
                  select: () => ({
                    single: async () => ({
                      data: null,
                      error: {
                        code: "42703",
                        message: 'column product_orders.customer_name does not exist',
                      },
                    }),
                  }),
                };
              }
              return {
                select: () => ({
                  single: async () => ({ data: { id: "order-4" }, error: null }),
                }),
              };
            }
            return Promise.resolve({ data: null, error: null });
          }),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
          delete: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
          then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return query;
      }),
    };

    const result = await syncAppointmentProductOrder(supabase as never, "booking-4");

    expect(result).toEqual({ orderId: "order-4" });
    expect(productOrderInsertAttempts).toBe(2);
    expect(productOrderInsertPayloads[0]).toMatchObject({ customer_name: "Sample" });
    expect(productOrderInsertPayloads[1]).not.toHaveProperty("customer_name");
    expect(productOrderInsertPayloads[1]).not.toHaveProperty("customer_phone");
  });
});
