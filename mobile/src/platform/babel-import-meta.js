// Babel plugin: vendored nanobot code reads `import.meta.env.{MODE,PROD,DEV}` (Vite).
// Metro has no import.meta, so replace it with an equivalent object literal.
// Deliberately applies to every file (global scope), not just vendor/: nothing else uses import.meta.
module.exports = function ({ template }) {
  const build = template.expression(`({ env: {
    MODE: process.env.NODE_ENV,
    PROD: process.env.NODE_ENV === "production",
    DEV: process.env.NODE_ENV !== "production",
  } })`, { placeholderPattern: false });
  return {
    visitor: {
      MetaProperty(path) {
        if (path.node.meta.name === "import" && path.node.property.name === "meta") {
          path.replaceWith(build());
        }
      },
    },
  };
};
