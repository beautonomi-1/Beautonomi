/* global jest */
/**
 * Extra setup after jest-expo (react-native/jest preset) initializes.
 * Do not mock `react-native` here — jest-expo provides compatible mocks.
 */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Initialise bundled i18n so components using useTranslation() render en.json strings in tests.
const { initI18n } = require("@beautonomi/i18n");
initI18n("en");

/** Deterministic RN scheduling — avoids flakes when turbo runs many Jest workers under load. */
const InteractionManager =
  require("react-native/Libraries/Interaction/InteractionManager").default;

const imRunAfterInteractions = jest.spyOn(InteractionManager, "runAfterInteractions");

beforeEach(() => {
  imRunAfterInteractions.mockImplementation((task) => {
    const run =
      typeof task === "function"
        ? task
        : typeof task?.run === "function"
          ? () => task.run()
          : null;
    if (run) queueMicrotask(run);
    return { cancel: jest.fn() };
  });
});

if (typeof global.requestAnimationFrame !== "function") {
  global.requestAnimationFrame = (callback) => {
    queueMicrotask(() => callback(Date.now()));
    return 1;
  };
}
