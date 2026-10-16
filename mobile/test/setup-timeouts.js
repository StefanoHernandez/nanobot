// Slow or busy runners (GitHub CI, a cold first run) blow testing-library's 1 s waitFor default.
const { configure } = require("@testing-library/react-native");

configure({ asyncUtilTimeout: 5000 });

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
