// Slow or busy runners (GitHub CI, a cold first run) blow testing-library's 1 s waitFor default.
const { configure } = require("@testing-library/react-native");

configure({ asyncUtilTimeout: 5000 });
