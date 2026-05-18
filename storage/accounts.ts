import type { TokenData } from "../core/types";
import type { BrowserStorage } from "./browser-storage";

const ACCOUNTS_KEY = "accounts";
const DEFAULTS_KEY = "defaults";

interface StoredDefaults {
  activeAccount: string | null;
}

export class AccountStore {
  constructor(private storage: BrowserStorage) {}

  private async readAll(): Promise<Record<string, TokenData>> {
    return (await this.storage.get<Record<string, TokenData>>(ACCOUNTS_KEY)) ?? {};
  }

  private async readDefaults(): Promise<StoredDefaults> {
    return (await this.storage.get<StoredDefaults>(DEFAULTS_KEY)) ?? { activeAccount: null };
  }

  private domainFromMe(me: string): string {
    return new URL(me).hostname;
  }

  async list(): Promise<TokenData[]> {
    const all = await this.readAll();
    return Object.values(all);
  }

  async get(domain: string): Promise<TokenData | undefined> {
    const all = await this.readAll();
    return all[domain];
  }

  async getActive(): Promise<TokenData | null> {
    const { activeAccount } = await this.readDefaults();
    if (!activeAccount) return null;
    const all = await this.readAll();
    return all[activeAccount] ?? null;
  }

  async getDefaultDomain(): Promise<string | null> {
    return (await this.readDefaults()).activeAccount;
  }

  async add(token: TokenData): Promise<void> {
    const domain = this.domainFromMe(token.me);
    const all = await this.readAll();
    all[domain] = token;
    await this.storage.set({ [ACCOUNTS_KEY]: all });

    const defaults = await this.readDefaults();
    if (!defaults.activeAccount) {
      await this.storage.set({
        [DEFAULTS_KEY]: { ...defaults, activeAccount: domain },
      });
    }
  }

  async remove(domain: string): Promise<void> {
    const all = await this.readAll();
    delete all[domain];
    await this.storage.set({ [ACCOUNTS_KEY]: all });

    const defaults = await this.readDefaults();
    if (defaults.activeAccount === domain) {
      const remaining = Object.keys(all);
      const newDefault = remaining[0] ?? null;
      await this.storage.set({
        [DEFAULTS_KEY]: { ...defaults, activeAccount: newDefault },
      });
    }
  }

  async setDefault(domain: string): Promise<void> {
    const all = await this.readAll();
    if (!all[domain]) {
      throw new Error(`Account ${domain} not found`);
    }
    const defaults = await this.readDefaults();
    await this.storage.set({
      [DEFAULTS_KEY]: { ...defaults, activeAccount: domain },
    });
  }

  async update(domain: string, token: TokenData): Promise<void> {
    const all = await this.readAll();
    all[domain] = token;
    await this.storage.set({ [ACCOUNTS_KEY]: all });
  }
}
