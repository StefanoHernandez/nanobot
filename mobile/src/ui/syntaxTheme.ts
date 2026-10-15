export type SyntaxPalette = { comment: string; string: string; number: string; keyword: string };

export const syntaxColors: Record<"light" | "dark", SyntaxPalette> = {
  light: { comment: "#6b5e78", string: "#8a5608", number: "#9a3412", keyword: "#4a2c72" },
  dark: { comment: "#a898b8", string: "#f0b429", number: "#ffd59a", keyword: "#d7b6f5" },
};
