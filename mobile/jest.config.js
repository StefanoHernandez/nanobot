module.exports = {
  preset: "jest-expo",
  moduleNameMapper: { "^marked$": "<rootDir>/node_modules/marked/lib/marked.umd.js" }, // ESM-only package
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
};
