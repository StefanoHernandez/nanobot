const React = require("react");
const { View } = require("react-native");
// props are readable via the rendered element in tests (javaScriptEnabled etc.)
module.exports = { WebView: (props) => React.createElement(View, { testID: "webview", ...props }) };
