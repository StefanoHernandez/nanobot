export type SyntaxPalette = { comment: string; string: string; number: string; keyword: string };

export const syntaxColors: Record<"light" | "dark", SyntaxPalette> = {
  light: { comment: "#6a737d", string: "#0a7d3b", number: "#b45309", keyword: "#6d28d9" },
  dark: { comment: "#8b949e", string: "#7ee787", number: "#ffa657", keyword: "#d2a8ff" },
};
