/**
 * ESLint rule: perf/no-inline-render-item
 *
 * Flags inline arrow / function expressions passed to the `renderItem` prop
 * on list components (FlatList, FlashList, VirtualList, etc.).
 * Inline renderItem creates a new function reference on every render,
 * defeating list virtualisation memoisation.
 *
 * Good:
 *   const renderRow = useCallback((item) => <Row item={item} />, []);
 *   <FlashList renderItem={renderRow} />
 *
 * Bad:
 *   <FlashList renderItem={(item) => <Row item={item} />} />
 */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow inline functions for renderItem — extract to useCallback or a named function",
    },
    messages: {
      noInlineRenderItem:
        "Inline `renderItem` creates a new function on every render, breaking list memoisation. " +
        "Extract it to a useCallback or a stable named function.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (
          node.name.type === "JSXIdentifier" &&
          node.name.name === "renderItem" &&
          node.value &&
          node.value.type === "JSXExpressionContainer"
        ) {
          const expr = node.value.expression;
          if (
            expr.type === "ArrowFunctionExpression" ||
            expr.type === "FunctionExpression"
          ) {
            context.report({ node, messageId: "noInlineRenderItem" });
          }
        }
      },
    };
  },
};
