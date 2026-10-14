// Types for the Vite-style import.meta.env used by vendored nanobot code (see babel-import-meta.js).
interface ImportMeta {
  readonly env: { MODE: string; PROD: boolean; DEV: boolean };
}
