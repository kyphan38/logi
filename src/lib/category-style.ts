// ---------------------------------------------------------------------------
// logi - Bảng dẫn xuất màu category (Stage 4.6 Task 1).
//
// Màu GỐC vẫn là CATEGORY_COLOR trong logi.ts - file này không sửa nó, chỉ trỏ
// sang các CSS variable dẫn xuất khai báo trong globals.css:
//   tint - nền block timeline (alpha ~0.12, tự đảo ở dark mode)
//   ink  - chữ trên nền tint (tương phản >= 4.5 với chính tint đó)
//
// Trả về var() chứ không trả hex, để dark mode tự đổi mà không cần JS.
// ---------------------------------------------------------------------------
import type { Category } from '@/types/logi';

export function catTint(c: Category): string {
  return `var(--cat-${c}-tint)`;
}

export function catInk(c: Category): string {
  return `var(--cat-${c}-ink)`;
}
