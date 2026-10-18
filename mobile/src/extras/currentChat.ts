let currentChatKey: string | null = null;

export function setCurrentChatKey(key: string | null): void {
  currentChatKey = key;
}

export function getCurrentChatKey(): string | null {
  return currentChatKey;
}
