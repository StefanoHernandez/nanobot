module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      "./src/platform/babel-import-meta.js",
      [
        "module-resolver",
        {
          alias: { "@/lib": "./vendor/nanobot/webui/src/lib" },
        },
      ],
    ],
  };
};
