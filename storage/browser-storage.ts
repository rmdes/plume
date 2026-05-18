export interface BrowserStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  get<T = unknown>(keys: string[]): Promise<Record<string, T>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export class FakeBrowserStorage implements BrowserStorage {
  private data: Record<string, unknown> = {};

  async get<T = unknown>(key: string): Promise<T | undefined>;
  async get<T = unknown>(keys: string[]): Promise<Record<string, T>>;
  async get<T = unknown>(key: string | string[]): Promise<T | undefined | Record<string, T>> {
    if (Array.isArray(key)) {
      const result: Record<string, T> = {};
      for (const k of key) {
        if (k in this.data) result[k] = this.data[k] as T;
      }
      return result;
    }
    return this.data[key] as T | undefined;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(this.data, items);
  }

  async remove(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) delete this.data[k];
  }

  async clear(): Promise<void> {
    this.data = {};
  }
}

/**
 * Adapter for chrome.storage.local. Used in the extension runtime.
 * Not exported to tests — tests use FakeBrowserStorage directly.
 */
export class ChromeBrowserStorage implements BrowserStorage {
  constructor(private area: chrome.storage.StorageArea) {}

  async get<T = unknown>(key: string): Promise<T | undefined>;
  async get<T = unknown>(keys: string[]): Promise<Record<string, T>>;
  async get<T = unknown>(key: string | string[]): Promise<T | undefined | Record<string, T>> {
    const result = await this.area.get(key);
    if (Array.isArray(key)) return result as Record<string, T>;
    return result[key] as T | undefined;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await this.area.set(items);
  }

  async remove(key: string | string[]): Promise<void> {
    await this.area.remove(key);
  }

  async clear(): Promise<void> {
    await this.area.clear();
  }
}
