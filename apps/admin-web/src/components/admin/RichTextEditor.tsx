import { useEffect, useRef } from "react";

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
};

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

/**
 * Lightweight WYSIWYG (contenteditable). Syncs from `value` when not focused.
 * Use for per-line marketing bullets; full Quill editor lives on the Next.js admin app.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-[120px]",
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || focused.current) return;
    const next = value || "";
    if (el.innerHTML !== next) {
      el.innerHTML = next;
    }
  }, [value]);

  return (
    <div className="rounded-lg border border-gray-300 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 p-2">
        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs" onClick={() => exec("bold")}>
          Bold
        </button>
        <button type="button" className="rounded border border-gray-200 px-2 py-1 text-xs" onClick={() => exec("italic")}>
          Italic
        </button>
        <button
          type="button"
          className="rounded border border-gray-200 px-2 py-1 text-xs"
          onClick={() => exec("insertUnorderedList")}
        >
          Bullet
        </button>
        <button
          type="button"
          className="rounded border border-gray-200 px-2 py-1 text-xs"
          onClick={() => exec("insertOrderedList")}
        >
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
        ref={ref}
        className={`${minHeightClassName} w-full px-3 py-2 text-sm focus:outline-none`}
        contentEditable
        suppressContentEditableWarning
        aria-label={placeholder || "Rich text editor"}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
        }}
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
      />
    </div>
  );
}
