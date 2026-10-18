// Slow or busy runners (GitHub CI, a cold first run) blow testing-library's 1 s waitFor default.
const { configure } = require("@testing-library/react-native");

configure({ asyncUtilTimeout: 5000 });

// Deterministic number formatting across locales for tests
const origNumberToLocaleString = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function (locales = "en-US", options) {
  return origNumberToLocaleString.call(this, locales, options);
};

// Force English language before each file independent of system locale
const { i18n } = require("../src/i18n");
beforeAll(async () => {
  await i18n.changeLanguage("en");
});


jest.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: jest.fn(() => false),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getSupportedLocales: jest.fn(async () => ({ installedLocales: [], locales: [] })),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
}));
