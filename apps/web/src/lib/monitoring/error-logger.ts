/**
 * Error Logging Service
 * Logs API errors and failures for monitoring and debugging
 */

import { createClient } from "@supabase/supabase-js";

export interface ErrorLog {
  id?: string;
  error_type: string;
  error_message: string;
  endpoint?: string;
  method?: string;
  status_code?: number;
  user_id?: string;
  provider_id?: string;
  request_data?: any;
  stack_trace?: string;
  severity: "low" | "medium" | "high" | "critical";
  created_at?: string;
}

class ErrorLogger {
  private supabaseAdmin: ReturnType<typeof createClient> | null = null;
  private isInitialized = false;

  private init() {
    if (this.isInitialized) return;

    try {
      // Never initialize on client - SUPABASE_SERVICE_ROLE_KEY is server-only
      if (typeof window !== "undefined") {
        this.isInitialized = true;
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey || typeof supabaseKey !== "string") {
        this.isInitialized = true;
        return;
      }

      this.supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    } catch (error) {
      // Don't propagate - error logging must never break the app
      if (typeof console !== "undefined" && console.error) {
        console.error("Failed to initialize error logger:", error);
      }
    } finally {
      this.isInitialized = true;
    }
  }

  async logError(error: ErrorLog): Promise<void> {
    this.init();
    
    if (!this.supabaseAdmin) {
      // Fallback to console if Supabase not available
      console.error("Error Log:", error);
      return;
    }

    try {
      await this.supabaseAdmin.from("error_logs").insert({
        error_type: error.error_type,
        error_message: error.error_message,
        endpoint: error.endpoint,
        method: error.method,
        status_code: error.status_code,
        user_id: error.user_id,
        provider_id: error.provider_id,
        request_data: error.request_data,
        stack_trace: error.stack_trace,
        severity: error.severity,
      } as never);
    } catch (err) {
      // Don't throw - just log to console if database insert fails
      console.error("Failed to log error to database:", err);
      console.error("Original error:", error);
    }
  }

  async logApiError(
    endpoint: string,
    method: string,
    error: Error | any,
    userId?: string,
    providerId?: string,
    requestData?: any,
    statusCode?: number
  ): Promise<void> {
    const errorLog: ErrorLog = {
      error_type: error.name || "API_ERROR",
      error_message: error.message || String(error),
      endpoint,
      method,
      status_code: statusCode,
      user_id: userId,
      provider_id: providerId,
      request_data: requestData,
      stack_trace: error.stack,
      severity: this.determineSeverity(statusCode, error),
    };

    await this.logError(errorLog);
  }

  private determineSeverity(statusCode?: number, error?: any): ErrorLog["severity"] {
    if (statusCode) {
      if (statusCode >= 500) return "critical";
      if (statusCode >= 400) return "high";
      return "medium";
    }
    
    if (error?.message?.includes("timeout") || error?.message?.includes("network")) {
      return "high";
    }
    
    return "medium";
  }

  async getErrorLogs(filters?: {
    severity?: ErrorLog["severity"];
    endpoint?: string;
    provider_id?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<ErrorLog[]> {
    this.init();
    
    if (!this.supabaseAdmin) {
      return [];
    }

    try {
      let query = this.supabaseAdmin
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (filters?.severity) {
        query = query.eq("severity", filters.severity);
      }
      if (filters?.endpoint) {
        query = query.ilike("endpoint", `%${filters.endpoint}%`);
      }
      if (filters?.provider_id) {
        query = query.eq("provider_id", filters.provider_id);
      }
      if (filters?.start_date) {
        query = query.gte("created_at", filters.start_date);
      }
      if (filters?.end_date) {
        query = query.lte("created_at", filters.end_date);
      }

      const limit = filters?.limit || 100;
      query = query.limit(limit);

      const { data, error } = await query;

      if (error) {
        console.error("Failed to fetch error logs:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Error fetching error logs:", error);
      return [];
    }
  }

  async getErrorStats(timeframe: "24h" | "7d" | "30d" = "24h"): Promise<{
    total: number;
    by_severity: Record<string, number>;
    by_endpoint: Array<{ endpoint: string; count: number }>;
    recent_errors: ErrorLog[];
  }> {
    this.init();
    
    if (!this.supabaseAdmin) {
      return {
        total: 0,
        by_severity: {},
        by_endpoint: [],
        recent_errors: [],
      };
    }

    try {
      const now = new Date();
      const startDate = new Date();
      
      switch (timeframe) {
        case "24h":
          startDate.setHours(now.getHours() - 24);
          break;
        case "7d":
          startDate.setDate(now.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(now.getDate() - 30);
          break;
      }

      const { data, error } = await this.supabaseAdmin
        .from("error_logs")
        .select("*")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch error stats:", error);
        return {
          total: 0,
          by_severity: {},
          by_endpoint: [],
          recent_errors: [],
        };
      }

      const logs = (data || []) as Array<{ severity?: string; endpoint?: string }>;
      
      // Calculate stats
      const by_severity: Record<string, number> = {};
      const by_endpoint_map: Record<string, number> = {};

      logs.forEach((log) => {
        const sev = log.severity ?? "unknown";
        by_severity[sev] = (by_severity[sev] || 0) + 1;
        if (log.endpoint) {
          by_endpoint_map[log.endpoint] = (by_endpoint_map[log.endpoint] || 0) + 1;
        }
      });

      const by_endpoint = Object.entries(by_endpoint_map)
        .map(([endpoint, count]) => ({ endpoint, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        total: logs.length,
        by_severity,
        by_endpoint,
        recent_errors: logs.slice(0, 20) as ErrorLog[],
      };
    } catch (error) {
      console.error("Error calculating error stats:", error);
      return {
        total: 0,
        by_severity: {},
        by_endpoint: [],
        recent_errors: [],
      };
    }
  }
}

export const errorLogger = new ErrorLogger();
