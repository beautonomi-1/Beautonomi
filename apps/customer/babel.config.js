module.exports = function (api) {
  api.cache(true);
  // Jest: avoid NativeWind / css-interop and reanimated plugin (jest-expo + RTL).
  // Use process.env — jest-expo locks Babel cache before `api.env("test")` can run.
  const isTest = process.env.NODE_ENV === "test" || process.env.BABEL_ENV === "test";
  if (isTest) {
    return {
      presets: ["babel-preset-expo"],
      plugins: [
        [
          "module-resolver",
          {
            root: ["."],
            alias: {
              "@": "./src",
            },
          },
        ],
        // Downlevel `import()` to `require()` so Jest (CommonJS, no
        // --experimental-vm-modules) can execute the lazy native-module imports
        // used across the app (e.g. react-native-onesignal in onesignal-client).
        "dynamic-import-node",
      ],
    };
  }
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "@": "./src",
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
