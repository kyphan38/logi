'use client';

// ---------------------------------------------------------------------------
// logi - Khung cho MỘT hình / MỘT bảng
//
// Trước đây các phần của Analytics chỉ cách nhau bằng khoảng trắng. Cuộn trên
// màn 375px thì nhãn trục X của chart này nằm ngay trên tiêu đề của chart kia,
// mắt không biết con số nào thuộc về hình nào.
//
// Một hình = một khung. Ba chỗ cố định:
//   - `title`     góc trái trên, chữ nhỏ in hoa
//   - `action`    góc phải trên - chỗ duy nhất cho dropdown của hình đó
//   - `footnote`  đáy khung - câu giải thích cách đọc, không phải chú thích màu
// ---------------------------------------------------------------------------
import type { ReactNode } from 'react';

interface Props {
  title?: string;
  /** Điều khiển riêng của hình này (dropdown…). Luôn nằm cùng hàng với title. */
  action?: ReactNode;
  /** Câu ngắn dạy cách đọc hình. Đặt dưới cùng, sau khi đã nhìn xong hình. */
  footnote?: ReactNode;
  children: ReactNode;
  /** Nhãn cho screen reader khi khung không có `title` nhìn thấy được. */
  label?: string;
}

export default function Card({ title, action, footnote, children, label }: Props) {
  return (
    <section
      aria-label={label ?? title}
      className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-2 p-4"
    >
      {/* flex-wrap: khung nào nhiều dropdown thì action tự xuống hàng dưới
          title, thay vì ép các ô hẹp tới mức cụt chữ. */}
      {(title || action) && (
        <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {title ? (
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      )}

      {children}

      {footnote && <p className="text-[11px] leading-snug text-ink-muted">{footnote}</p>}
    </section>
  );
}

/**
 * Dropdown dùng trong `action`. Dùng `<select>` thật chứ không dựng menu tay:
 * trên iOS nó mở bánh xe chọn của hệ thống, không bao giờ bị lệch hay bị cắt
 * bởi khung cha đang `overflow-hidden`.
 */
export function CardSelect<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none rounded-sm border border-line-strong bg-surface-1 py-1 pl-2.5 pr-7 text-[13px] text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-ink-muted"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
