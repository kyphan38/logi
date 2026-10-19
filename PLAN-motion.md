# PLAN-motion - logi: chuyển động và tương tác

Viết ngày 2026-10-19 để giao cho một AI khác làm. Owner chưa duyệt: hỏi
owner trước khi bắt đầu P1.

## Prompt để dán cho AI làm

```
Work in /Users/kyphan/ws/app/logi. Read ws/app/AGENTS.md, logi/AGENTS.md,
ws/app/DESIGN.md (sections "Motion" and "Layout") and logi/PLAN-motion.md
first. Implement only phase <P1> from PLAN-motion.md, exactly as written.
Follow "Quy tắc cho mọi phase", "CSS dùng chung" and "Lỗi hay gặp". Run
every command in "Kiểm tra mỗi phase" and fix all failures. Then update the
Motion section in README.md and the "Tiến độ" list, commit only the files
you changed on main (no Co-Authored-By), push, and stop. Tell me in
Vietnamese, in short simple sentences, what changed and how to try it. Do
not start the next phase.
```

Đổi `<P1>` thành phase muốn làm. Mỗi lần chỉ một phase.

## Đọc trước khi làm

1. `ws/app/AGENTS.md` và `logi/AGENTS.md`: không em dash (U+2014), code và
   comment bằng tiếng Anh, chữ trên UI càng ít càng tốt, không ghi
   `Co-Authored-By`. Next.js ở đây là bản 16: đọc docs trong
   `node_modules/next/dist/docs/` nếu đụng tới API của Next.
2. `ws/app/DESIGN.md`, phần **Motion**: giá trị easing, thời lượng, quy tắc.
   Plan này chỉ áp dụng phần đó cho logi.
3. `mora/PLAN-motion.md` và code mora: logi chép lại hệ thống của mora (cùng
   tên class, cùng hook) để hai app cảm giác giống nhau. Không import chéo
   repo, chỉ copy.
4. logi có luật riêng phải giữ:
   - **Start là một chạm.** Không thêm bước xác nhận, không đổi sang giữ.
     Chống bấm nhầm nằm ở `isRealTap()` (`src/lib/tap-guard.ts`) và toast
     `Undo`.
   - **Stop ghi giờ ngay lúc chạm** (`handleStop`, `now/page.tsx`). Hiệu ứng
     không được làm trễ việc gọi `stopActivity`.
   - **Không vuốt ngang trên History.** `DateStrip.tsx:13` ghi rõ vuốt từng
     gây lỗi trang lắc ngang trên iPhone. Đổi ngày chỉ bằng nút.
   - **Màu category** (`CATEGORY_COLOR`, `--cat-*`) giữ nguyên. Không thêm
     màu nào khác.

## Hiện trạng (2026-10-19)

- `src/app/globals.css` chỉ có `sheet-up` (180ms) và `dim-in` (150ms), dùng
  ở `VoiceSheet.tsx` và lớp mờ khi đang nghe giọng nói. Có một khối
  `prefers-reduced-motion` nhỏ chỉ tắt hai class này.
- 10 sheet tự viết, mỗi cái một kiểu, **không có hiệu ứng vào/ra**: bật là
  hiện, tắt là mất.
- Chỉ `RecordSheet.tsx` có kéo xuống để đóng (dòng 96-117, 236-238).
- Chấm "đang chạy" dùng `animate-pulse` của Tailwind (nhấp nháy 2s), trái
  với DESIGN.md.
- Toast hiện và mất đột ngột.
- Không có test component (không có jsdom). Test là `node --test` trên các
  hàm thuần trong `src/lib`. Vì vậy logic của hiệu ứng phải viết thành hàm
  thuần trong `src/lib/motion.ts` để test được.
- Biểu đồ recharts đã tắt animation (`isAnimationActive={false}`). Giữ
  nguyên.

## Quy tắc cho mọi phase

- Theo đúng phần **Motion** trong DESIGN.md: chỉ `opacity` và `transform`,
  reduced motion phải chạy, không vòng lặp gây chú ý, không thư viện mới.
- Ngoại lệ duy nhất cho màu: nút category đổi nền khi bắt đầu chạy đã có
  `transition` (màu nền và viền). Giữ, không thêm transition màu ở chỗ khác.
- Mỗi cử chỉ phải có cách thay thế: bàn phím, hoặc nút/chữ có sẵn.
- Không đổi logic dữ liệu (Firestore, rollover, voice, mora live). Chỉ đổi
  UI. Hàm thuần mới phải có test.
- Không đổi chữ trên UI, trừ khi plan ghi rõ.
- Rung: `navigator.vibrate?.(ms)`. iPhone bỏ qua là đúng.
- Mỗi phase xong: cập nhật phần **Motion** trong `README.md` (tạo mới nếu
  chưa có, ngắn, tiếng Anh), ghi một dòng vào "Tiến độ" cuối file này, rồi
  **hỏi owner trước khi làm phase tiếp theo**.

## Kiểm tra mỗi phase

```bash
cd ws/app/logi
npm run typecheck
npm run lint
npm test
npm run build
```

- Thử thật trên trình duyệt: `npm run dev` (port 3000, có sẵn trong
  `.claude/launch.json`). Cần đăng nhập Google: AI không tự đăng nhập. Nếu
  trình duyệt chưa có phiên đăng nhập thì ghi rõ "chưa thử trên app" và nhờ
  owner thử.
- Kiểm tra màn 375px (giả lập điện thoại) và màn rộng, light và dark, và
  một lần với reduced motion bật (DevTools > Rendering > Emulate CSS
  `prefers-reduced-motion: reduce`).
- Commit: chỉ add đúng đường dẫn đã sửa (`git add <file> ...`, không
  `git add -A`). Kiểm tra `git branch --show-current` là `main` trước khi
  commit (có phiên AI khác có thể đổi branch). Message dạng
  `feat(motion): ...`. Không co-author. Push lên `main` thì Vercel tự deploy.

## Chỗ sửa chính (vị trí ngày 2026-10-19, có thể lệch vài dòng)

| Chỗ | File | Phase |
|---|---|---|
| Khối CSS motion | `src/app/globals.css:210-245` | P1 |
| Chấm đang chạy | `ActiveSessionCard.tsx:54,95`, `CategoryGrid.tsx:169` | P1 |
| Toast | `src/components/Toasts.tsx` | P1 |
| 9 bottom sheet | `RecordSheet`, `StartWhenSheet`, `BedtimeSheet`, `DayBedtimeSheet`, `EventSheet`, `RoutineSheet`, `ExportSheet`, `WeeklyReview`, modal trong `targets/page.tsx:750` | P2 |
| Hộp "Less than a minute" | `now/page.tsx:471` | P2 |
| Danh sách session đang chạy | `now/page.tsx:425-445` | P3 |
| Số đồng hồ | `ActiveSessionCard.tsx:61,122` | P3 |
| Nút category, giữ lâu, thanh tiến độ | `CategoryGrid.tsx:140-215` | P3 |
| Routine checklist | `RoutineChecklist.tsx:80-140` | P4 |
| Tab dưới cùng | `BottomNav.tsx:36-70` | P4 |
| Tabs Review/Plan | `Tabs.tsx:55-80`, `SubTabs.tsx` | P4 |
| Timeline khi đổi ngày | `Timeline.tsx:67-95`, `history/page.tsx:254,271` | P4 |

## CSS dùng chung (thay khối "Sheet sliding up" trong `globals.css`)

Copy từ mora cho giống nhau. Thêm token vào `:root` (một lần, không cần bản
dark):

```css
  --ease-soft: cubic-bezier(0.22, 1, 0.36, 1);
```

Thay toàn bộ khối từ `/* ===== Sheet sliding up` tới hết khối
`prefers-reduced-motion` hiện tại bằng:

```css
/* ---- Motion: short, opacity/transform only (DESIGN.md "Motion") ---- */
@keyframes fade-in {
  from { opacity: 0; }
}
.fade-in,
.dim-in {
  animation: fade-in 180ms ease-out both;
}

@keyframes fade-out {
  to { opacity: 0; }
}
.fade-out {
  animation: fade-out 200ms ease-in both;
}

@keyframes sheet-up {
  from { transform: translateY(16px); opacity: 0; }
}
.sheet-up {
  animation: sheet-up 220ms var(--ease-soft) both;
}

@keyframes sheet-down {
  to { transform: translateY(16px); opacity: 0; }
}
.sheet-down {
  animation: sheet-down 200ms ease-in both;
}

@keyframes rise {
  from { opacity: 0; transform: translateY(6px); }
}
.rise {
  animation: rise 240ms var(--ease-soft) both;
}

@keyframes row-out {
  to { opacity: 0; transform: translateX(8px); }
}
.row-out {
  animation: row-out 180ms ease-in both;
  pointer-events: none;
}

@keyframes pop {
  from { opacity: 0; transform: scale(0.7); }
}
.pop {
  animation: pop 180ms var(--ease-soft) both;
}

/* A slow fade in and out for "running"; never blinks. */
@keyframes breathe {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
.breathe {
  animation: breathe 3.2s ease-in-out infinite;
}

/* P3: one digit rolls up when it changes. */
@keyframes digit-out {
  to { transform: translateY(-40%); opacity: 0; }
}
@keyframes digit-in {
  from { transform: translateY(40%); opacity: 0; }
}
.digit-out {
  animation: digit-out 280ms var(--ease-soft) both;
}
.digit-in {
  animation: digit-in 280ms var(--ease-soft) both;
}

/* P4: a line drawn across a done routine item. */
.strike {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: right;
  transition: transform 180ms ease-in;
}
.strike[data-on='true'] {
  transform: scaleX(1);
  transform-origin: left;
  transition: transform 260ms var(--ease-soft);
}
.strike[data-instant='true'] {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

Khối `prefers-reduced-motion` này phải là khối **cuối cùng** của phần
motion. Class mới thêm sau thì đặt trước nó.

## Lỗi hay gặp (đọc kỹ)

1. **Không có test component.** Đừng cài jsdom hay testing-library. Viết
   logic thành hàm thuần trong `src/lib/motion.ts`, test trong
   `test/motion.test.ts` (giống `test/tap-guard.test.ts`). Phần còn lại thử
   trên trình duyệt.
2. **`matchMedia` không có trong Node.** `reducedMotion()` trả `true` khi
   không có `matchMedia` (giống mora), nên gọi được trong test và lúc
   render phía server.
3. **Hydration.** Trang render trước trên server. Đừng đọc `matchMedia`
   trong thân component lúc render đầu rồi đổi class theo nó (sẽ lỗi
   hydration). Đọc trong `useEffect`, hoặc chỉ đọc lúc sự kiện xảy ra.
4. **iPhone cuộn trang khi kéo.** Phần tử kéo phải có `touch-action: none`.
   Nhưng chỉ đặt trên thanh nắm của sheet, không đặt trên cả sheet (sẽ không
   cuộn được nội dung dài như `RecordSheet`).
5. **`useTap` và `isRealTap`.** Đừng thay chúng. Hiệu ứng nhấn chỉ là CSS
   `active:` hoặc class thêm vào lúc `pointerdown`. Một cú vuốt qua nút vẫn
   không được tính là bấm.
6. **Chữ số nhảy ngang.** Mọi ô số giữ `tabular-nums`.
7. **Không setState mỗi frame.** Kéo sheet: ghi `style.transform` qua ref.
   `RecordSheet` hiện đang `setDragY` mỗi lần `pointermove`; P2 sửa luôn.
8. **Session biến mất ngay khi Stop.** `active` là stream realtime, cache
   offline cập nhật ngay, nên thẻ bị gỡ trước khi kịp chạy hiệu ứng. Phải
   giữ bản sao vài trăm ms (xem P3.1), không được trì hoãn `stopActivity`.
9. **Toast có nút `Undo`.** Toast đang rời đi (`fade-out`) phải
   `pointer-events: none`, để không bấm nhầm Undo của toast đã hết hạn.
10. **`next dev` tự thêm khối vào AGENTS.md.** Nếu `git status` thấy
    AGENTS.md đổi mà không do mình sửa, đọc ghi chú trong chính file đó.
11. **Không em dash.** Kiểm tra trước khi commit (zsh):
    `grep -rn $'\xe2\x80\x94' src test PLAN-motion.md README.md` phải rỗng.

---

## P1 - Nền móng: CSS, hook, chấm đang chạy, toast

### P1.1 CSS và token

File: `src/app/globals.css`.

- Thêm `--ease-soft` và thay khối motion như mục "CSS dùng chung".
- `VoiceSheet.tsx` vẫn dùng `sheet-up`, lớp mờ ở `now/page.tsx:512` vẫn dùng
  `dim-in`: giữ tên, chỉ đổi giá trị. Kiểm tra cả hai vẫn chạy.

### P1.2 Hàm và hook dùng chung

File mới: `src/lib/motion.ts`, `src/hooks/usePresence.ts`,
`src/hooks/useFlip.ts`, `test/motion.test.ts`.

- `src/lib/motion.ts` (hàm thuần, không import React):
  ```ts
  /** Users who ask for less motion, and Node (tests, server render), skip motion. */
  export function reducedMotion(): boolean {
    return typeof matchMedia === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Items that were in `prev` but are gone from `next`, so they can animate out. */
  export function leavingItems<T extends { id: string | number }>(prev: T[], next: T[]): T[];
  ```
  Các hàm của P2, P3 thêm vào file này sau.
- `usePresence.ts`: copy từ `mora/src/hooks/usePresence.ts`, nhưng import
  `reducedMotion` từ `@/lib/motion` (không định nghĩa lại).
- `useFlip.ts`: copy từ `mora/src/hooks/useFlip.ts`, đổi import tương tự.
  Thêm `'use client'` ở đầu cả hai hook.

Test `test/motion.test.ts`:
- `reducedMotion()` trả `true` trong Node.
- `leavingItems`: `[a,b,c]` -> `[a,c]` cho `[b]`; giống nhau cho `[]`;
  thêm mới không tính là rời.

### P1.3 Chấm "đang chạy" thở chậm, không nhấp nháy

File: `ActiveSessionCard.tsx` (2 chỗ), `CategoryGrid.tsx:169`.

- Đổi `animate-pulse` thành `breathe` trên các chấm màu category.
- Khung chờ (skeleton) ở `now/page.tsx:417`, `(main)/layout.tsx:27-29`,
  `reminders/page.tsx:120`, `analytics/page.tsx:231`, `InsightPanel.tsx:138`,
  `WeekSleepCard.tsx:63`: đổi `animate-pulse` thành `breathe` luôn (nhịp
  chậm hơn, đúng DESIGN.md "a dot that slowly fades").
- `MicButton.tsx`: **không** đổi trong phase này (đang ghi âm là trạng thái
  quan trọng, owner quyết sau).

### P1.4 Toast trượt lên và mờ đi

File: `src/components/Toasts.tsx`.

- Toast mới: class `rise`.
- Toast hết hạn hoặc bị đóng: giữ lại 200ms với class `fade-out` và
  `pointer-events-none`, rồi gỡ. Dùng `leavingItems(prevToasts, toasts)` để
  biết toast nào vừa rời; lưu `prev` bằng `useRef`, danh sách đang rời bằng
  state, gỡ bằng `setTimeout(200)`. Reduced motion: gỡ ngay.
- `useToasts` (`useActivities.ts:398`) giữ nguyên, không đổi logic hết hạn.
- Khi nhiều toast, cái rời đi không làm cái còn lại nhảy: bọc danh sách
  bằng `useFlip` (key là `t.id`).

Xong khi: Start một category, toast `Started …` trượt lên, sau 5 giây mờ
đi; bấm `Undo` thì toast mất ngay (đã bấm thì không cần hiệu ứng ra).

---

## P2 - Một khung sheet chung: vào, ra, vuốt xuống

### P2.1 Component `SheetShell`

File mới: `src/components/SheetShell.tsx`. Hàm thuần thêm vào
`src/lib/motion.ts`.

Props:

```ts
type SheetShellProps = {
  onClose?: () => void;       // không có = sheet phải trả lời, không vuốt, không bấm nền để đóng
  labelledBy?: string;        // id của tiêu đề, cho aria-labelledby
  label?: string;             // aria-label khi không có tiêu đề
  center?: boolean;           // md trở lên: ra giữa màn (như hiện nay `md:items-center`)
  z?: 50 | 60;                // giữ đúng z-index cũ của từng sheet
  className?: string;         // class của khung trong (padding, max-h, bg)
  children: ReactNode;
};
```

Hành vi:
- Vào: nền `fade-in`, khung `sheet-up`.
- Ra khi người dùng đóng (bấm nền, vuốt xuống, phím `Esc`): nền `fade-out`,
  khung `sheet-down`, đợi 200ms rồi mới gọi `onClose`. Trong 200ms đó
  `pointer-events: none` trên cả sheet. Reduced motion: gọi `onClose` ngay.
- Các nút bên trong sheet (Save, Cancel, chọn giờ) gọi thẳng prop của sheet
  như cũ, sheet mất ngay. Đây là chủ ý: hành động xong thì toast là phản hồi,
  không cần chờ hiệu ứng. Không làm context để nút bên trong chờ hiệu ứng.
- `Esc` đóng sheet trên cùng (chỉ khi có `onClose`). Nghe `keydown` trên
  `window` trong `useEffect`.
- Giữ nguyên `role="dialog"`, `aria-modal="true"`,
  `overscroll-behavior: contain`, padding `env(safe-area-inset-bottom)`.

Vuốt xuống để đóng (chỉ màn hẹp `matchMedia('(max-width: 767px)')`, đọc lúc
`pointerdown`, và chỉ khi có `onClose`):
- Thanh nắm nhỏ ở đầu khung: rộng 40px, cao 4px, bo tròn,
  `bg-line-strong`, chỉ hiện trên màn hẹp (`md:hidden`). Vùng kéo là thanh
  nắm và tiêu đề (`touch-action: none` chỉ trên vùng này), giống
  `RecordSheet` hiện nay.
- Khi kéo: khung theo ngón tay qua `ref.style.transform`, không setState;
  kéo lên thì cản (`dy * 0.2`). Nền mờ dần theo `1 - dy / height`.
- Thả: đóng nếu `sheetShouldClose(dy, height, velocity)` đúng, nếu không thì
  bật về 0 trong 200ms `var(--ease-soft)`.
- Đóng bằng vuốt: khung trượt tiếp từ chỗ đang đứng xuống
  `translateY(100%)` trong 180ms, rồi gọi `onClose`. Không nhảy về rồi mới
  chạy `sheet-down`.

Hàm thuần (thêm vào `src/lib/motion.ts`):

```ts
/** Close when dragged past a quarter of the sheet, or flicked fast. */
export function sheetShouldClose(dy: number, height: number, velocityPxPerMs: number): boolean {
  return dy > height * 0.25 || velocityPxPerMs > 0.5;
}

/** Dragging up past the top only moves a little. */
export function dragOffset(dy: number): number {
  return dy >= 0 ? dy : dy * 0.2;
}
```

Test thêm vào `test/motion.test.ts`:
- `sheetShouldClose(120, 400, 0)` là `true`; `(40, 400, 0.1)` là `false`;
  `(40, 400, 0.8)` là `true`.
- `dragOffset(-50)` là `-10`; `dragOffset(30)` là `30`.

### P2.2 Chuyển các sheet sang `SheetShell`

Làm từng file, mỗi file thử lại trên trình duyệt:

| File | `onClose` | Ghi chú |
|---|---|---|
| `RecordSheet.tsx` | có | Xoá code kéo cũ (dòng 96-117 và style 236-238). Dùng vùng kéo của `SheetShell`. |
| `StartWhenSheet.tsx` | có | |
| `BedtimeSheet.tsx` | có | |
| `DayBedtimeSheet.tsx` | có | |
| `EventSheet.tsx` | có | `center` |
| `RoutineSheet.tsx` | có | `center` |
| `ExportSheet.tsx` | có | `center` (đang `sm:items-center`, đổi sang `md` cho đồng bộ là được) |
| `WeeklyReview.tsx` | có | `center`, nền đang `bg-black/30`: giữ độ mờ cũ qua prop hoặc class |
| modal trong `targets/page.tsx:750` | có | |
| hộp "Less than a minute" `now/page.tsx:471` | **không** | phải chọn Discard hoặc Save |

**Không** chuyển:
- `StaleSessionModal.tsx`: phải xử lý session cũ, không cho đóng ngang. Chỉ
  thêm `fade-in` cho nền và `pop` cho hộp (hộp ở giữa màn).
- `VoiceSheet.tsx`: không có nền tối, đã có `sheet-up`. Giữ nguyên.

Xong khi: mọi sheet trượt lên khi mở; bấm nền hoặc vuốt xuống thì trượt
xuống; trong `RecordSheet` nội dung dài vẫn cuộn được; gõ trong ô input
không làm sheet bị kéo.

---

## P3 - Màn Now: bắt đầu, dừng, đồng hồ

### P3.1 Thẻ session vào và ra

File: `now/page.tsx` (khối `Running sessions`, dòng 425-445),
`ActiveSessionCard.tsx`.

- Session mới (Start, hoặc mora bắt đầu qua live link): thẻ vào bằng
  `rise`. Chỉ khi thêm lúc đang xem; lần tải trang đầu thì thẻ hiện sẵn,
  không chạy hiệu ứng (DESIGN.md Motion, quy tắc 8). Cách làm: một
  `useRef(false)` thành `true` sau lần `activeLoading` đầu tiên chuyển về
  `false`; chỉ id mới xuất hiện sau đó mới có `rise`.
- Session bị dừng: thẻ ở lại 180ms với `row-out`, rồi gỡ. Dùng
  `leavingItems(prevActive, active)`, render thẻ rời đi với `busy` và không
  có `onEdit`, `onStop` (không bấm được). Reduced motion: gỡ ngay.
- Các phần bên dưới (dòng "running in parallel", `CategoryGrid`,
  `RoutineChecklist`) trượt lên thay vì nhảy: dùng `useFlip` với các key
  `session:<id>`, `parallel`, `grid`, `routine`. Không animate `height`.
- Khi số session đổi qua mốc `COMPACT_FROM` (3), thẻ đổi sang dạng gọn: đổi
  ngay, không cần hiệu ứng riêng.
- `handleStop` và `commitStop` không đổi.

### P3.2 Số phút và giờ lăn

File mới: `src/components/RollingDigits.tsx`. Dùng ở
`ActiveSessionCard.tsx:61` và `:122` thay cho `{hms(elapsed)}`.

- Chép ý từ `mora/src/ui/RollingDigits.tsx`: mỗi chữ số một ô, chỉ ô đổi mới
  lăn (`digit-out` / `digit-in`).
- Chỉ phần **giờ và phút** lăn. Giây đổi thẳng, không lăn.
- Đầu ra cho trình đọc màn hình: cả chuỗi trong một `span` `sr-only` (hoặc
  `aria-label`), các ô chữ số `aria-hidden`.
- Giữ `tabular-nums`, giữ cỡ chữ cũ (`text-3xl`, dạng gọn `text-sm`).
- Lần render đầu không lăn.
- Reduced motion: đổi ngay.
- Hàm thuần thêm vào `src/lib/motion.ts`:
  ```ts
  /** Indexes of characters that differ, for two strings of the same shape. */
  export function changedDigits(prev: string, next: string): number[];
  ```
  Test: `changedDigits('1:59:59', '2:00:00')` là `[0, 2, 3, 5, 6]`;
  `('0:24:10', '0:24:11')` là `[6]`; độ dài khác nhau thì trả mọi vị trí
  của chuỗi mới.

### P3.3 Nút category: giữ lâu thấy được, thanh tiến độ đầy dần

File: `CategoryGrid.tsx`.

Giữ lâu (500ms, `LONG_PRESS_MS`) hiện không có dấu hiệu gì cho tới khi sheet
bật. Thêm:
- Lúc `pointerdown`: thêm class làm nút thu nhỏ chậm tới `scale(0.96)` trong
  500ms `linear` (`transition: transform 500ms linear`). Thả sớm hoặc vuốt
  (`pressMove` vượt `MOVE_LIMIT_PX`): bỏ class, nút về `scale(1)` trong
  120ms. Lưu trạng thái này bằng `data-pressing` trên nút (set qua ref,
  không setState) để không render lại cả lưới.
- Đủ 500ms: rung `navigator.vibrate?.(10)`, nút về `scale(1)`, sheet mở như
  cũ.
- Chạm nhanh (Start) giữ đúng như cũ: `active:scale-[0.98]`.
- Reduced motion: không thu nhỏ, chỉ rung và mở sheet.

Thanh tiến độ 3px ở đáy nút (dòng ~195-215):
- Đổi `width: fill%` sang `transform: scaleX(fill)` với
  `transform-origin: left` trên một span `inset-y-0 left-0 w-full`.
- `transition: transform 600ms var(--ease-soft)`: khi giờ hôm nay tăng (mỗi
  phút một lần), thanh đầy dần thay vì nhảy.
- Lần đầu mở app: thanh đầy từ 0 lên một lần. Không lặp lại khi chuyển tab
  rồi quay lại trong cùng phiên (lưu cờ ở biến module).
- Phần "over" màu ink giữ nguyên, không animate.

Xong khi: Start rồi Stop một category trên điện thoại, thẻ vào và ra mượt,
lưới bên dưới không nhảy; số phút lăn, giây không lăn; giữ một nút thấy nó
lún dần rồi sheet mở.

---

## P4 - Danh sách và điều hướng

### P4.1 Routine: tick có gạch dần

File: `RoutineChecklist.tsx`.

- Bỏ `line-through` (dòng 134). Thay bằng span `.strike` bên trong span tên
  (span tên thêm `relative`), `data-on={on}`. Chữ vẫn chuyển `text-ink-muted`.
- Dấu tick trong ô: class `pop` khi vừa tick.
- Lần render đầu (mở Now khi đã tick sẵn): gạch hiện sẵn, không chạy
  (`data-instant="true"` cho tới sau lần render đầu).
- Khi cả nhóm xong (`done === items.length`), số `n/n` chạy `pop` một lần.
- Không đổi logic chống bấm nhầm (`pressStart`, `press`).

### P4.2 Vạch tab trượt theo

File: `BottomNav.tsx`, `Tabs.tsx`, `SubTabs.tsx`.

- `BottomNav` (màn hẹp): hiện mỗi tab có một vạch riêng (dòng ~60-68). Đổi
  thành **một** vạch chung đặt trong `nav`, vị trí bằng
  `transform: translateX(index * 100%)` trên một lớp bọc rộng `1/3`, vạch
  `w-10` nằm giữa lớp bọc. `transition: transform 260ms var(--ease-soft)`.
  `md` (sidebar) giữ nguyên, không có vạch.
- `Tabs.tsx` và `SubTabs.tsx`: nền `bg-surface-2` của tab đang chọn thành một
  khối chung trượt theo bằng `translateX`, cùng thời lượng. Chữ đổi
  `font-medium` ngay. Đo vị trí bằng `offsetLeft` / `offsetWidth` của tab
  đang chọn trong `useLayoutEffect`, ghi qua ref.
- Lần render đầu: vạch/khối đứng sẵn đúng chỗ, không trượt từ 0.
- Phím mũi tên trong `Tabs` vẫn chạy như cũ.

### P4.3 Timeline hiện dần khi đổi ngày

File: `Timeline.tsx`, `history/page.tsx`.

- Khi đổi ngày bằng `DateStrip` (nút hoặc chọn ngày): các hàng của timeline
  chạy `rise`, mỗi hàng trễ thêm 20ms, tối đa 8 hàng (hàng thứ 9 trở đi trễ
  bằng hàng 8). Dùng `style={{ animationDelay }}`.
- Cách bật lại hiệu ứng: đặt `key={selected}` lên lớp bọc Timeline ở
  `history/page.tsx:271`. Lần mở History đầu tiên không chạy.
- Khi dữ liệu realtime cập nhật trong cùng một ngày (sửa một record): không
  chạy lại.
- **Không** thêm vuốt ngang để đổi ngày (xem "Đọc trước khi làm").

Xong khi: đổi tab dưới thấy vạch trượt; đổi tab trong Review/Plan thấy khối
nền trượt; bấm ngày khác ở History thấy các khối hiện dần trong khoảng
200ms.

---

## Không làm (ghi lại để AI sau khỏi đề xuất lại)

- **Giữ để dừng** như mora: logi ghi giờ dừng lúc chạm, và luật "một chạm"
  áp cho cả Start lẫn Stop. Chỉ làm nếu owner yêu cầu.
- **Vuốt thẻ session để dừng**: dễ bấm nhầm khi cuộn, trái với
  `isRealTap`.
- **Vuốt ngang trên History**: từng gây lỗi trang lắc ngang trên iPhone.
- **Animation cho biểu đồ recharts**: đã tắt có chủ ý.
- **View Transitions giữa các trang**: để sau, khi P1-P4 ổn.

## Tiến độ

(AI làm ghi một dòng mỗi phase: ngày, commit, ghi chú.)

- P1 (2026-10-19): motion CSS block + `--ease-soft`, `src/lib/motion.ts`, `usePresence`, `useFlip`, `breathe` for running dots and skeletons, toast rise/fade-out. Test `motion`. `usePresence` sets state during render (React 19 lint forbids setState in effects). Not tried in the app yet (needs Google sign-in).
- P2 (2026-10-19): `SheetShell` for 9 sheets + the zero-stop box, `sheetShouldClose`/`dragOffset` + tests, StaleSessionModal fade/pop. Added props beyond the plan: `header` (drag zone), `dim`, `locked`. EventSheet, RoutineSheet, WeeklyReview and the targets modal can now close by backdrop/swipe/Esc. Tested in a temporary local page (slow drag springs back, long drag slides out, backdrop and Esc animate out, no swipe on desktop); real sheets not tried (needs Google sign-in).
- P3 (2026-10-19): Now cards rise/row-out + `useFlip`, `RollingDigits` + `changedDigits` tests, tile long-press sink + vibrate, strip `scaleX`. Stopped cards render in a separate `StoppedCards` component: mapping them inside the page with handlers made the React Compiler lint report `Date.now` in `handleStop` as called during render. Rolling digits, tiles and strips checked on a temporary local page; the Now card flow not tried (needs Google sign-in).
- P4 (2026-10-19): routine strike + pop, sliding markers via `useIndicator` (BottomNav, Tabs, SubTabs), timeline rise on day change. `useIndicator` skips the ResizeObserver first report (it would cancel the slide) and compares keys so Strict Mode does not slide on mount. Routine, Tabs and Timeline checked on a temporary local page; BottomNav and SubTabs not tried (need sign-in and real routes).
