import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { LearnMockupNodeView } from "./LearnMockupNodeView";

export type LearnMockupAttrs = {
  mockupId: string;
  caption: string;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    learnMockup: {
      insertLearnMockup: (attrs: LearnMockupAttrs) => ReturnType;
    };
  }
}

export const LearnMockup = Node.create({
  name: "learnMockup",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      mockupId: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-learn-mockup") ?? "",
        renderHTML: (attrs: { mockupId: string }) => ({ "data-learn-mockup": attrs.mockupId }),
      },
      caption: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-caption") ?? "",
        renderHTML: (attrs: { caption: string }) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-learn-mockup]' }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, string> }) {
    return ["div", mergeAttributes(HTMLAttributes), ""];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LearnMockupNodeView);
  },

  addCommands() {
    return {
      insertLearnMockup:
        (attrs: LearnMockupAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
