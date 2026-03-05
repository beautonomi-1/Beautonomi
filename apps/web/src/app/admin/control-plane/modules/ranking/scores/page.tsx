"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, RefreshCw, ExternalLink } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import RoleGuard from "@/components/auth/RoleGuard";

const ENVS = ["production", "staging", "development"] as const;
const PAGE_SIZE = 50;

interface ScoreRow {
  provider_id: string;
  business_name: string | null;
  slug: string | null;
  computed_score: number;
  components: Record<string, number>;
  updated_at: string;
}

export default function RankingScoresPage() {
  const [env, setEnv] = useState<typeof ENVS[number]>("production");
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [recomputingAll, setRecomputingAll] = useState(false);
  const [recomputingId, setRecomputingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setHasMore(true);
    try {
      const res = await fetcher.get<{ data: { scores: ScoreRow[]; limit: number; offset: number } }>(
        `/api/admin/ranking/scores?limit=${PAGE_SIZE}&offset=0`
      );
      const list = res.data?.scores ?? [];
      setScores(list);
      setHasMore(list.length >= PAGE_SIZE);
    } catch {
      toast.error("Failed to load scores");
      setScores([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await fetcher.get<{ data: { scores: ScoreRow[]; limit: number; offset: number } }>(
        `/api/admin/ranking/scores?limit=${PAGE_SIZE}&offset=${scores.length}`
      );
      const list = res.data?.scores ?? [];
      setScores((prev) => [...prev, ...list]);
      setHasMore(list.length >= PAGE_SIZE);
    } catch {
      toast.error("Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const recomputeAll = async () => {
    setRecomputingAll(true);
    try {
      const res = await fetcher.post<{ data: { recomputed?: number; message?: string } }>(
        "/api/admin/ranking/recompute",
        { full: true, environment: env }
      );
      toast.success(res.data?.message ?? `Recomputed ${res.data?.recomputed ?? 0} providers.`);
      load();
    } catch {
      toast.error("Failed to recompute all");
    } finally {
      setRecomputingAll(false);
    }
  };

  const recomputeOne = async (providerId: string) => {
    setRecomputingId(providerId);
    try {
      await fetcher.post("/api/admin/ranking/recompute", {
        provider_id: providerId,
        environment: env,
      });
      toast.success("Score recomputed");
      load();
    } catch {
      toast.error("Failed to recompute");
    } finally {
      setRecomputingId(null);
    }
  };

  const formatComponents = (c: Record<string, number>) => {
    const entries = Object.entries(c).filter(([, v]) => typeof v === "number");
    if (entries.length === 0) return "—";
    return entries.map(([k, v]) => `${k}: ${(v * 100).toFixed(0)}%`).join(" · ");
  };

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/admin/control-plane/modules/ranking">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Quality Scores</h1>
            <p className="text-muted-foreground">
              Provider quality scores used to re-order Top Rated and Hottest on the home page when ranking is enabled.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Label>Environment (for recompute weights)</Label>
          <Select value={env} onValueChange={(v) => setEnv(v as typeof ENVS[number])}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENVS.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Scores</CardTitle>
            <CardDescription>
              Higher score = higher position. Components: reviews_score, completion_rate, cancellations, response_time (0–1 each).
            </CardDescription>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={recomputeAll}
                disabled={recomputingAll}
                className="gap-2"
              >
                <RefreshCw className={recomputingAll ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {recomputingAll ? "Recomputing…" : "Recompute all"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : scores.length === 0 ? (
              <p className="text-muted-foreground">No scores yet. Run &quot;Recompute all&quot; from the Ranking module or here.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="w-24">Score</TableHead>
                    <TableHead className="max-w-[280px] hidden md:table-cell">Components</TableHead>
                    <TableHead className="hidden sm:table-cell">Updated</TableHead>
                    <TableHead className="w-28"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((row) => (
                    <TableRow key={row.provider_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{row.business_name || row.provider_id}</span>
                          {row.slug && (
                            <Link
                              href={`/partner-profile?slug=${encodeURIComponent(row.slug)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{(row.computed_score * 100).toFixed(1)}%</TableCell>
                      <TableCell className="max-w-[280px] truncate hidden md:table-cell" title={formatComponents(row.components)}>
                        {formatComponents(row.components)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm hidden sm:table-cell">
                        {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => recomputeOne(row.provider_id)}
                          disabled={recomputingId === row.provider_id}
                        >
                          {recomputingId === row.provider_id ? "…" : "Recompute"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!loading && scores.length > 0 && hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
