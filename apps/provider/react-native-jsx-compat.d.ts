/**
 * React Native 0.81 exposes several native components through intersection
 * constructors (for example `Constructor<NativeMethods> & typeof Component`).
 * With React 19's JSX element checks, TypeScript can pick the native-methods
 * construct signature and miss the inherited React component instance fields.
 *
 * Keep this shim local to the Expo app so native component declarations remain
 * usable as JSX while runtime behavior continues to come from React Native.
 */
interface Object {
  context: any;
  props: any;
  state: any;
  setState: (...args: any[]) => void;
  forceUpdate: (...args: any[]) => void;
  render: (...args: any[]) => any;
}
