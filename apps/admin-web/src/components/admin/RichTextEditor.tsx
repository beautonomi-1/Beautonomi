import { useCallback, useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useEditor, EditorContent, type Editor, type Extensions } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { mockupsByPlatform, type MockupPlatform } from "@beautonomi/learning-mockups";
import { LearnMockup } from "./extensions/learnMockup";

type RichTextEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
  /**
   * Adds image (URL) + YouTube embed tools for learning articles and other rich HTML.
   * CMS page sections typically use the default (no extra nodes).
   */
  variant?: "default" | "learning";
};

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
        active ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({
  editor,
  variant,
}: {
  editor: Editor | null;
  variant: "default" | "learning";
}) {
  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const insertImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL (https:// or /path…)", "https://");
    if (!url?.trim()) return;
    const alt = window.prompt("Alt text (optional, for accessibility)")?.trim();
    editor.chain().focus().setImage({ src: url.trim(), ...(alt ? { alt } : {}) }).run();
  }, [editor]);

  const insertYoutube = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("YouTube URL (watch, youtu.be, or Shorts)", "https://www.youtube.com/watch?v=");
    if (!url?.trim()) return;
    editor.chain().focus().setYoutubeVideo({ src: url.trim() }).run();
  }, [editor]);

  const insertMockup = useCallback(() => {
    if (!editor) return;

    const platforms: MockupPlatform[] = ["provider-mobile", "customer-mobile", "provider-web", "customer-web"];
    const lines: string[] = [];
    let index = 1;
    const indexToId = new Map<number, string>();

    for (const platform of platforms) {
      const items = mockupsByPlatform(platform);
      if (items.length === 0) continue;
      lines.push(`--- ${platform} ---`);
      for (const item of items) {
        lines.push(`${index}. ${item.label}`);
        indexToId.set(index, item.id);
        index += 1;
      }
    }

    const pick = window.prompt(
      `Choose a mockup (enter the number):\n\n${lines.join("\n")}`,
      "1",
    );
    if (pick === null) return;
    const n = parseInt(pick.trim(), 10);
    const mockupId = indexToId.get(n);
    if (!mockupId) {
      window.alert("Invalid selection. Use Insert mockup again and pick a number from the list.");
      return;
    }

    const caption = window.prompt("Caption (optional, shown under the mockup on the public site)")?.trim() ?? "";
    editor.chain().focus().insertLearnMockup({ mockupId, caption }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50/80 p-2">
      <ToolbarButton
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        U
      </ToolbarButton>
      <ToolbarButton
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>
      <ToolbarButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolbarButton>
      <ToolbarButton
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        “”
      </ToolbarButton>
      <ToolbarButton title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        ─
      </ToolbarButton>
      <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
        Link
      </ToolbarButton>
      {variant === "learning" ? (
        <>
          <ToolbarButton title="Insert image from URL" onClick={insertImage}>
            Image
          </ToolbarButton>
          <ToolbarButton title="Insert YouTube video" onClick={insertYoutube}>
            YouTube
          </ToolbarButton>
          <ToolbarButton title="Insert app mockup" onClick={insertMockup}>
            Mockup
          </ToolbarButton>
        </>
      ) : null}
      <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}>
        Undo
      </ToolbarButton>
      <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}>
        Redo
      </ToolbarButton>
      <ToolbarButton
        title="Clear formatting"
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
      >
        Clear
      </ToolbarButton>
    </div>
  );
}

/**
 * TipTap-based WYSIWYG for CMS `page_content` HTML sections (Become a partner, policies, etc.).
 * Outputs sanitized-friendly HTML (paragraphs, lists, links, headings).
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeightClassName = "min-h-[200px]",
  variant = "default",
}: RichTextEditorProps) {
  const extensions: Extensions = useMemo(() => {
    const base: Extensions = [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
          class: "text-indigo-600 underline",
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || "Write content…",
      }),
    ];
    if (variant === "learning") {
      return [
        ...base,
        LearnMockup,
        Image.configure({
          inline: false,
          allowBase64: false,
          HTMLAttributes: {
            class: "max-w-full h-auto rounded-lg border border-gray-200 bg-gray-50",
          },
        }),
        Youtube.configure({
          controls: true,
          nocookie: true,
          width: 640,
          height: 360,
          HTMLAttributes: {
            class: "w-full max-w-full rounded-lg border border-gray-200",
          },
        }),
      ];
    }
    return base;
  }, [placeholder, variant]);

  const editorClassName = [
    "tiptap focus:outline-none",
    minHeightClassName,
    "max-w-none px-3 py-2 text-sm text-gray-900",
    "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold",
    variant === "learning"
      ? "[&_iframe]:aspect-video [&_iframe]:min-h-[200px] [&_iframe]:w-full [&_iframe]:max-w-full [&_iframe]:rounded-lg"
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const editor = useEditor({
    extensions,
    content: value || "",
    editorProps: {
      attributes: {
        class: editorClassName,
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    const current = editor.getHTML();
    if (incoming === current) return;
    if (editor.isFocused) return;
    editor.commands.setContent(incoming, { emitUpdate: false });
  }, [value, editor]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
      <EditorToolbar editor={editor} variant={variant} />
      <EditorContent editor={editor} className="tiptap-root bg-white" />
    </div>
  );
}
