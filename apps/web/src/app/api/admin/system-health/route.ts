import { NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireRoleInApi, successResponse, handleApiError } from "@/lib/supabase/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabase = await getSupabaseServer(request);

    const { searchParams } = new URL(request.url);
    const metricType = searchParams.get("type");
    const hours = parseInt(searchParams.get("hours") || "24");

    const since = new Date();
    since.setHours(since.getHours() - hours);

    let query = supabase
      .from("system_health_metrics")
      .select("*")
      .gte("recorded_at", since.toISOString())
      .order("recorded_at", { ascending: false });

    if (metricType) {
      query = query.eq("metric_type", metricType);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Get current system stats
    const stats = {
      api_requests: {
        total: 0,
        successful: 0,
        failed: 0,
        avg_response_time: 0,
      },
      database: {
        connections: 0,
        query_time: 0,
        slow_queries: 0,
      },
      server: {
        cpu_usage: 0,
        memory_usage: 0,
        disk_usage: 0,
      },
      errors: {
        total: 0,
        rate: 0,
      },
    };

    // Calculate stats from metrics
    const apiMetrics = data?.filter((m) => m.metric_type === "api") || [];
    const _dbMetrics = data?.filter((m) => m.metric_type === "database") || [];
    const _serverMetrics = data?.filter((m) => m.metric_type === "server") || [];
    const errorMetrics = data?.filter((m) => m.metric_type === "error") || [];

    // Aggregate API stats
    if (apiMetrics.length > 0) {
      stats.api_requests.total = apiMetrics.length;
      stats.api_requests.successful = apiMetrics.filter(
        (m) => m.status === "success"
      ).length;
      stats.api_requests.failed = apiMetrics.filter(
        (m) => m.status === "error"
      ).length;
      const responseTimes = apiMetrics
        .map((m) => m.metadata?.response_time || 0)
        .filter((t) => t > 0);
      if (responseTimes.length > 0) {
        stats.api_requests.avg_response_time =
          responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      }
    }

    // Aggregate error stats
    if (errorMetrics.length > 0) {
      stats.errors.total = errorMetrics.length;
      stats.errors.rate = errorMetrics.length / hours;
    }

    return successResponse({
      metrics: data || [],
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return handleApiError(error, "Failed to fetch system health");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoleInApi(["superadmin"], request);

    const supabase = await getSupabaseServer(request);
    const body = await request.json();
    const { metric_type, metric_name, value, unit, status, metadata } = body;

    if (!metric_type || !metric_name) {
      return handleApiError(
        new Error("metric_type and metric_name are required"),
        "metric_type and metric_name are required",
        "VALIDATION_ERROR",
        400
      );
    }

    const { data, error } = await supabase
      .from("system_health_metrics")
      .insert({
        metric_type,
        metric_name,
        value,
        unit,
        status: status || "healthy",
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) throw error;

    return successResponse({ metric: data }, 201);
  } catch (error: any) {
    return handleApiError(error, "Failed to record system health metric");
  }
}
