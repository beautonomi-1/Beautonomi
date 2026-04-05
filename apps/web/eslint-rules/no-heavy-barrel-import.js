/**
 * ESLint rule: perf/no-heavy-barrel-import
 *
 * Flags imports from known heavy packages when they appear in shared
 * component files (src/components/**). Heavy barrel imports pull the
 * entire library into the client bundle even when tree-shaking should
 * handle it, because many of these libraries are not properly
 * side-effect-free.
 *
 * Flagged packages (configurable via options):
 *   framer-motion, recharts, mapbox-gl, react-map-gl, @dnd-kit/core,
 *   chart.js, three
 *
 * Suggested fix: use dynamic import or next/dynamic with { ssr: false }.
 */
const DEFAULT_HEAVY = [
  "framer-motion",
  "recharts",
  "mapbox-gl",
  "react-map-gl",
  "@dnd-kit/core",
  "chart.js",
  "three",
];

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow static imports of heavy libraries in shared component files",
    },
    messages: {
      heavyImport:
        '"{{source}}" is a heavy dependency ({{size}}). ' +
        "Use next/dynamic or a lazy import to avoid bloating the shared bundle.",
    },
    schema: [
      {
        type: "object",
        properties: {
          packages: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    const isShared =
      /[/\\]src[/\\]components[/\\]/.test(filename) ||
      /[/\\]src[/\\]lib[/\\]/.test(filename);
    if (!isShared) return {};

    const opts = context.options[0] || {};
    const heavyPkgs = opts.packages || DEFAULT_HEAVY;

    const SIZE_HINTS = {
      "framer-motion": "~60 kB gzip",
      recharts: "~90 kB gzip",
      "mapbox-gl": "~210 kB gzip",
      "react-map-gl": "~210 kB gzip (includes mapbox-gl)",
      "@dnd-kit/core": "~25 kB gzip",
      "chart.js": "~65 kB gzip",
      three: "~150 kB gzip",
    };

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        const match = heavyPkgs.find(
          (pkg) => source === pkg || source.startsWith(pkg + "/"),
        );
        if (match) {
          context.report({
            node,
            messageId: "heavyImport",
            data: {
              source,
              size: SIZE_HINTS[match] || "large",
            },
          });
        }
      },
    };
  },
};
