import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { getMockupCatalogEntry, mockupsByPlatform, type MockupPlatform } from "@beautonomi/learning-mockups";
import { Monitor, Smartphone, X } from "lucide-react";

const PLATFORM_LABELS: Record<MockupPlatform, string> = {
  "provider-mobile": "Provider mobile",
  "customer-mobile": "Customer mobile",
  "provider-web": "Provider web",
  "customer-web": "Customer web",
};

function PlatformIcon({ platform }: { platform: MockupPlatform }) {
  if (platform.includes("mobile")) return <Smartphone className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />;
  return <Monitor className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />;
}

export function LearnMockupNodeView({ node, deleteNode, selected }: NodeViewProps) {
  const mockupId = (node.attrs.mockupId as string) || "";
  const caption = (node.attrs.caption as string) || "";
  const entry = getMockupCatalogEntry(mockupId);

  return (
    <NodeViewWrapper
      className={`my-3 rounded-xl border bg-indigo-50/60 p-3 ${selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-indigo-200"}`}
      data-drag-handle
    >
      <div className="flex items-start gap-3">
        <PlatformIcon platform={entry?.platform ?? "provider-mobile"} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">App mockup</p>
          <p className="mt-0.5 text-sm font-medium text-gray-900">
            {entry?.label ?? (mockupId || "Unknown mockup")}
          </p>
          {entry ? (
            <p className="text-xs text-gray-600">{PLATFORM_LABELS[entry.platform]}</p>
          ) : (
            <p className="text-xs text-amber-700">Unknown id — pick a valid mockup from Insert mockup</p>
          )}
          {caption ? <p className="mt-1 text-xs italic text-gray-500">{caption}</p> : null}
          <p className="mt-2 font-mono text-[10px] text-gray-500">data-learn-mockup=&quot;{mockupId}&quot;</p>
        </div>
        <button
          type="button"
          title="Remove mockup"
          onClick={() => deleteNode()}
          className="rounded border border-gray-200 bg-white p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export function buildMockupPickerOptions(): { grouped: Record<MockupPlatform, ReturnType<typeof mockupsByPlatform>> } {
  return {
    grouped: {
      "provider-mobile": mockupsByPlatform("provider-mobile"),
      "customer-mobile": mockupsByPlatform("customer-mobile"),
      "provider-web": mockupsByPlatform("provider-web"),
      "customer-web": mockupsByPlatform("customer-web"),
    },
  };
}
