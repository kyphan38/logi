// ============================================================
// logi - Run exactly once per requestId.
// Confirm tapped twice, the mic firing onResult again, a flaky network retry -
// all lead to the same requestId and may only write one copy.
// Pure file, no React, testable with `node --test`.
// ============================================================

export interface Once {
  /**
   * First time with `id` → runs `fn` and returns the result.
   * Later with an old `id` → skipped, returns `null`.
   * If `fn` throws → releases `id` and rethrows, so the user can retry that sentence.
   */
  run<T>(id: string, fn: () => Promise<T>): Promise<T | null>;
  /** Forget `id`, as if it never ran. */
  forget(id: string): void;
  /** How many ids are held. Mostly for tests. */
  readonly size: number;
}

export function createOnce(): Once {
  const seen = new Set<string>();

  return {
    async run<T>(id: string, fn: () => Promise<T>): Promise<T | null> {
      if (seen.has(id)) return null;
      seen.add(id);
      try {
        return await fn();
      } catch (e) {
        seen.delete(id);
        throw e;
      }
    },
    forget(id: string) {
      seen.delete(id);
    },
    get size() {
      return seen.size;
    },
  };
}
