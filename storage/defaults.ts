import type { BrowserStorage } from "./browser-storage";

const DEFAULTS_KEY = "defaults";

export interface AiMetadataDefaults {
  textLevel?: "0" | "1" | "2" | "3";
  codeLevel?: "0" | "1" | "2";
  tools?: string;
  description?: string;
}

export interface UserDefaults {
  activeAccount: string | null;
  aiMetadata?: AiMetadataDefaults;
  syndicateTo: string[];
  notifyOnBackgroundSuccess?: boolean;
}

const EMPTY: UserDefaults = {
  activeAccount: null,
  syndicateTo: [],
};

export class DefaultsStore {
  constructor(private storage: BrowserStorage) {}

  async get(): Promise<UserDefaults> {
    const stored = await this.storage.get<Partial<UserDefaults>>(DEFAULTS_KEY);
    return { ...EMPTY, ...stored } as UserDefaults;
  }

  private async patch(partial: Partial<UserDefaults>): Promise<void> {
    const current = await this.get();
    await this.storage.set({ [DEFAULTS_KEY]: { ...current, ...partial } });
  }

  async setActiveAccount(domain: string | null): Promise<void> {
    await this.patch({ activeAccount: domain });
  }

  async setAiMetadata(meta: AiMetadataDefaults): Promise<void> {
    await this.patch({ aiMetadata: meta });
  }

  async setSyndicateTo(targets: string[]): Promise<void> {
    await this.patch({ syndicateTo: targets });
  }

  async setNotifyOnBackgroundSuccess(value: boolean): Promise<void> {
    await this.patch({ notifyOnBackgroundSuccess: value });
  }
}
