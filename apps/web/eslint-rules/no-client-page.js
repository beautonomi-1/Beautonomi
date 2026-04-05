/**
 * ESLint rule: perf/no-client-page
 *
 * Flags `"use client"` directives in files named page.tsx / page.ts.
 * Pages should be server components by default; extract client logic into
 * child components instead.
 *
 * Disable for a specific file with:
 *   // eslint-disable-next-line perf/no-client-page -- <reason>
 */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        'Disallow "use client" in page.tsx files — pages should be server components',
    },
    messages: {
      noClientPage:
        '"use client" in a page component opts the entire route out of server rendering. ' +
        "Move interactive logic into a separate client component and keep the page as a server component.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    const isPage = /[/\\]page\.(tsx?|jsx?)$/.test(filename);
    if (!isPage) return {};

    return {
      ExpressionStatement(node) {
        if (
          node.expression.type === "Literal" &&
          node.expression.value === "use client" &&
          node.parent.type === "Program" &&
          node.parent.body.indexOf(node) <= 1
        ) {
          context.report({ node, messageId: "noClientPage" });
        }
      },
    };
  },
};
