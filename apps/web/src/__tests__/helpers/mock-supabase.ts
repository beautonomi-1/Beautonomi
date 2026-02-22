/**
 * Shared test utilities for the Beautonomi web app.
 *
 * Provides:
 *  - A mock Supabase client factory
 *  - Pre-built mock user objects for every role
 *  - A helper to create mock NextRequest objects
 */

import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MockUserRole =
  | "customer"
  | "provider_owner"
  | "provider_staff"
  | "superadmin";

export interface MockUser {
  id: string;
  email: string;
  role: MockUserRole;
  full_name: string;
  user_metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mock users – one per role
// ---------------------------------------------------------------------------

export const MOCK_USERS: Record<MockUserRole, MockUser> = {
  customer: {
    id: "cust-0000-0000-0000-000000000001",
    email: "customer@example.com",
    role: "customer",
    full_name: "Test Customer",
    user_metadata: { role: "customer" },
  },
  provider_owner: {
    id: "pown-0000-0000-0000-000000000002",
    email: "owner@salon.com",
    role: "provider_owner",
    full_name: "Salon Owner",
    user_metadata: { role: "provider_owner" },
  },
  provider_staff: {
    id: "pstf-0000-0000-0000-000000000003",
    email: "staff@salon.com",
    role: "provider_staff",
    full_name: "Staff Member",
    user_metadata: { role: "provider_staff" },
  },
  superadmin: {
    id: "sadm-0000-0000-0000-000000000004",
    email: "admin@beautonomi.com",
    role: "superadmin",
    full_name: "Super Admin",
    user_metadata: { role: "superadmin" },
  },
};

// ---------------------------------------------------------------------------
// Mock Supabase client factory
// ---------------------------------------------------------------------------

export interface MockSupabaseChain {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  neq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
}

/**
 * Build a chainable mock query builder so that calls like
 * `supabase.from("table").select("*").eq("id", "x").single()`
 * resolve without throwing.
 */
function createMockQueryBuilder(
  defaultReturn: { data: unknown; error: null } = { data: null, error: null }
): MockSupabaseChain {
  const chain: Partial<MockSupabaseChain> = {};

  const self = () => chain as MockSupabaseChain;

  chain.select = vi.fn().mockReturnValue(self());
  chain.insert = vi.fn().mockReturnValue(self());
  chain.update = vi.fn().mockReturnValue(self());
  chain.delete = vi.fn().mockReturnValue(self());
  chain.eq = vi.fn().mockReturnValue(self());
  chain.neq = vi.fn().mockReturnValue(self());
  chain.in = vi.fn().mockReturnValue(self());
  chain.single = vi.fn().mockResolvedValue(defaultReturn);
  chain.limit = vi.fn().mockReturnValue(self());
  chain.order = vi.fn().mockReturnValue(self());
  chain.range = vi.fn().mockReturnValue(self());
  chain.maybeSingle = vi.fn().mockResolvedValue(defaultReturn);
  chain.upsert = vi.fn().mockReturnValue(self());

  return chain as MockSupabaseChain;
}

export interface MockSupabaseClient {
  from: ReturnType<typeof vi.fn>;
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  rpc: ReturnType<typeof vi.fn>;
}

/**
 * Create a mock Supabase client.
 *
 * @param authenticatedAs - If provided, `auth.getUser()` will resolve with
 *   this mock user. Pass `null` to simulate an unauthenticated request.
 */
export function createMockSupabaseClient(
  authenticatedAs: MockUser | null = null
): MockSupabaseClient {
  const authUser = authenticatedAs
    ? {
        data: {
          user: {
            id: authenticatedAs.id,
            email: authenticatedAs.email,
            user_metadata: authenticatedAs.user_metadata,
          },
        },
        error: null,
      }
    : { data: { user: null }, error: { message: "Not authenticated" } };

  return {
    from: vi.fn((_table: string) => createMockQueryBuilder()),
    auth: {
      getUser: vi.fn().mockResolvedValue(authUser),
      getSession: vi.fn().mockResolvedValue({
        data: { session: authenticatedAs ? { user: authUser.data.user } : null },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

// ---------------------------------------------------------------------------
// Mock NextRequest helper
// ---------------------------------------------------------------------------

interface MockNextRequestOptions {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
  searchParams?: Record<string, string>;
}

/**
 * Create a mock `NextRequest`-like object that can be passed to API route
 * handlers in tests.
 *
 * This intentionally returns a plain object that satisfies the shape
 * consumed by `requireRoleInApi` and standard `request.json()` / URL
 * parsing, without pulling in the full Next.js runtime.
 */
export function createMockNextRequest(options: MockNextRequestOptions = {}) {
  const {
    method = "GET",
    url = "http://localhost:3000/api/test",
    body = null,
    headers = {},
    searchParams = {},
  } = options;

  const urlObj = new URL(url);
  for (const [key, value] of Object.entries(searchParams)) {
    urlObj.searchParams.set(key, value);
  }

  const headersMap = new Map(Object.entries(headers));

  return {
    method,
    url: urlObj.toString(),
    nextUrl: urlObj,
    headers: {
      get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
      has: (name: string) => headersMap.has(name.toLowerCase()),
      entries: () => headersMap.entries(),
      forEach: (cb: (v: string, k: string) => void) => headersMap.forEach(cb),
    },
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(
      body != null ? JSON.stringify(body) : ""
    ),
  } as unknown;
}
