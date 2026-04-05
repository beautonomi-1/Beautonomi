/**
 * ESLint rule: perf/no-framer-in-list
 *
 * Flags `motion.*` JSX elements (framer-motion) when they appear inside a
 * `.map()` callback. Animating every item in a long list is a major
 * performance hazard — each `motion.*` element creates its own animation
 * context, layout measurement, and style subscription.
 *
 * Suggested fix: remove the motion wrapper or wrap the list item in
 * React.memo with CSS transitions instead.
 */
module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow framer-motion elements inside .map() callbacks — use CSS transitions instead",
    },
    messages: {
      noFramerInList:
        "`motion.{{tag}}` inside a .map() callback animates every list item individually, " +
        "causing layout thrash and high memory usage. Use CSS transitions or remove the motion wrapper.",
    },
    schema: [],
  },
  create(context) {
    function isInsideMapCallback(node) {
      let current = node.parent;
      while (current) {
        if (
          current.type === "ArrowFunctionExpression" ||
          current.type === "FunctionExpression"
        ) {
          const callExpr = current.parent;
          if (
            callExpr &&
            callExpr.type === "CallExpression" &&
            callExpr.callee.type === "MemberExpression" &&
            callExpr.callee.property.type === "Identifier" &&
            callExpr.callee.property.name === "map"
          ) {
            return true;
          }
        }
        current = current.parent;
      }
      return false;
    }

    return {
      JSXOpeningElement(node) {
        const name = node.name;
        if (
          name.type === "JSXMemberExpression" &&
          name.object.type === "JSXIdentifier" &&
          name.object.name === "motion"
        ) {
          if (isInsideMapCallback(node)) {
            context.report({
              node,
              messageId: "noFramerInList",
              data: {
                tag:
                  name.property.type === "JSXIdentifier"
                    ? name.property.name
                    : "element",
              },
            });
          }
        }
      },
    };
  },
};
