/**
 * eslint-plugin-perf — local performance guardrail rules.
 *
 * Register in eslint.config.mjs:
 *   import perfPlugin from './eslint-rules/index.js';
 *   { plugins: { perf: perfPlugin }, rules: { ... } }
 */
module.exports = {
  rules: {
    "no-client-page": require("./no-client-page"),
    "no-inline-render-item": require("./no-inline-render-item"),
    "no-heavy-barrel-import": require("./no-heavy-barrel-import"),
    "no-static-mapbox": require("./no-static-mapbox"),
    "no-framer-in-list": require("./no-framer-in-list"),
  },
};
