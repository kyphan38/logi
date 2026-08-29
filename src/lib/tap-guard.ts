// ---------------------------------------------------------------------------
// logi - Chống click nhầm khi cuộn (AMENDMENT-remove-sleep 6c)
//
// Trên iOS, một cú vuốt kết thúc bằng `click` nếu ngón dừng lại trên nút. Nút
// Start chỉ cần một chạm nên không có bước xác nhận nào đỡ cho nó - phải chặn
// ngay ở tầng cử chỉ.
//
// Ba lớp, tất cả đều rẻ:
//   1. ngón di chuyển dưới 10px
//   2. tổng thời gian dưới 500ms
//   3. không nằm trong 300ms sau lần scroll gần nhất
//
// Lớp thứ tư (Undo 5 giây) nằm ở tầng UI vì nó cần toast.
//
// File thuần: không React, không DOM - test bằng `node --test`.
// ---------------------------------------------------------------------------

/** Ngón di quá chừng này là đang vuốt, không phải chạm. */
export const MOVE_LIMIT_PX = 10;

/** Giữ lâu hơn chừng này là cố ý làm gì khác, không phải chạm. */
export const PRESS_LIMIT_MS = 500;

/** Vừa cuộn xong thì mọi chạm đều đáng ngờ. */
export const SCROLL_BLOCK_MS = 300;

export interface Press {
  /** Toạ độ lúc `pointerdown`. */
  downX: number;
  downY: number;
  downAt: number;
  /** Toạ độ lúc `pointerup`. */
  upX: number;
  upY: number;
  upAt: number;
  /** Lần `scroll` gần nhất. Chưa cuộn lần nào → null. */
  lastScrollAt: number | null;
}

/** Khoảng cách thẳng, không phải theo trục - vuốt chéo cũng là vuốt. */
export function pressDistance(p: Press): number {
  return Math.hypot(p.upX - p.downX, p.upY - p.downY);
}

/**
 * Chạm này có được tính là một cú bấm thật không?
 *
 * Mọi điều kiện đều là "phải nằm trong ngưỡng" - nghi ngờ thì bỏ qua. Bỏ sót
 * một cú bấm thật thì người dùng bấm lại; nhận nhầm một cú vuốt thì tự nhiên
 * mọc ra một session.
 */
export function isRealTap(p: Press): boolean {
  if (pressDistance(p) > MOVE_LIMIT_PX) return false;
  if (p.upAt - p.downAt >= PRESS_LIMIT_MS) return false;
  if (p.lastScrollAt !== null && p.upAt - p.lastScrollAt < SCROLL_BLOCK_MS) return false;
  return true;
}
