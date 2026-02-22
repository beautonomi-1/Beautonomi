/**
 * API Testing Helpers
 * 
 * Utilities for testing API routes
 */

import { expect } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Test API route handler
 */
export async function testApiRoute(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  } = {}
) {
  const { method = 'GET', body, headers = {}, query = {} } = options;
  
  // Build URL with query params
  const url = new URL('http://localhost:3000/api/test');
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const req = new NextRequest(url, {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      ...headers,
    }),
    body: body ? JSON.stringify(body) : undefined,
  });

  try {
    const response = await handler(req);
    
    // Check if response is valid
    if (!response || !response.headers) {
      return {
        status: 500,
        statusText: 'Internal Server Error',
        data: { error: 'Handler returned invalid response' },
        headers: {},
      };
    }
    
    let responseData: any = null;
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      try {
        responseData = await response.json();
      } catch {
        responseData = await response.text();
      }
    } else {
      responseData = await response.text();
    }

    return {
      status: response.status,
      statusText: response.statusText,
      data: responseData,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error: any) {
    return {
      status: 500,
      statusText: 'Internal Server Error',
      data: { error: error?.message || 'Handler threw an error' },
      headers: {},
    };
  }
}

/**
 * Assert API response
 */
export function expectApiResponse(
  response: { status: number; data: any },
  expected: {
    status?: number;
    data?: any;
    hasError?: boolean;
  }
) {
  if (expected.status !== undefined) {
    expect(response.status).toBe(expected.status);
  }

  if (expected.hasError !== undefined) {
    if (expected.hasError) {
      expect(response.data).toHaveProperty('error');
    } else {
      expect(response.data).not.toHaveProperty('error');
    }
  }

  if (expected.data !== undefined) {
    expect(response.data).toMatchObject(expected.data);
  }
}

/**
 * Test authenticated API route
 */
export async function testAuthenticatedRoute(
  handler: (req: NextRequest) => Promise<NextResponse>,
  user: { id: string; role?: string },
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  return testApiRoute(handler, {
    ...options,
    headers: {
      ...options.headers,
      'x-user-id': user.id,
      'x-user-role': user.role || 'provider',
    },
  });
}
