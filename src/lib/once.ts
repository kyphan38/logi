// ============================================================
// logi — Chạy đúng một lần cho mỗi requestId.
// Bấm Confirm hai cái, mic bắn onResult lại, mạng chập chờn rồi retry —
// tất cả đều dẫn tới cùng một requestId và chỉ được ghi một bản.
// File thuần, không React, để test bằng `node --test`.
// ============================================================

export interface Once {
  /**
   * Lần đầu với `id` → chạy `fn` và trả kết quả.
   * Lần sau với `id` cũ → bỏ qua, trả `null`.
   * `fn` ném lỗi → nhả `id` ra rồi ném tiếp, để người dùng thử lại câu đó.
   */
  run<T>(id: string, fn: () => Promise<T>): Promise<T | null>;
  /** Quên `id` đi, coi như chưa từng chạy. */
  forget(id: string): void;
  /** Đã giữ bao nhiêu id. Chủ yếu cho test. */
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
