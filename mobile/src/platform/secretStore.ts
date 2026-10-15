import * as SecureStore from "expo-secure-store";
import type { SecretStore } from "./secretStoreShared";

export const secretStore: SecretStore = {
  async get(key) {
    return SecureStore.getItemAsync(key);
  },
  async set(key, value) {
    await SecureStore.setItemAsync(key, value);
  },
  async del(key) {
    await SecureStore.deleteItemAsync(key);
  },
};
