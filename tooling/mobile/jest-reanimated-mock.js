/* global jest */
/**
 * Jest stub for react-native-reanimated 4 + worklets (SDK 57).
 * Must run from jest `setupFiles` (before test modules load).
 */
jest.mock("react-native-worklets", () => ({}));

jest.mock("react-native-reanimated", () => {
  const RN = require("react-native");
  const noop = () => {};
  const identity = (v) => v;

  const easingFn = Object.assign(identity, {
    inOut: () => identity,
    out: () => identity,
    in: () => identity,
    cubic: identity,
  });

  const Easing = {
    linear: identity,
    ease: identity,
    bezier: () => identity,
    inOut: () => identity,
    out: () => identity,
    in: () => identity,
    cubic: easingFn,
  };

  const defaultExport = {
    View: RN.View,
    Text: RN.Text,
    ScrollView: RN.ScrollView,
    createAnimatedComponent: (Component) => Component,
    call: noop,
  };

  return {
    __esModule: true,
    default: defaultExport,
    useSharedValue: (init) => ({ value: init }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn) => ({ value: typeof fn === "function" ? fn() : fn }),
    withRepeat: identity,
    withTiming: identity,
    withSequence: (...args) => args[args.length - 1],
    withDelay: (_delay, anim) => anim,
    interpolate: (_value, _input, output) => output[0],
    Easing,
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
  };
});
