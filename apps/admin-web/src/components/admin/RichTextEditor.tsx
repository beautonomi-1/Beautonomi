import { useMemo } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
};

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-[180px]",
}: RichTextEditorProps) {
  const id = useMemo(() => `rte-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className="rounded-lg border border-gray-300 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 p-2">
        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs" onClick={() => exec("bold")}>
          Bold
        </button>
        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs" onClick={() => exec("italic")}>
          Italic
        </button>
        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs" onClick={() => exec("insertUnorderedList")}>
          Bullet
        </button>
        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs" onClick={() => exec("insertOrderedList")}>
          Number
        </button>
        <button
          type="button"
          className="rounded border border-gray-200 px-2 py-1 text-xs"
          onClick={() => {
            const link = window.prompt("Enter URL");
            if (link) exec("createLink", link);
          }}
        >
          Link
        </button>
      </div>
      <div
        id={id}
        className={`${minHeightClassName} w-full px-3 py-2 text-sm focus:outline-none`}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || "Write content..."}
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        dangerouslySetInnerHTML={{ __html: value || "" }}
      />
    </div>
  );
}

