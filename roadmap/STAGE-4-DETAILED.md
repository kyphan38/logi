# STAGE 4 - Targets & Balance

> Plan này viết cho một AI coding agent thực thi. Làm đúng thứ tự task.
> Sau mỗi task có mục **Verify** - phải pass mới đi tiếp.
> Nếu gặp mâu thuẫn hoặc thiếu thông tin, **DỪNG và hỏi người dùng**, không tự đoán.

---

## 0. Bối cảnh

Stage 3 đã xong: voice → `/api/parse` → confirmation card → ghi qua `activities.ts`.
Clarify, voice edit, delayed start đều chạy.

Stage 4 biến dữ liệu thô thành **đánh giá cân bằng**, kèm cơ chế chống tự lừa mình.
Đây là stage làm cho app có ý nghĩa - không có nó thì app chỉ là sổ ghi chép.

Toàn bộ công thức đã có sẵn trong `src/lib/balance.ts` và đã được kiểm chứng.
**Agent không viết lại công thức nào.** Việc của Stage 4 là ghép chúng vào UI và
Firestore cho đúng.

### KHÔNG làm ở Stage 4
- Chart, heatmap, export (Stage 5)
- Push notification, PWA (Stage 6)
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts`

---

## PHẦN A - Carry-over

### A1 - Kiểm thử voice (chưa xong)
Stage 3 Task 9 chưa chạy: 10 câu voice + 20 mục kiểm tra trên iPhone.

Không chặn Stage 4, nhưng phải làm sớm. Nếu có câu sai, chỉ chỉnh
`buildSystemPrompt()` trong `gemini-parse.ts` - **không đổi model**.

Đây là ngoại lệ duy nhất được phép sửa `gemini-parse.ts`: nội dung prompt, không
phải schema hay logic.

### A2 - Câu hỏi còn treo
Báo cáo Phần A của Stage 3 kết thúc bằng *"Có một chỗ mình cần bạn quyết trước khi
làm Phần B"* nhưng câu hỏi bị mất. Agent xác nhận lại: còn quyết định nào chưa được
duyệt không?

---

## PHẦN B - Targets

### Task 1 - Repository cho target & debt

Tạo `src/lib/targets.ts`.

Đường dẫn Firestore:
- `users/{uid}/weekTargets/{week}` - VD `2026-W35`
- `users/{uid}/meta/debt`
- `users/{uid}/meta/rollover`

```ts
getWeekTarget(uid, week): Promise<WeekTarget | null>
ensureWeekTarget(uid, week): Promise<WeekTarget>   // tạo nếu chưa có
setPreset(uid, week, presetId): Promise<void>
setCustomTargets(uid, week, weekly): Promise<void>
lockWeek(uid, week): Promise<void>
listRecentWeekTargets(uid, n = 6): Promise<WeekTarget[]>

getDebt(uid): Promise<DebtLedger>
subscribeWeekTarget(uid, week, cb): Unsubscribe
runRollover(uid, now): Promise<{ processed: string[] }>
```

Type `WeekTarget` và `DebtLedger` đã có trong `logi.ts`. Không định nghĩa lại.

#### `ensureWeekTarget`
Chưa có doc cho tuần này:
1. Đọc `meta/debt`
2. `applyDebt(PRESETS.normal.weekly, debt)` → target + `applied`
3. Ghi doc mới: `preset: 'normal'`, `weekly`, `debtApplied: applied`,
   `lateChange: false`, `lockedAt: null`
4. Cập nhật `meta/debt` với phần nợ còn lại

#### `setPreset` / `setCustomTargets`
- Doc đã `lockedAt != null` → throw `"This week is closed"` (rules cũng chặn)
- Chạy `validateTargets()` trước khi ghi; không hợp lệ → throw kèm lỗi cụ thể
- Nếu hôm nay là thứ Sáu, thứ Bảy hoặc Chủ nhật → set `lateChange: true`
- `setPreset` vẫn phải chạy `applyDebt()` lên preset đã chọn

**Verify**: tạo target tuần, thử ghi khi `lockedAt` khác null → bị từ chối cả ở
client lẫn rules.

---

### Task 2 - Rollover - PHẦN QUAN TRỌNG NHẤT STAGE NÀY

Không có server cron. Việc chuyển tuần chạy ở client lúc mở app. Vì vậy nó
**bắt buộc phải idempotent**.

Mở app hai lần sáng thứ Hai mà không chặn → nợ cộng đôi. Đây là lỗi âm thầm:
không crash, không báo gì, chỉ là target Learn phình lên vô lý sau vài tuần và
không lần ra nguyên nhân.

#### Cột mốc
`users/{uid}/meta/rollover` = `{ lastProcessedWeek: string, updatedAt: number }`

#### Thuật toán
```
currentWeek = logicalWeek(now)
last = meta/rollover.lastProcessedWeek

nếu last == null:
   ghi last = currentWeek, KHÔNG tính nợ (lần chạy đầu tiên)
   dừng

nếu last == currentWeek:
   không làm gì

ngược lại:
   với mỗi tuần w từ (last + 1) tới currentWeek, theo đúng thứ tự:
      wt = getWeekTarget(uid, w - 1)
      nếu wt tồn tại:
         lockWeek(uid, w - 1)              // đóng sổ hồi tố
         debt = accrueDebt(wt.weekly, debt) // ghi nợ phần đã cắt so với baseline
      ensureWeekTarget(uid, w)              // tự chạy applyDebt
   ghi last = currentWeek
```

#### Bắt buộc dùng transaction
Toàn bộ khối trên chạy trong `runTransaction()`:
- Đọc `meta/rollover` **trong** transaction
- Kiểm tra lại `lastProcessedWeek` vẫn còn cũ
- Ghi `meta/debt`, `weekTargets/*`, `meta/rollover` cùng lúc

Bạn dùng cả điện thoại lẫn laptop. Không có transaction thì mở app trên hai máy
gần nhau là chạy rollover hai lần.

#### Bỏ app nhiều tuần
Nghỉ 3 tuần không mở app → phải xử lý **từng tuần một theo thứ tự**, không nhảy
thẳng. Tuần nào không có `weekTarget` (không dùng app) thì bỏ qua, không ghi nợ -
không có kế hoạch thì không có gì để nợ.

Giới hạn: xử lý tối đa 8 tuần lùi lại. Xa hơn thì chỉ set cột mốc và bỏ qua.

#### `accrueDebt` tính gì
Đọc kỹ `balance.ts`: nợ = `BASELINE_WEEKLY - weekly` (phần **cắt khỏi kế hoạch**),
không phải `target - actual` (phần chưa làm được).

Đây là chủ ý. Nợ đo việc bạn **chủ động hạ chuẩn**, không phải việc bạn không đạt
mục tiêu. Không đạt là chuyện bình thường; hạ chuẩn mới là thứ cần trả giá.
Agent không được đổi cách tính này.

#### Gọi khi nào
- Màn hình Now mount
- App quay lại foreground
- Không cần interval - tuần không đổi giữa chừng

**Verify**: viết test cho hàm rollover thuần (tách phần logic khỏi Firestore như
Task 8 Stage 3 đã làm với `applyVoice`). Ca bắt buộc:
- Chạy hai lần liên tiếp → nợ chỉ cộng một lần
- Nhảy 3 tuần → xử lý đúng 3 tuần theo thứ tự
- Lần chạy đầu tiên → không ghi nợ
- Tuần thiếu `weekTarget` → bỏ qua

---

### Task 3 - Màn hình Targets

Thêm tab thứ 4 vào bottom nav: **Now · History · Targets · Analytics**.
(Analytics vẫn là placeholder tới Stage 5.)

`src/app/(main)/targets/page.tsx`

#### Phần 1 - Preset
4 card xếp dọc, card đang chọn có viền đậm:

```
┌──────────────────────────────┐
│ Normal            ✓          │
│ Tuần tiêu chuẩn              │
│ W43 · L31 · F9 · Le6         │
└──────────────────────────────┘
```

Nợ > 20h (`DEBT_LOCK_THRESHOLD`) → card **Crunch** bị khoá, hiện lý do:
`"Locked - 24h of debt outstanding"`.

Chọn preset → confirm sheet hiện rõ thay đổi:
```
Switching to Crunch

Learn   31h → 19h   (+12h debt)
Fitness  9h →  6h   (+3h debt)
Work    43h → 57h
Leisure  6h →  7h

[ Cancel ]   [ Switch ]
```

Phải hiện phần nợ phát sinh. Đổi preset mà không thấy giá phải trả thì cơ chế
chống tự lừa mình vô nghĩa.

#### Phần 2 - Tuỳ chỉnh
5 slider. **Sleep khoá cứng**, hiện dạng readonly `46.5h - fixed`.

Kéo một slider:
1. Gọi `rebalance(weekly, category, newValue)`
2. Các category khác tự trừ/bù, hiển thị đổi theo thời gian thực
3. Chạy `validateTargets()`, hiện lỗi ngay dưới nếu có
4. Không hợp lệ → disable nút Save

Slider chạm sàn (`HARD_FLOOR`) → thanh đổi màu đỏ nhạt + nhãn `"floor"`.
Không cho kéo xuống dưới.

Dưới cùng hiện tổng: `135.5 / 135.5h ✓` - cho thấy rõ đây là ngân sách zero-sum,
không thêm được, chỉ đổi chỗ.

#### Phần 3 - Nợ
```
Debt
Learn    12.0h      (6.0h applied this week)
Fitness   3.0h      (1.5h applied this week)
```
Không nợ gì → ẩn hẳn phần này.

#### Phần 4 - Streak
`crunchStreak(listRecentWeekTargets(6))` trả `shouldPrompt: true` →
```
Crunch: 4 of the last 6 weeks.

Đặt lại baseline theo thực tế, hay đây là vấn đề cần xử lý?
[ Reset baseline ]   [ Keep as is ]
```

"Reset baseline" ở Stage 4 chỉ cần: đặt preset tuần này thành Crunch và xoá nợ
tương ứng. Không sửa `BASELINE_DAILY` trong `logi.ts`.

#### Tuần đã khoá
`lockedAt != null` → toàn bộ readonly, banner `"This week is closed."`

---

### Task 4 - Khoá tuần

21:00 Chủ nhật (giờ logic) → `lockWeek()`.

Không có cron, nên khoá **lười**: kiểm tra khi mở app, nếu tuần đang xem đã qua
mốc 21:00 CN thì khoá. Rollover ở Task 2 cũng khoá hồi tố tuần trước.

`firestore.rules` đã chặn update khi `lockedAt != null` - không cần sửa rules.

Sửa target vào thứ Sáu, thứ Bảy hoặc Chủ nhật → `lateChange: true`.
Stage 5 sẽ dùng cờ này để gắn dấu ⚠ trên chart. Stage 4 chỉ cần ghi đúng.

---

### Task 5 - Balance banner

`src/components/BalanceBanner.tsx`, đặt ở màn hình Now, dưới các session đang chạy.

```ts
const devs = deviations(weekActivities, weekTarget.weekly, now);
const conflict = weekendConflict(weekActivities, weekTarget.weekly, now);
```

#### Quy tắc hiển thị
- `conflict != null` → ưu tiên cao nhất, hiện nó
- Ngược lại, lấy deviation có `|deltaHours|` lớn nhất trong nhóm `flag != 'ok'`
- Không có gì → **ẩn hẳn banner**, không hiện "you're on track"

**Tối đa một dòng.** Nhiều dòng cảnh báo cùng lúc là cách nhanh nhất khiến người
dùng bỏ qua tất cả.

#### Câu chữ
Dùng `formatDeviation()` đã có sẵn. Nêu số, không dạy đời:

Đúng: `Work: 46.2h / 40.1h (+15%)`
Sai: `Bạn đang làm việc quá nhiều rồi`

Màu: vượt → hổ phách, thiếu → xanh dương nhạt. **Không dùng đỏ** - đỏ dành cho lỗi
hệ thống, không dành cho hành vi của người dùng.

Tap banner → sang màn hình Targets.

#### Lấy dữ liệu tuần
Thêm `useWeekActivities(logicalWeek)` vào `useActivities.ts`, query theo
`logicalWeek` (index đã có từ Stage 1).

#### Chỗ dễ sai nhất
`deviations()` gọi `expectedHours()` - hàm này pro-rate **theo lịch**, cộng dồn
target của từng ngày đã qua.

**Tuyệt đối không** tự tính `weekly × ngày/7`. Đã kiểm chứng: thứ Tư 20:41, Work
expected là 23.1h theo lịch nhưng 18.4h nếu chia đều. Lệch gần 5h - đủ để app báo
động sai mỗi thứ Tư và bạn mất tin tưởng vào nó.

**Verify**: seed một tuần dữ liệu giả, đối chiếu số trên banner với kết quả gọi
trực tiếp `deviations()` trong test.

---

### Task 6 - Nhắc trong app

`src/components/ReminderBanner.tsx` + `src/hooks/useReminders.ts`

**Không dùng push notification.** Chỉ hiện khi app đang mở.

#### Ba nhắc
| Giờ | Điều kiện | Nội dung |
|---|---|---|
| 06:15 | Chưa có Learn trong ngày logic hôm nay | `Morning study not logged yet.` + `[Start Learn]` |
| 20:45 | Chưa có Learn sau 19:00 hôm nay | `Evening study not logged yet. Learn: 14h / 31h this week.` |
| CN 19:00 | Luôn hiện | Tổng kết tuần + dòng lệch lớn nhất |

#### Cơ chế
- Kiểm tra lúc mount, lúc quay lại foreground, và mỗi 60 giây
- Chỉ hiện khi đã qua mốc giờ **và** điều kiện đúng
- Dismiss → không hiện lại **trong ngày logic đó**
- Lưu dismiss trong `localStorage` với key `reminder:{type}:{logicalDate}`
  (mỗi thiết bị riêng - chấp nhận được, đỡ tốn write Firestore)
- Tối đa **một** reminder cùng lúc. Đụng Balance banner thì reminder thắng
  (nó có hành động cụ thể hơn).

#### Nút hành động
`[Start Learn]` gọi thẳng `startActivity()`, không mở sheet. Nhắc mà còn phải thao
tác nhiều bước thì không ai dùng.

---

### Task 7 - Test

Thêm vào bộ `node --test`:

`test/rollover.test.ts` - phần logic thuần, bơm repo giả:
- chạy hai lần → nợ cộng một lần
- nhảy 3 tuần → xử lý đúng thứ tự
- lần đầu → không ghi nợ
- tuần thiếu weekTarget → bỏ qua
- quá 8 tuần → chỉ set cột mốc

`test/targets.test.ts`:
- `setPreset` trên tuần đã khoá → throw
- sửa thứ Sáu → `lateChange: true`; sửa thứ Ba → `false`
- `rebalance` chạm sàn → không xuống dưới `HARD_FLOOR`
- `validateTargets` bắt được vượt/thiếu ngân sách

`test/banner.test.ts`:
- chọn đúng deviation lớn nhất
- `weekendConflict` thắng deviation thường
- tất cả `ok` → không hiện gì

Tách logic thuần khỏi Firestore như Stage 3 đã làm với `voice-plan.ts`.

---

### Task 8 - Kiểm thử tay

| # | Làm | Mong đợi |
|---|---|---|
| 1 | Mở Targets lần đầu | Tự tạo tuần hiện tại, preset Normal, tổng 135.5h |
| 2 | Kéo Work lên 51h | Learn/Fitness/Leisure tự giảm, tổng vẫn 135.5 |
| 3 | Kéo Fitness xuống 3h | Dừng ở 4.5h, hiện nhãn "floor" |
| 4 | Đổi sang Crunch | Sheet hiện rõ phần nợ phát sinh |
| 5 | Sửa `meta/rollover` lùi 1 tuần trong Console, mở app | Nợ được ghi, tuần trước bị khoá |
| 6 | Mở app lại ngay | Nợ **không** cộng thêm lần nữa |
| 7 | Mở app trên 2 thiết bị cùng lúc sau khi lùi cột mốc | Nợ vẫn chỉ cộng một lần |
| 8 | Sửa `meta/debt` thành Learn 25h | Card Crunch bị khoá, có lý do |
| 9 | Log Work nhiều lên | Banner hiện, số khớp với test |
| 10 | Log đúng kế hoạch | Banner ẩn hẳn |
| 11 | Log OT thứ Bảy | `weekendConflict` hiện thay deviation thường |
| 12 | Sửa target vào thứ Sáu | `lateChange: true` trong Console |
| 13 | Sửa giờ máy sang 21:30 CN, mở app | Tuần bị khoá, Targets readonly |
| 14 | Sau 20:45 chưa log Learn | Reminder hiện, `[Start Learn]` chạy |
| 15 | Dismiss reminder, mở lại app | Không hiện lại trong ngày |

Test 6 và 7 là hai bài quan trọng nhất - chúng chứng minh rollover idempotent.

---

## Definition of Done - Stage 4

- [ ] A1: 10 câu voice + 20 mục Stage 3 đã test trên iPhone
- [ ] A2: câu hỏi treo của agent đã được trả lời
- [ ] Rollover idempotent, có transaction, có test chứng minh
- [ ] Ngân sách zero-sum 135.5h được ép ở UI
- [ ] Sàn cứng sleep 42h / fitness 4.5h không kéo xuống dưới được
- [ ] Đổi preset hiện rõ nợ phát sinh
- [ ] Nợ > 20h khoá Crunch
- [ ] Tuần khoá lúc 21:00 CN, readonly sau đó
- [ ] `lateChange` ghi đúng
- [ ] Banner dùng `expectedHours()`, không chia đều
- [ ] Banner tối đa một dòng, ẩn khi mọi thứ ổn
- [ ] Ba reminder chạy, dismiss được, không lặp trong ngày
- [ ] `npm test` xanh, typecheck sạch, build OK
- [ ] 15/15 mục Task 8 pass

---

## Báo cáo khi xong

1. File mới/sửa
2. Kết quả 15 mục kiểm thử
3. Ảnh chụp màn hình Targets và banner trên mobile
4. Số test mới thêm
5. Chỗ nào lệch so với plan, kèm lý do

---

## Quy tắc cho agent

**Dừng và hỏi khi:**
- Rollover cần xử lý một trường hợp không có trong plan
- `validateTargets` từ chối một cấu hình mà bạn nghĩ là hợp lệ

**Không được:**
- Chạy rollover mà không có transaction và cột mốc
- Đổi cách tính `accrueDebt` (nợ = phần cắt khỏi baseline, không phải phần chưa đạt)
- Tự tính expected bằng `weekly × ngày/7`
- Cho tổng target vượt 135.5h
- Cho kéo xuống dưới `HARD_FLOOR`
- Hiện nhiều dòng cảnh báo cùng lúc
- Dùng màu đỏ cho deviation
- Dùng push notification
- Sửa `logi.ts` / `balance.ts` (và `gemini-parse.ts`, trừ nội dung prompt)
- Làm sớm chart của Stage 5
