export function normalizeSearch(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export type EcosystemSearchItem = {
  name: string;
  display_name?: string;
  description?: string;
  category?: string;
  installed?: boolean;
  enabled?: boolean;
  status?: string;
};

export function filterEcosystemItems<T extends EcosystemSearchItem>(
  items: T[],
  query: string,
  isInstalled?: (item: T) => boolean,
): T[] {
  const q = normalizeSearch(query.trim());
  const checkInstalled =
    isInstalled ||
    ((item: T) =>
      Boolean(item.installed || item.enabled || item.status === "installed"));

  const filtered = !q
    ? [...items]
    : items.filter((item) => {
        const name = normalizeSearch(item.name);
        const displayName = normalizeSearch(item.display_name || "");
        const description = normalizeSearch(item.description || "");
        const category = normalizeSearch(item.category || "");
        return (
          name.includes(q) ||
          displayName.includes(q) ||
          description.includes(q) ||
          category.includes(q)
        );
      });

  return filtered.sort((a, b) => {
    const aInst = checkInstalled(a);
    const bInst = checkInstalled(b);
    if (aInst && !bInst) return -1;
    if (!aInst && bInst) return 1;
    return 0;
  });
}
