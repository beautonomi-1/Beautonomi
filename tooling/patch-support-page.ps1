$p = "c:\Users\NoloSehlolo\Documents\Beautonomi\apps\admin-web\src\routes\SupportTicketsPage.tsx"
$c = Get-Content -Raw -LiteralPath $p
if ($c -notmatch 'isSuperadmin') {
  $c = $c -replace 'const \{ bootstrap \} = useAdminSession\(\);', "const { bootstrap } = useAdminSession();`r`n  const isSuperadmin = bootstrap?.is_superadmin === true;"
}
if ($c -notmatch 'zohoMailConfig') {
  $needle = "  }, [allowed, qc]);`r`n`r`n  const statusFilter"
  $insert = @"
  }, [allowed, qc]);

  const zohoMailHealth = useQuery({
    queryKey: adminQueryKeys.zohoMailConfig(),
    queryFn: () =>
      adminApi.getJson<{ mailboxes: Array<{ address?: string; inbound_enabled?: boolean; last_sync_at?: string | null }> }>(
        "/api/admin/integrations/zoho-mail",
      ),
    enabled: allowed && isSuperadmin,
    staleTime: 60_000,
  });
  const staleZohoInbound =
    isSuperadmin &&
    (zohoMailHealth.data?.mailboxes ?? []).some((mb) => {
      if (!mb.inbound_enabled) return false;
      const at = mb.last_sync_at ? new Date(mb.last_sync_at).getTime() : 0;
      return !at || Date.now() - at > 15 * 60 * 1000;
    });

  const statusFilter
"@
  $c = $c.Replace($needle, $insert)
}
if ($c -notmatch 'Zoho Mail inbound sync is stale') {
  $bannerNeedle = "      />`r`n`r`n      {counts ? ("
  $banner = @"
      />

      {staleZohoInbound ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Zoho Mail inbound sync is stale (&gt;15 min). Check Integrations → Zoho Mail or the sync cron.
        </p>
      ) : null}

      {counts ? (
"@
  $c = $c.Replace($bannerNeedle, $banner)
}
Set-Content -LiteralPath $p -Value $c -NoNewline
