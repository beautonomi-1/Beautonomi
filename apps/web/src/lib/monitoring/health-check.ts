/**
 * API Health Check Service
 * Monitors API endpoint health and response times
 */

import { createClient } from "@supabase/supabase-js";

export interface HealthCheckResult {
  endpoint: string;
  method: string;
  status: "healthy" | "degraded" | "down";
  response_time_ms: number;
  status_code?: number;
  error?: string;
  checked_at: string;
}

export interface EndpointHealth {
  endpoint: string;
  method: string;
  average_response_time_ms: number;
  success_rate: number;
  total_checks: number;
  last_check: string;
  last_status: "healthy" | "degraded" | "down";
}

class HealthCheckService {
  private supabaseAdmin: ReturnType<typeof createClient> | null = null;
  private isInitialized = false;

  private init() {
    if (this.isInitialized) return;
    
    // Never initialize on client - SUPABASE_SERVICE_ROLE_KEY is server-only
    if (typeof window !== "undefined") {
      this.isInitialized = true;
      return;
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      this.isInitialized = true;
      return;
    }
    
    try {
      this.supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize health check service:", error);
      this.isInitialized = true;
    }
  }

  async recordHealthCheck(result: HealthCheckResult): Promise<void> {
    this.init();
    
    if (!this.supabaseAdmin) {
      return;
    }

    try {
      await this.supabaseAdmin.from("api_health_checks").insert({
        endpoint: result.endpoint,
        method: result.method,
        status: result.status,
        response_time_ms: result.response_time_ms,
        status_code: result.status_code,
        error: result.error,
        checked_at: result.checked_at,
      } as never);
    } catch (error) {
      console.error("Failed to record health check:", error);
    }
  }

  async getEndpointHealth(
    endpoint: string,
    method: string = "GET",
    hours: number = 24
  ): Promise<EndpointHealth | null> {
    this.init();
    
    if (!this.supabaseAdmin) {
      return null;
    }

    try {
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);

      const { data, error } = await this.supabaseAdmin
        .from("api_health_checks")
        .select("*")
        .eq("endpoint", endpoint)
        .eq("method", method)
        .gte("checked_at", startDate.toISOString())
        .order("checked_at", { ascending: false });

      if (error || !data || data.length === 0) {
        return null;
      }

      type HealthCheckRow = { status?: string; response_time_ms?: number; checked_at?: string };
      const checks = data as HealthCheckRow[];
      const totalChecks = checks.length;
      const successfulChecks = checks.filter((check) => check.status === "healthy").length;
      const successRate = (successfulChecks / totalChecks) * 100;
      const avgResponseTime =
        checks.reduce((sum, check) => sum + (check.response_time_ms ?? 0), 0) / totalChecks;

      const lastCheck = checks[0];
      const lastStatus = lastCheck.status as "healthy" | "degraded" | "down";

      return {
        endpoint,
        method,
        average_response_time_ms: Math.round(avgResponseTime),
        success_rate: Math.round(successRate * 100) / 100,
        total_checks: totalChecks,
        last_check: lastCheck.checked_at ?? "",
        last_status: lastStatus,
      };
    } catch (error) {
      console.error("Error fetching endpoint health:", error);
      return null;
    }
  }

  async getAllEndpointsHealth(hours: number = 24): Promise<EndpointHealth[]> {
    this.init();
    
    if (!this.supabaseAdmin) {
      return [];
    }

    try {
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - hours);

      const { data, error } = await this.supabaseAdmin
        .from("api_health_checks")
        .select("*")
        .gte("checked_at", startDate.toISOString())
        .order("checked_at", { ascending: false });

      if (error || !data) {
        return [];
      }

      type HealthCheckRow = { endpoint?: string; method?: string; status?: string; response_time_ms?: number; checked_at?: string };
      const checks = data as HealthCheckRow[];

      // Group by endpoint and method
      const endpointMap = new Map<string, {
        checks: HealthCheckResult[];
        endpoint: string;
        method: string;
      }>();

      checks.forEach((check) => {
        const endpoint = check.endpoint ?? "";
        const method = check.method ?? "";
        const key = `${endpoint}:${method}`;
        if (!endpointMap.has(key)) {
          endpointMap.set(key, {
            checks: [],
            endpoint,
            method,
          });
        }
        endpointMap.get(key)!.checks.push(check as HealthCheckResult);
      });

      // Calculate health for each endpoint
      const results: EndpointHealth[] = [];

      endpointMap.forEach(({ checks, endpoint, method }) => {
        const totalChecks = checks.length;
        const successfulChecks = checks.filter((c) => c.status === "healthy").length;
        const successRate = (successfulChecks / totalChecks) * 100;
        const avgResponseTime =
          checks.reduce((sum, check) => sum + check.response_time_ms, 0) / totalChecks;

        const lastCheck = checks[0];
        const lastStatus = lastCheck.status as "healthy" | "degraded" | "down";

        results.push({
          endpoint,
          method,
          average_response_time_ms: Math.round(avgResponseTime),
          success_rate: Math.round(successRate * 100) / 100,
          total_checks: totalChecks,
          last_check: lastCheck.checked_at,
          last_status: lastStatus,
        });
      });

      return results.sort((a, b) => {
        // Sort by status (down first, then degraded, then healthy)
        const statusOrder = { down: 0, degraded: 1, healthy: 2 };
        return statusOrder[a.last_status] - statusOrder[b.last_status];
      });
    } catch (error) {
      console.error("Error fetching all endpoints health:", error);
      return [];
    }
  }

  async getSystemHealth(): Promise<{
    overall_status: "healthy" | "degraded" | "down";
    total_endpoints: number;
    healthy_endpoints: number;
    degraded_endpoints: number;
    down_endpoints: number;
    average_response_time_ms: number;
    endpoints: EndpointHealth[];
  }> {
    const endpoints = await this.getAllEndpointsHealth(24);

    const healthy = endpoints.filter((e) => e.last_status === "healthy").length;
    const degraded = endpoints.filter((e) => e.last_status === "degraded").length;
    const down = endpoints.filter((e) => e.last_status === "down").length;

    const avgResponseTime =
      endpoints.length > 0
        ? endpoints.reduce((sum, e) => sum + e.average_response_time_ms, 0) / endpoints.length
        : 0;

    let overall_status: "healthy" | "degraded" | "down" = "healthy";
    if (down > 0) {
      overall_status = "down";
    } else if (degraded > 0 || healthy < endpoints.length * 0.8) {
      overall_status = "degraded";
    }

    return {
      overall_status,
      total_endpoints: endpoints.length,
      healthy_endpoints: healthy,
      degraded_endpoints: degraded,
      down_endpoints: down,
      average_response_time_ms: Math.round(avgResponseTime),
      endpoints,
    };
  }
}

export const healthCheckService = new HealthCheckService();
