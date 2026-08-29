# AMENDMENT — Gỡ bỏ Sleep tracking + fix Analytics

> Thay đổi lớn. Đọc **toàn bộ** file trước khi sửa dòng code đầu tiên.
>
> File này **cho phép sửa `logi.ts`** — ngoại lệ duy nhất so với mọi plan trước.
>
> Thay thế phần lớn `AMENDMENT-sleep-boundary.md`. Xem mục 9 để biết phần nào còn
> giữ lại.

---

## 0. Dữ liệu Sleep cũ — XOÁ, nhưng export trước

Người dùng đã quyết: **xoá hẳn** record `category === 'sleep'` khỏi Firestore.

### Trình tự bắt buộc — không được đảo thứ tự

1. Chạy **Export all-time JSON** (chức năng của Stage 5), tải file về máy
2. **Người dùng xác nhận** đã mở được file và thấy dữ liệu sleep trong đó
3. Chạy script đếm: in ra số record `sleep` sẽ bị xoá, khoảng thời gian sớm nhất
   và muộn nhất. **Đọc cho người dùng xem, chờ xác nhận.**
4. Xoá theo lô, **chỉ** `category === 'sleep'`, không điều kiện nào khác
5. Đếm lại, xác nhận về 0

Lý do làm ba bước xác nhận: xoá bằng script rất dễ quét trúng nhiều hơn dự định, và
lúc đó không có đường lùi.

### Không được
- Xoá trước khi export và người dùng xác nhận đã có file
- Dùng điều kiện xoá rộng hơn `category === 'sleep'`
- Xoá `weekTargets` hay `meta/*` — chúng không chứa dữ liệu sleep riêng

---

## 1. Phạm vi

Bỏ hoàn toàn category `sleep` khỏi ứng dụng.

Còn lại **4 category**: `learn` · `work` · `fitness` · `leisure`

Đồng thời sửa hai lỗi ở Analytics (mục 7, mục 8).

---

## 2. `logi.ts` — sửa các hằng số

### 2.1 Categories
```ts
export const CATEGORIES = ['learn', 'work', 'fitness', 'leisure'] as const;
```
Bỏ `sleep` khỏi `CATEGORY_LABEL` và `CATEGORY_COLOR`.

### 2.2 Baseline
```ts
export const BASELINE_DAILY: DailyTargets = {
  //      CN   T2   T3   T4   T5   T6   T7
  work:    [0.0, 8.0, 9.5, 8.0, 9.5, 8.0, 0.0],   // 43
  learn:   [8.0, 3.0, 3.0, 3.0, 3.0, 3.0, 8.0],   // 31
  fitness: [0.0, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5],   //  9
  leisure: [1.75,0.5, 0.5, 0.5, 0.5, 0.5, 1.75],  //  6
};
```

`TOTAL_BUDGET` tự tính lại = **89h** (từ 135.5h).

### 2.3 Sàn cứng
```ts
export const HARD_FLOOR = { fitness: 4.5 };   // bỏ sleep: 42
```

### 2.4 Preset
Bỏ `sleep` khỏi cả bốn. Các con số còn lại **giữ nguyên**, và đã cộng đúng 89h:

| Preset | Learn | Work | Fitness | Leisure | Tổng |
|---|---|---|---|---|---|
| Normal | 31 | 43 | 9 | 6 | 89 |
| Crunch | 19 | 57 | 6 | 7 | 89 |
| Deep Learn | 40 | 40 | 6 | 3 | 89 |
| Recovery | 22 | 40 | 12 | 15 | 89 |

### 2.5 GIỮ NGUYÊN
- `DAY_CUTOFF_HOUR = 4` — **không đổi**. Lý do ở mục 5.
- `MAX_SESSION_MIN`, `TIMEZONE`, các type, cơ chế debt

---

## 3. `balance.ts` — sửa tối thiểu

### 3.1 `rebalance()`
Bỏ điều kiện loại trừ `sleep`:
```ts
const others = CATEGORIES.filter((c) => c !== changed);   // bỏ && c !== 'sleep'
```

### 3.2 Bỏ hẳn `coverage()` — thay bằng `logQuality()`

**Xoá** `coverage()` khỏi `balance.ts` và `coverageForRange()` khỏi Stage 5.

Lý do: mẫu số 24h/ngày cho ra 89/168 = **53%** ngay cả khi log hoàn hảo — dưới ngưỡng
cảnh báo 55%, nên nó sẽ bắn liên tục. Còn nếu trừ đi giờ ngủ giả định thì lại là một
giả định về giấc ngủ, đúng thứ vừa gỡ bỏ.

Vấn đề gốc: sau khi bỏ Sleep, **phần lớn 24 tiếng đúng là không có gì để log**.
Một tỉ lệ trên nền 24h không còn nói lên điều gì.

### Định nghĩa mới — không giả định gì

Đo **khoảng trống giữa các hoạt động đã log**, dùng đúng quy tắc mục 6:

```ts
export function logQuality(activities, range, now): {
  trackedHours: number;   // giờ đã log, đã trừ overlap
  gapHours: number;       // khoảng trống GIỮA activity đầu và cuối mỗi ngày
  activeSpanHours: number; // tổng (cuối − đầu) của các ngày có log
  loggedDays: number;      // số ngày có ít nhất 1 activity
  totalDays: number;
  gapRatio: number;        // gapHours / activeSpanHours
}
```

- Thời gian **trước** activity đầu tiên và **sau** activity cuối cùng của mỗi ngày
  không tính vào đâu cả — không phải giờ chưa log, chỉ là không có gì để log
- Hôm nay: `cuối` = `now`
- Ngày không có activity nào → không đóng góp vào `activeSpanHours`, nhưng vẫn tính
  vào `totalDays`

### Hiển thị
```
62h logged · 9h gaps · 5 of 7 days
```

Ba con số thô, mỗi cái tự kiểm chứng được, không con số nào dựa trên giả định.

### Cảnh báo
Hiện banner khi **một trong hai** điều kiện đúng:
- `gapRatio > 0.25` — nhiều khoảng trống giữa các hoạt động
- `loggedDays / totalDays < 0.6` — nhiều ngày không log gì

```
9h of gaps across 5 logged days.
The numbers below may not reflect reality.
```

### Vì sao cần cả hai điều kiện
`gapRatio` một mình có lỗ hổng: ngày chỉ log **đúng một** session 30 phút thì
`activeSpan` = 30 phút, gap = 0, tỉ lệ 100% — trông hoàn hảo trong khi thực ra
gần như không log gì. `loggedDays` bịt lỗ đó.

### Áp dụng
`coverageOfDay()` ở History đổi tên thành `dayLogQuality()`, cùng định nghĩa, phạm vi
một ngày. Dòng tóm tắt ở History đổi từ `Coverage 68%` sang `9.4h logged · 1.2h gaps`.

### 3.3 Còn lại
`actualHours`, `overlapHours`, `expectedHours`, `deviations`, `weekendConflict`,
`accrueDebt`, `applyDebt`, `validateTargets` — không đổi logic, tự chạy đúng với
4 category.

`suggestedEndTimes()`: bỏ dòng `sleep`.

---

## 4. Firestore & dữ liệu cũ

### 4.1 Rules
```
function validCategory(c) {
  return c in ['learn', 'work', 'fitness', 'leisure'];
}
```
Sau khi xoá dữ liệu ở mục 0 thì không còn record `sleep` nào. Rules chặn tạo mới.

### 4.2 Lọc phòng hờ ở tầng đọc
Dù đã xoá, vẫn thêm bộ lọc `category !== 'sleep'` ở mọi hàm đọc trong
`src/lib/activities.ts`. Phòng trường hợp xoá sót hoặc có record đang chờ sync
offline lúc chạy script.

Lọc ở client sau khi nhận snapshot, không thêm `where` — thêm điều kiện sẽ cần index
mới mà không được lợi gì.

### 4.3 Session sleep đang chạy
Trước khi xoá, kiểm tra có record nào `status: 'active'` với `category: 'sleep'`
không. Có thì xoá luôn cùng lô.

### 4.4 Export
Sau khi xoá, thêm ghi chú vào mọi file export sau này:
`"note": "sleep category was retired on <date>"`. File export **trước** khi xoá là
bản lưu duy nhất của dữ liệu sleep — nhắc người dùng cất giữ.

---

## 5. Vì sao GIỮ mốc 04:00

Mốc 04:00 ban đầu đặt ra vì giấc ngủ, nhưng nó vẫn cần cho lý do khác:

1. Khối học sáng bắt đầu 04:30 — phải thuộc đúng ngày
2. Leisure hoặc Work kéo qua nửa đêm (xem phim tới 01:00, OT tới 23:30) vẫn phải
   gán về ngày hôm trước, đúng như cách con người nghĩ

**Không đổi `DAY_CUTOFF_HOUR`.**

Cảnh báo cũ vẫn còn giá trị: mốc 04:00 chỉ cách giờ dậy 04:30 đúng 30 phút. Nếu về
sau dậy trước 04:00 thành thói quen thì hạ xuống 03:00. Giữ ghi chú này trong README.

---

## 6. History — khoảng đêm không được tính là untracked

Đây là hệ quả dễ bỏ sót nhất.

Bỏ Sleep thì mỗi ngày có một khoảng **22:00 → 04:30 hoàn toàn trống**. Nếu vẫn tính
là untracked thì mọi ngày đều hiện `6h 30m untracked` ở cuối — nhìn như quên log,
trong khi thực ra không có gì để log.

### Quy tắc mới
Khoảng untracked chỉ tính **giữa activity đầu tiên và activity cuối cùng** của ngày.
Phần trước cái đầu tiên và sau cái cuối cùng **không hiển thị, không tính**.

Timeline bắt đầu ở activity đầu tiên, kết thúc ở activity cuối cùng (hoặc `now` nếu
là hôm nay). Đúng với cách agent đã sửa thanh ngang ở màn Now.

Ngày trống hoàn toàn → empty state như cũ.

---

## 6b. Màn Now — nút gọn kèm tiến độ hôm nay

Thay đổi này vừa giải quyết chuyện click nhầm khi cuộn, vừa cho chỗ xem nhanh target
hôm nay mà không trùng với History hay Analytics.

### Ý tưởng cốt lõi
**Chính cái nút là thanh đo.** Không thêm một thanh riêng bên cạnh — mỗi nút category
có một dải tiến độ mảnh chạy dọc mép dưới, thể hiện hôm nay đã làm bao nhiêu so với
target của **đúng ngày đó** (`dailyTargetFor` từ Stage 4.5).

Không tốn thêm dòng nào, mà nhìn phát là biết cái nào còn thiếu.

### Cấu tạo nút
```
┌────────────────────────┐
│ ● Learn                │   ← chấm màu 7px + tên
│   1.5 / 3.0h           │   ← tabular-nums, --text-muted
│▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░│   ← dải 3px sát mép dưới
└────────────────────────┘
```

| Thuộc tính | Mobile | Desktop (≥ md) |
|---|---|---|
| Lưới | 2×2 | 2×2 |
| Chiều cao nút | **72px** | 96px |
| Cỡ chữ tên | 14px | 16px |
| Bề rộng tối đa cả trang | 100% | 720px |

Mobile thu gọn nhưng vẫn trên ngưỡng chạm 44px rất nhiều.

### Dải tiến độ
```
fill = min(1, actual / dailyTarget)
```
- Màu = `CATEGORY_COLOR`
- `actual > target` → dải đầy + **đoạn hổ phách ~14% ở mép phải** báo vượt
- `dailyTarget === 0` (VD Work ngày Chủ nhật) → không vẽ dải, số hiện `0.0 / —`
- Dải bám sát mép dưới, bo theo góc dưới của nút (`overflow: hidden`)

### Nút của category đang chạy
- Nền đổi sang `tint` của category, viền cùng tông
- Góc phải trên: chữ `running`, 10px
- **Vẫn bấm được** → cuộn tới card session tương ứng, không tạo trùng

### Bố cục màn Now (từ trên xuống)
1. Header: `Now` + ngày logic + `Xh tracked` bên phải
2. Balance banner (nếu có, tối đa một dòng)
3. Card session đang chạy
4. Lưới 4 nút
5. FAB mic

Bỏ dòng `Today: Learn 0.0h · Work 0.3h …` ở cuối — nay đã nằm trong các nút.

### Thu gọn khi nhiều session
Mục tiêu là **cả trang vừa màn hình iPhone 11, không phải cuộn**. Không cuộn thì
không có click nhầm.

Từ **3 session đang chạy trở lên**, card thu thành hàng đơn cao 56px:
`● WORK · 2:41:07 · since 8:00 AM · [Stop]`

---

## 6c. Chống click nhầm khi cuộn

Bố cục ở mục 6b đã loại phần lớn nguyên nhân. Thêm ba lớp bảo vệ, tất cả đều rẻ:

1. **Ngưỡng di chuyển** — chỉ kích hoạt khi `pointerup` mà ngón di chuyển **dưới
   10px** so với `pointerdown` và tổng thời gian **dưới 500ms**.
   Đây là fix gốc: trên iOS, thao tác vuốt kết thúc bằng một `click` nếu ngón dừng
   lại trên nút.
2. **Chặn sau cuộn** — bỏ qua mọi tap trong **300ms** sau khi sự kiện `scroll` gần
   nhất kết thúc.
3. **Undo 5 giây** — mọi lần Start hiện toast `Started Learn · Undo`. Lỡ nhầm thì
   huỷ bằng một chạm.

Áp dụng cho **cả 4 nút category**. Nút Stop không cần (nó nằm trong card, ít bị
lướt qua) nhưng thêm cũng không hại.

**Không** dùng long-press hay bước xác nhận cho việc Start — phải giữ đúng một chạm.

---

## 7. Fix Analytics #1 — "By day" cắt session

### Lỗi
Chart By day đang cắt session ở ranh giới ngày logic. Giấc ngủ 00:00 → 06:15 bị chia
4h cho thứ Sáu, 2.25h cho thứ Bảy. Tổng tuần đúng, phân bổ theo ngày sai.

Sleep sắp bị bỏ, nhưng **lỗi vẫn còn** với Leisure và Work vắt qua nửa đêm.

### Quy tắc — viết vào README
> Mọi con số về **khối lượng giờ** gán **trọn vẹn** cho `logicalDate` của `startAt`,
> không bao giờ cắt. Chỉ **heatmap** dùng giờ đồng hồ thật.

### Sửa
By day gom nhóm theo `logicalDate` và cộng **toàn bộ** `durationMin`. Không dùng
`layoutDay` hay bất kỳ hàm nào có cắt theo cửa sổ ngày.

Balance đang làm đúng — dùng lại cùng đường tính của nó.

### Sửa kèm
Nhãn trục Y đang bị cắt (`ih`, `'h` thay vì `4h`, `3h`). Tăng `margin.left` của
Recharts hoặc rút ngắn nhãn.

---

## 8. Fix Analytics #2 — bỏ range "Today" + bảng theo range

### 8.1 Bỏ hẳn chip "Today"

Chips còn lại: `This week` · `Last week` · `This month` · `Custom`.
Mặc định **This week**.

Lý do: sau khi nút category ở màn Now đã hiện tiến độ hôm nay, ba màn hình có phân
công rõ ràng —

| Màn | Trả lời |
|---|---|
| **Now** | Đang làm gì, hôm nay còn thiếu gì |
| **History** | Một ngày cụ thể, xem và sửa |
| **Analytics** | Từ 2 ngày trở lên, tìm quy luật |

Range "Today" rơi vào khoảng giữa mà không làm tốt hơn hai cái kia: By day một cột
vô nghĩa, When một cột trùng History, Balance trùng chính mấy cái nút.

`Custom` vẫn cho chọn khoảng 1 ngày — khi đó ẩn By day và When, chỉ hiện Balance
kèm dòng `Pick 2+ days to see daily and hourly patterns.`

### 8.2 Bảng DONE/TARGET/LEFT bám theo range

Bảng đang luôn hiện dữ liệu của "Today" bất kể chọn range nào.

### Sửa
Bảng bám theo range đang chọn, và **đổi tiêu đề + cột cuối** theo loại range:

| Range | Tiêu đề | Cột 3 | Chú thích dưới bảng |
|---|---|---|---|
| This week | `This week` | `LEFT` | `Hours left this week.` |
| This month | `This month` | `LEFT` | `Hours left this month.` |
| Last week | `Last week` | `DIFF` | `Final numbers for the week.` |
| Custom (đã qua) | `Aug 10 – Aug 20` | `DIFF` | `Final numbers for this period.` |
| Custom (còn đang diễn ra) | `Aug 25 – Aug 31` | `LEFT` | `Hours left in this period.` |

- `LEFT` = `max(0, target − done)` — chỉ dùng cho khoảng **chưa kết thúc**
- `DIFF` = `done − target`, có dấu `+`/`−` — dùng cho khoảng **đã đóng**

Khoảng đã kết thúc mà vẫn hiện "còn lại bao nhiêu giờ" là vô nghĩa — không còn thời
gian để làm nốt.

### Ẩn dòng
Chỉ ẩn khi `done === 0 && target === 0` (VD Work vào Chủ nhật). Còn lại luôn hiện đủ
4 dòng để so sánh.

---

## 9. Phần nào của AMENDMENT-sleep-boundary còn giữ

| Mục | Trạng thái |
|---|---|
| Giữ mốc 04:00 | **Giữ** — lý do mới, xem mục 5 |
| `logicalDate` từ `startAt` | **Giữ** |
| Không cắt block ở History | **Giữ** — vẫn cần cho Leisure/Work qua nửa đêm |
| Nhãn `→ next day` | **Giữ** |
| Bỏ `clippedEnd` / `continuedFromPrevious` | **Giữ** |
| Hàng `Asleep until 7:30 AM` | **BỎ** — không còn dữ liệu ngủ |
| `asleepUntil()` trong `timeline.ts` | **BỎ** |
| `carriedIn` | **BỎ** — thay bằng quy tắc mục 6 |
| Tham số `dayStart` của `coverageOfDay` | **Giữ**, nhưng nay là giờ của activity đầu tiên |
| Heatmap vẽ theo giờ đồng hồ thật | **Giữ** |
| `bedtimeScore`, `medianBedtime`, `lateNights`, `wakeSpreadMin`, `lostMorningBlocks` | **BỎ** |
| `test/timeline-sleep.test.ts`, `test/signals-sleep.test.ts` | **BỎ** |

---

## 10. Stage 7 signals — sửa

### Bỏ hẳn
- **Nhóm B (Sleep)** — toàn bộ
- Nhóm F: `leisureNightsDelayingSleep`
- Nhóm G: `fitnessAfterShortNights`, `learnAfterShortNights`, `sleepAfterLateWork`

### Thay thế
Mất dữ liệu ngủ thì dùng **hoạt động khuya** làm chỉ báo gián tiếp:

| Chỉ số mới | Cách tính |
|---|---|
| `lateNightActivityDays` | Số ngày có bất kỳ activity nào sau 23:00 |
| `lastActivityMedian` | Giờ kết thúc activity cuối cùng, trung vị |
| `lastActivitySpreadMin` | Dao động của giờ đó |
| `earlyStartDays` | Số ngày có activity đầu tiên trước 06:00 |
| `learnAfterLateNights` | Learn trung bình ở ngày sau một ngày có hoạt động sau 23:00 |

`lastActivityMedian` là thứ gần nhất thay được `medianBedtime`: hoạt động cuối cùng
kết thúc lúc 22:00 hay 01:00 nói lên khá nhiều, dù không chính xác bằng.

Vẫn giữ quy tắc `sampleSize >= 3` cho nhóm G.

---

## 11. Chỗ khác cần sửa

| Chỗ | Việc |
|---|---|
| Màn Now | 5 nút → 4 nút, xem mục 6b (nút gọn + dải tiến độ) |
| Màn Now | Bỏ dòng `Today: Learn 0.0h · Work 0.3h …` ở cuối |
| Balance bars | 5 thanh → 4 |
| Heatmap legend | 4 màu |
| History gauge | 5 cột → 4 cột (rộng hơn, dễ đọc hơn ở 320px) |
| Analytics | Bỏ chip `Today`, mặc định `This week` (mục 8.1) |
| Màn Targets | Bỏ dòng `Sleep 46.5h — fixed`. Tổng `89 / 89h` |
| Sheet đổi preset | Bỏ dòng Sleep |
| Weekly Review | Bỏ dòng Sleep ở cả ba màn |
| Voice prompt | Bỏ `sleep` khỏi danh sách category và khỏi mô tả lịch sinh hoạt |
| Voice — câu nói về ngủ | AI trả `unknown` → toast `Sleep is no longer tracked.` Không im lặng bỏ qua |
| History | Dòng tóm tắt đổi từ `Coverage 68%` sang `9.4h logged · 1.2h gaps` |
| Analytics | Banner cảnh báo dùng câu chữ mới ở mục 3.2 |
| README | Ghi ngày gỡ Sleep và lý do; ghi rõ không còn khái niệm coverage |

---

## 12. Test

### Cập nhật
Rà toàn bộ ~419 test, bỏ mọi tham chiếu `sleep`. Sửa các giá trị mong đợi:
`TOTAL_BUDGET` 135.5 → **89**, `BASELINE_WEEKLY` bỏ khoá `sleep`.

### Test mới bắt buộc
`test/budget.test.ts`
- `TOTAL_BUDGET === 89`
- Cả 4 preset cộng đúng 89
- `rebalance` phân bổ đều cho 3 category còn lại, tôn trọng sàn Fitness 4.5h

`test/log-quality.test.ts`
- Ngày log 06:00→08:00 và 09:00→17:00: tracked 10h, gap 1h, activeSpan 11h
- Thời gian trước activity đầu và sau activity cuối **không** vào gap
- Ngày chỉ có 1 session → `gapRatio` = 0 nhưng `loggedDays` phản ánh đúng
- 3/7 ngày có log → cảnh báo bắn vì `loggedDays / totalDays < 0.6`
- Overlap không bị tính hai lần vào `trackedHours`
- Hôm nay: `activeSpan` dừng ở `now`, không kéo tới cuối ngày

`test/byday-nosplit.test.ts`
- Leisure 22:00 → 01:00 hôm sau: **toàn bộ 3h** vào ngày logic đầu, không cắt
- Work 23:00 → 02:00: toàn bộ 3h vào ngày logic đầu
- Tổng By day = tổng Balance ở mọi khoảng

`test/range-table.test.ts`
- Range đang diễn ra → cột `LEFT`, không âm
- Range đã đóng → cột `DIFF`, có dấu
- Chỉ ẩn dòng khi cả done và target đều 0

`test/no-sleep.test.ts`
- `CATEGORIES` không chứa `sleep`
- Repository lọc bỏ record `sleep` sót lại khỏi mọi kết quả đọc

`test/now-progress.test.ts`
- `fill = min(1, actual / dailyTarget)`, không vượt 1
- `dailyTarget === 0` → không vẽ dải, nhãn `0.0 / —`
- Vượt target → có đoạn hổ phách
- Target lấy từ `dailyTargetFor(weekday, weekly)`, đúng ngày trong tuần

`test/tap-guard.test.ts`
- Di chuyển 4px, 200ms → kích hoạt
- Di chuyển 25px → **không** kích hoạt
- Thời gian 700ms → **không** kích hoạt
- Trong 300ms sau scroll → **không** kích hoạt

---

## 13. Kiểm thử tay

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Màn Now trên iPhone | 4 nút 2×2, **cả trang vừa màn hình, không phải cuộn** |
| 1b | Dải tiến độ trên nút | Khớp với target ngày hôm đó |
| 1c | Cuộn nhanh rồi dừng ngón trên nút | **Không** start session |
| 1d | Bấm nhầm rồi Undo | Session biến mất |
| 1e | 3 session cùng chạy | Card thu thành hàng 56px, lưới nút vẫn thấy được |
| 2 | Màn Targets | Không có Sleep, tổng 89h |
| 3 | Kéo slider Work | 3 category kia tự trừ, Fitness dừng ở 4.5h |
| 4 | History ngày cũ có sleep | Record sleep không hiện |
| 5 | History | Không có `6h 30m untracked` ở đầu/cuối ngày |
| 6 | Log đủ target một tuần | Hiện `Xh logged · Yh gaps · 7 of 7 days`, không cảnh báo |
| 6b | Chỉ log 3/7 ngày | Cảnh báo bắn vì thiếu ngày |
| 6c | Ngày có khoảng trống lớn giữa 2 session | Gap hiện đúng số giờ |
| 7 | Analytics By day | Leisure 22:00→01:00 nằm trọn một ngày |
| 8 | Tổng By day vs Balance | Khớp nhau ở mọi range |
| 9 | Analytics | Không còn chip `Today`, mặc định `This week` |
| 9b | Custom chọn 1 ngày | Ẩn By day và When, có dòng giải thích |
| 9c | Chọn This week | Bảng đổi tiêu đề, cột `LEFT` |
| 10 | Chọn Last week | Cột đổi thành `DIFF`, có dấu |
| 11 | Nhãn trục Y By day | Đọc được `4h`, không phải `ih` |
| 12 | Nói "I start to sleep now" | Toast `Sleep is no longer tracked.` |
| 13 | Export | Vẫn có record sleep cũ + ghi chú |
| 14 | Heatmap | 4 màu trong legend |

Mục 1, 6 và 8 là ba bài quan trọng nhất. Mục 1 chứng minh màn Now không cần cuộn —
lý do chính của cả thay đổi này. Mục 6 chứng minh coverage đã đổi mẫu số đúng.
Mục 8 chứng minh By day hết cắt.

---

## Definition of Done

- [x] Đã export all-time JSON và người dùng xác nhận **trước** khi xoá
- [x] Record `sleep` đã xoá hết khỏi Firestore, đếm lại về 0
- [x] `CATEGORIES` còn 4, không còn `sleep` ở đâu trong `src/`
- [x] `TOTAL_BUDGET === 89`, cả 4 preset cộng đúng
- [x] Không còn `coverage()` / `coverageForRange()`; thay bằng `logQuality()`
- [x] Không còn bất kỳ hằng số hay giả định nào về giấc ngủ trong `src/`
- [ ] Màn Now vừa một màn hình iPhone 11, không phải cuộn *(cần kiểm thử tay)*
- [x] Nút category có dải tiến độ khớp target ngày
- [x] Ba lớp chống click nhầm hoạt động
- [x] Analytics không còn chip `Today`, mặc định `This week`
- [x] History không hiện untracked ngoài khoảng activity đầu–cuối
- [x] By day gán trọn session theo `logicalDate`, khớp Balance
- [x] Bảng DONE/TARGET/LEFT đổi theo range, khoảng đã đóng dùng `DIFF`
- [x] Nhãn trục Y không bị cắt
- [x] Voice báo rõ khi nói về ngủ
- [x] `DAY_CUTOFF_HOUR` vẫn là 4
- [x] `npm test` xanh (465 pass), typecheck sạch, build OK
- [ ] 14/14 mục kiểm thử tay pass *(cần người dùng chạy trên máy)*

---

## Quy tắc cho agent

**Dừng và hỏi khi:**
- Trước khi xoá — báo số record sẽ xoá, chờ xác nhận (mục 0)
- Một test cũ fail mà không rõ nên sửa kỳ vọng hay sửa code

**Không được:**
- Xoá bất cứ gì trước khi export xong và người dùng xác nhận
- Dùng điều kiện xoá rộng hơn `category === 'sleep'`
- Đổi `DAY_CUTOFF_HOUR`
- Dùng long-press hay bước xác nhận cho việc Start (phải giữ đúng một chạm)
- Giữ chip `Today` ở Analytics
- Đổi các con số target của 4 category còn lại
- Giữ lại `coverage()` cũ, hay bất kỳ hằng số giả định giờ ngủ nào
- Cắt session theo cửa sổ ngày ở bất kỳ chart nào
- Hiện `LEFT` cho khoảng đã kết thúc
- Im lặng bỏ qua khi người dùng nói về ngủ bằng voice
