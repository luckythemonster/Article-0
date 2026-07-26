/**
 * An in-memory `localStorage` stand-in for the vitest (node) suite.
 *
 * Test-only scaffolding — nothing in `src/` imports it, so it never reaches a
 * bundle. It lives here rather than duplicated inside each spec because three
 * separate persistence modules (saves, settings, the debug flag) now need one.
 */
export class MemStorage {
  private m = new Map<string, string>();

  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

/** Installs a fresh `localStorage` for a test. Call from `beforeEach`. */
export function installMemStorage(): void {
  globalThis.localStorage = new MemStorage() as unknown as Storage;
}

/** Replaces `localStorage` with one that throws — the private-browsing case. */
export function installBlockedStorage(): void {
  const boom = (): never => {
    throw new Error("storage disabled");
  };
  globalThis.localStorage = {
    get length(): number {
      return boom();
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  } as unknown as Storage;
}
