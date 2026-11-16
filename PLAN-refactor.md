# PLAN-refactor (logi)

Trạng thái: Phase 1-4 xong (2026-11-16, branch `refactor/pages`). Test 657/657 (thêm 8), build OK. Chưa thử bằng tay (logi không có emulator, cần đăng nhập thật).

Kết quả:
| File | Trước | Sau |
|---|---|---|
| targets/page.tsx | 796 | 315 |
| now/page.tsx | 753 | 467 |
| history/page.tsx | 463 | 310 |
| hooks/useActivities.ts | 412 | 295 |

Mới: `components/targets/` (7), `components/now/StoppedCards`, `components/history/` (2), `hooks/useTargetsDraft`, `useNowActions`, `useLeavingCards`, `useTick`, `useOnForeground`, `useOnline`, `useToasts`, `lib/targets-view`, `lib/record-defaults`, `prettyDay` trong `lib/datetime`.
Các trang vẫn trên mục tiêu 200-300 dòng: phần còn lại chủ yếu là JSX bố cục. Chỉ tách thêm khi sắp sửa trang đó.

Mục tiêu: làm gọn 3 trang to và 1 hook "ôm nhiều việc". Phần `lib/` đã tốt, giữ nguyên.

Không đổi tính năng. Không đổi giao diện.

## Nguyên tắc chung

- Mỗi phase là một commit. Hỏi owner trước khi bắt đầu phase mới.
- Trước và sau mỗi phase: `npm test` (45 file test), `npm run build`. Số test pass phải giống nhau.
- Chỉ di chuyển code. Không đổi logic, text UI, motion.
- File mới nên dưới khoảng 300 dòng.

## Hiện trạng

| File | Dòng | Vấn đề |
|---|---|---|
| `app/(main)/(plan)/targets/page.tsx` | 796 | 7 component con nằm chung trong file trang |
| `app/(main)/now/page.tsx` | 753 | nhiều `useMemo` + state animation + JSX dài |
| `app/(main)/(review)/history/page.tsx` | 463 | component gauge nằm trong file trang |
| `hooks/useActivities.ts` | 412 | lẫn hook chung (`useTick`, `useOnline`, `useToasts`) với hook activity |

`lib/` có khoảng 60 file phẳng, mỗi file một việc. Không cần gom thư mục.

## Phase 1: trang Targets

1. Chuyển các component con sang `src/components/targets/`:
   `ModeCard`, `PinButton`, `Slider`, `TotalRow`, `DebtSection`, `StreakPrompt`, `ConfirmSheet`.
2. Chuyển state soạn thảo (`draft`, `pinned`, `customPicked`, `keepStreak`, `check`, `guard`) sang `src/hooks/useTargetsDraft.ts`.
3. Hàm nhỏ `h`, `summary` chuyển sang `lib/targets.ts` (hoặc `lib/range-table.ts` nếu hợp hơn) + unit test cho `summary`.

Mục tiêu: `targets/page.tsx` dưới 200 dòng.

## Phase 2: trang Now

1. Chuyển phần tính toán sang hook `src/hooks/useNowView.ts`: `balanceLine`, `overlap`, `running`, `tiles`, `trackedMs`, `routineToday`, `routineRunning`, `nextDue`, `stale`.
2. Chuyển state animation (`ready`, `prevActive`, `leaving`, `risen`) sang `src/hooks/useLeavingCards.ts`.
3. Chuyển `StoppedCards` và các khối JSX lớn (thẻ đang chạy, thanh bedtime, khu routine) sang `src/components/now/`.
4. `prettyLogicalDate` dùng ở cả Now và History (`prettyDate`): gom về `lib/datetime.ts` nếu hai hàm giống nhau.

Mục tiêu: `now/page.tsx` dưới 250 dòng.

## Phase 3: trang History

1. Chuyển `SummaryGauge`, `Gauge`, `gaugeNote`, `hours` sang `src/components/history/`.
2. `newRecordDefaults` chuyển sang `lib/` + unit test.

Mục tiêu: `history/page.tsx` dưới 300 dòng.

## Phase 4: tách `useActivities.ts`

1. Chuyển hook chung ra file riêng:
   - `useTick`, `useElapsed` → `hooks/useTick.ts`
   - `useOnForeground` → `hooks/useOnForeground.ts`
   - `useOnline` → `hooks/useOnline.ts`
   - `useToasts` → `hooks/useToasts.ts`
2. Sửa import ở các trang. Không giữ re-export cũ lâu (làm trong cùng commit).
3. `useActivities.ts` chỉ còn các hook đọc activity (active, scheduled, day, week, recent dates).

## Rủi ro

- Trang Now có motion theo DESIGN.md (thẻ rời đi, thẻ nổi lên). Sau Phase 2, kiểm tra bằng mắt trên điện thoại: start, stop, zero-stop.
- `useTick` được dùng ở nhiều nơi. Đổi import bằng tìm kiếm toàn repo, rồi build.
