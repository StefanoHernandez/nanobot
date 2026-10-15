export interface KV {
  get(k: string): string | null;
  set(k: string, v: string): void;
  del(k: string): void;
  keys(): string[];
}
