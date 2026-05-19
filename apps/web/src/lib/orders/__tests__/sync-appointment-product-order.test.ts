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
});
