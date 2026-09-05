'use client';

// ---------------------------------------------------------------------------
// logi - Thanh tab cho Analytics
//
// Trước đây ba khái niệm thời gian (picker chọn khoảng, "By day", span của Trend) nằm
// chồng nhau trong một trang cuộn dọc, không rõ cái nào chi phối cái nào. Tab
// cắt hẳn: mỗi tab một câu hỏi, một cách đếm thời gian.
//
// Sticky vì thanh tab mất hút khi cuộn thì người đọc quên mình đang ở tab nào.
// Trạng thái để trong `useState` chứ không đẩy lên URL: nút Back trên mobile
// dùng để RỜI Analytics, không phải để lùi tab.
// ---------------------------------------------------------------------------
export interface TabItem<T extends string> {
  value: T;
  label: string;
}

export default function Tabs<T extends string>({
  base,
  items,
  value,
  onChange,
  label,
}: {
  /** Tiền tố id, do TRANG CHA tạo bằng `useId` rồi truyền xuống cả Tabs lẫn
   *  TabPanel. Gọi `useId` riêng ở mỗi component thì `aria-controls` trỏ vào
   *  một id không tồn tại. */
  base: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  // ← → nhảy tab và chọn luôn (automatic activation). Home/End về đầu/cuối.
  // Chỉ tab đang chọn có tabIndex 0 - Tab từ bàn phím vào thanh này một lần,
  // không phải bấm ba lần mới qua hết.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = items.findIndex((t) => t.value === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].value);
    document.getElementById(`${base}-tab-${items[next].value}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-1 rounded-md border border-line-strong bg-surface-1 p-1"
    >
      {items.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            id={`${base}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={`${base}-panel-${t.value}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={`min-h-9 flex-1 rounded-sm text-[13px] transition active:scale-[0.98] ${
              on ? 'bg-surface-2 font-medium text-ink shadow-sm' : 'text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Khung nội dung của một tab. `id`/`aria-labelledby` phải khớp với `Tabs`. */
export function TabPanel({
  base,
  value,
  children,
}: {
  base: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${base}-panel-${value}`}
      aria-labelledby={`${base}-tab-${value}`}
      tabIndex={0}
      className="flex flex-col gap-6"
    >
      {children}
    </div>
  );
}
