/**
 * Test Utilities and Setup
 * 
 * Provides common utilities, mocks, and helpers for testing
 */

import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mock Supabase client for testing
 */
export function createMockSupabaseClient(): Partial<SupabaseClient> {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test-path' }, error: null }),
        download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/file' } }),
      })),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any;
}

/**
 * Mock Next.js request
 */
export function createMockRequest(
  method: string = 'GET',
  body?: any,
  headers?: Record<string, string>
): Partial<Request> {
  return {
    method,
    headers: new Headers(headers || {}),
    json: vi.fn().mockResolvedValue(body || {}),
    text: vi.fn().mockResolvedValue(JSON.stringify(body || {})),
    url: 'http://localhost:3000/api/test',
  } as any;
}

/**
 * Mock Next.js response
 */
export function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    headers: new Headers(),
    redirect: vi.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Mock user data
 */
export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: 'provider',
  provider_id: 'test-provider-id',
};

/**
 * Mock provider data
 */
export const mockProvider = {
  id: 'test-provider-id',
  user_id: 'test-user-id',
  business_name: 'Test Business',
  status: 'active',
};

/**
 * Mock booking data
 */
export const mockBooking = {
  id: 'test-booking-id',
  provider_id: 'test-provider-id',
  customer_id: 'test-customer-id',
  status: 'confirmed',
  service_id: 'test-service-id',
  scheduled_at: new Date().toISOString(),
  total_amount: 10000, // in cents
};

/**
 * Wait for async operations
 */
export async function waitFor(ms: number = 100) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create test database transaction helper
 */
export function createTestTransaction() {
  return {
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
  };
}
