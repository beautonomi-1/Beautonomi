type Props = {
  briefId?: string;
  campaignId?: string;
};

export function ExportMenu({ briefId, campaignId }: Props) {
  const base = import.meta.env.VITE_ADMIN_API_ORIGIN ?? "";
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {briefId ? (
        <a
          className="rounded border px-2 py-1 hover:bg-zinc-50"
          href={`${base}/api/admin/brand/briefs/${briefId}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          Brief PDF
        </a>
      ) : null}
      {campaignId ? (
        <>
          <a
            className="rounded border px-2 py-1 hover:bg-zinc-50"
            href={`${base}/api/admin/brand/campaigns/${campaignId}/pdf?kind=plan`}
            target="_blank"
            rel="noreferrer"
          >
            Plan PDF
          </a>
          <a
            className="rounded border px-2 py-1 hover:bg-zinc-50"
            href={`${base}/api/admin/brand/campaigns/${campaignId}/pdf?kind=closeout`}
            target="_blank"
            rel="noreferrer"
          >
            Close-out PDF
          </a>
        </>
      ) : null}
    </div>
  );
}
