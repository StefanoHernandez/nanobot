module.exports = {
  preset: "jest-expo",
  moduleNameMapper: {
    "^marked$": "<rootDir>/node_modules/marked/lib/marked.umd.js", // ESM-only package
    "\\.vendorjs$": "<rootDir>/test/stubs/vendorjs.js",
  },
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
  setupFilesAfterEnv: ["<rootDir>/test/setup-timeouts.js"],
  testTimeout: 20000,
};
