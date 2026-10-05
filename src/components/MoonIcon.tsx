/**
 * Mặt trăng một nét cho nút bedtime. KHÔNG dùng emoji 🌙: trình duyệt vẽ emoji
 * bằng bảng màu riêng (vàng), bỏ qua màu chữ xung quanh (DESIGN.md).
 */
export default function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline-block h-3 w-3 align-[-1px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
