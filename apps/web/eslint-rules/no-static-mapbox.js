/**
 * ESLint rule: perf/no-static-mapbox
 *
 * Flags top-level `import ... from 'mapbox-gl'` or `import ... from 'react-map-gl'`.
 * Mapbox GL JS is ~210 kB gzipped and includes WebGL code that breaks SSR.
 * Always load it via `next/dynamic({ ssr: false })` or a dynamic `import()`.
 */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow static imports of mapbox-gl / react-map-gl — use dynamic import instead",
    },
    messages: {
      noStaticMapbox:
        'Static import of "{{source}}" adds ~210 kB to the client bundle and breaks SSR. ' +
        "Use next/dynamic with { ssr: false } or a dynamic import().",
    },
    schema: [],
  },
  create(context) {
    const BLOCKED = ["mapbox-gl", "react-map-gl"];

    return {
      ImportDeclaration(node) {
        // `import type` is erased at compile time and does not pull mapbox into the bundle.
        if (node.importKind === "type") return;
        const source = node.source.value;
        if (
          BLOCKED.some((pkg) => source === pkg || source.startsWith(pkg + "/"))
        ) {
          context.report({
            node,
            messageId: "noStaticMapbox",
            data: { source },
          });
        }
      },
    };
  },
};
