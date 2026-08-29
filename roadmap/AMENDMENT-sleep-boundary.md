# AMENDMENT — Xử lý giấc ngủ vắt qua ranh giới ngày

> Áp dụng cho **Stage 4.5** (History timeline), **Stage 5** (heatmap),
> **Stage 7** (signals). Đưa kèm khi giao các stage đó.
>
> Nếu Stage 4.5 đã làm xong thì đây là bản vá — sửa lại phần A2.

---

## 1. Quyết định: GIỮ mốc 04:00

Không đổi `DAY_CUTOFF_HOUR`. Không đổi sang 00:00.

### Lý do

Hai kiểu đêm ngủ điển hình của người dùng:
- **A**: 22:00 thứ Hai → 04:30 thứ Ba
- **B**: 00:15 thứ Ba → 07:30 thứ Ba (thức khuya, dậy muộn)

| Đêm | Mốc 00:00 | Mốc 04:00 |
|---|---|---|
| A | T2 được 2h, T3 được 4.5h | **T2 được 6.5h**, T3 được 0 |
| B | T3 được 7.25h | **T2 được 7.25h**, T3 được 0 |

Mốc 00:00 **chẻ đôi đêm ngủ bình thường** thành hai ngày. Mốc 04:00 cho mỗi ngày
logic đúng một đêm ngủ ở cả hai kiểu — đây chính là lý do nó tồn tại.

Về ý nghĩa: đi ngủ 00:15 là *thức khuya của tối thứ Hai*, không phải *giấc ngủ của
thứ Ba*. Gán về thứ Hai là đúng với cách con người nghĩ.

### Ngày logic vẫn tính từ `startAt`
Không đổi. `logicalDate(startAt)`, không phải `endAt`, không phải điểm giữa.

---

## 2. Vấn đề thật: hiển thị, không phải dữ liệu

Record vẫn là **một** session 7h15m. Nó bị chẻ làm hai khối chỉ vì timeline cũ dùng
**trục 24h tuyến tính**, nên phải cắt ở ranh giới 04:00.

Stage 4.5 đã đổi sang **timeline co giãn** — bố cục danh sách, không phải trục tỉ lệ.
Trong bố cục đó **không có lý do gì phải cắt**.

> Cơ chế `clippedEnd` / `continuedFromPrevious` đặc tả ở Stage 4.5 phần A2 là để chữa
> cho trục tuyến tính. Sang bố cục co giãn thì nó thừa, và chính nó gây ra hiện tượng
> một giấc ngủ hiện thành hai khối.

---

## 3. Sửa History (thay thế Stage 4.5 phần A2)

### 3.1 Không cắt block nữa
Session thuộc `logicalDate` nào thì hiện **nguyên vẹn một hàng** ở ngày đó, kể cả khi
`endAt` vượt quá 04:00 hôm sau.

```
22:00   Sleep
        10:00 PM – 4:30 AM → next day · 6h 30m
```
```
00:15   Sleep
        12:15 AM – 7:30 AM · 7h 15m
```

- `endAt` rơi sang **ngày lịch** khác `startAt` → thêm nhãn `→ next day` sau giờ kết
  thúc. Nhãn nhỏ, `--text-muted`.
- Bỏ `clippedEnd`. Bỏ `continuedFromPrevious`. Bỏ viền đứt trên/dưới cho mục đích này.
- `subscribeByDate` quay về query **đúng một** `logicalDate`. Không cần kéo thêm ngày
  hôm trước nữa.

### 3.2 Dòng "còn đang ngủ" ở đầu ngày hôm sau
Ngày hôm sau sẽ có một khoảng trống đầu ngày mà người dùng thực ra đang ngủ. Không
được để nó thành `3h 30m untracked` — nhìn như quên log.

Nếu ngày logic trước đó có session Sleep với `endAt` > 04:00 của ngày đang xem:

```
┌──────────────────────────────────────┐
│  Asleep until 7:30 AM  (logged Aug 25) │
└──────────────────────────────────────┘
```

- Hàng mảnh, nền `--surface-0`, chữ `--text-muted`
- **Không bấm được**, không phải block, không tính vào tổng của ngày này
- Thời gian đó **không** bị tính là untracked
- Tap vào chữ `Aug 25` → chuyển sang ngày đó

### 3.3 Coverage
Khoảng "còn đang ngủ" đầu ngày được trừ khỏi mẫu số coverage của ngày hôm sau. Nó
không phải thời gian chưa log — nó đã được log, chỉ thuộc ngày khác.

### Verify
- Ngủ 22:00 T2 → 04:30 T3: timeline T2 hiện **một** hàng `10:00 PM – 4:30 AM → next
  day · 6h 30m`. T3 hiện dòng `Asleep until 4:30 AM`, không có untracked ở đầu ngày.
- Ngủ 00:15 T3 → 07:30 T3: timeline T2 hiện **một** hàng cuối ngày. T3 hiện dòng
  `Asleep until 7:30 AM`, ngày bắt đầu từ 07:30.

---

## 4. Heatmap (Stage 5) — khác hẳn

Heatmap **vẫn dùng trục tuyến tính** và **vẫn phải vẽ xuyên ranh giới**. Đây không
mâu thuẫn với mục 3: hai chỗ phục vụ hai mục đích khác nhau.

- Cột = ngày **lịch**, không phải ngày logic
- Ô được tô theo thời gian thực tế diễn ra, bất kể record thuộc `logicalDate` nào
- Ngủ 00:15 → 07:30 thứ Ba → tô các ô 00:00–07:00 của **cột thứ Ba**

Vì mục đích của heatmap là trả lời *"khi nào trong ngày mình làm gì"* — nó phải phản
ánh giờ đồng hồ thật. Còn tổng giờ theo category thì vẫn tính theo ngày logic.

Hai con số này sẽ **không khớp nhau** ở những ngày có ngủ muộn. Đó là đúng, không
phải bug. Ghi chú vào README để sau khỏi tưởng nhầm.

---

## 5. Signals (Stage 7 nhóm B)

### Định nghĩa "một đêm"
Session Sleep có `durationMin > 240` (4h). Ngắn hơn là nap.

### `medianBedtime` khi vắt qua nửa đêm
Quy đổi giờ đi ngủ về thang **liên tục** trước khi lấy trung vị, nếu không 22:00 và
00:15 sẽ ra trung vị vô nghĩa:

```
bedtimeScore = giờ >= 12 ? giờ : giờ + 24
// 22:00 → 22.0
// 00:15 → 24.25
// 01:30 → 25.5
```
Lấy trung vị trên `bedtimeScore` rồi đổi ngược về giờ hiển thị.

`bedtimeSpreadMin` cũng tính trên thang này. Hai đêm 22:00 và 00:15 chênh nhau
**2h15m**, không phải 22h.

### Chỉ số mới cho nhóm B
| Chỉ số | Cách tính |
|---|---|
| `lateNights` | Số đêm có `bedtimeScore >= 24` (đi ngủ sau nửa đêm) |
| `wakeSpreadMin` | Dao động giờ dậy |
| `lostMorningBlocks` | Số ngày dậy sau 07:00 → mất khối học sáng |

`lostMorningBlocks` nối thẳng vào nhóm D: đêm 00:15 → 07:30 làm mất khối Learn
04:30–06:30. Đây đúng là loại liên hệ mà tính năng phân tích cần chỉ ra.

---

## 6. Một rủi ro cần biết

Mốc 04:00 chỉ cách giờ dậy thường lệ 04:30 đúng **30 phút**.

Nếu có hôm dậy lúc 03:45 và bắt đầu học ngay, session Learn đó sẽ bị gán vào **ngày
hôm trước** — sai.

Hiện tại chưa phải vấn đề vì bạn dậy 04:30. Nhưng nếu về sau dậy sớm hơn 04:00 thành
thói quen, hạ `DAY_CUTOFF_HOUR` xuống **03:00**. Mốc 03:00 vẫn gán đúng giấc ngủ bắt
đầu lúc 00:15 (vẫn về ngày hôm trước) mà lại rộng chỗ hơn cho buổi sáng.

**Không đổi bây giờ.** Ghi vào README như một điểm cần theo dõi.

---

## 7. Test bắt buộc

`test/timeline-sleep.test.ts`
- Ngủ 22:00 → 04:30 hôm sau: **một** segment ở ngày logic đầu, có cờ `crossesMidnight`
- Ngủ 00:15 → 07:30: **một** segment, `logicalDate` = ngày hôm trước
- Ngày hôm sau: có hàng `asleepUntil`, không có untracked trước giờ đó
- Coverage ngày hôm sau trừ đúng khoảng còn ngủ

`test/signals-sleep.test.ts`
- `bedtimeScore`: 22:00 → 22.0; 00:15 → 24.25; 01:30 → 25.5
- Trung vị của [22:00, 23:30, 00:15] ra 23:30, không ra giá trị vô nghĩa
- `bedtimeSpreadMin` của [22:00, 00:15] = 135 phút
- Nap 90 phút không tính vào thống kê đêm
- `lostMorningBlocks` đếm đúng khi dậy sau 07:00

---

## Tóm tắt cho agent

| Việc | Quyết định |
|---|---|
| Mốc ngày logic | **Giữ 04:00**, không đổi |
| `logicalDate` tính từ | `startAt`, không đổi |
| History timeline | **Không cắt block.** Hiện nguyên hàng + nhãn `→ next day` |
| `clippedEnd` / `continuedFromPrevious` | **Bỏ** — chỉ cần cho trục tuyến tính |
| Đầu ngày hôm sau | Hàng `Asleep until 7:30 AM`, không tính untracked |
| Heatmap | Vẫn tuyến tính, vẫn vẽ xuyên ranh giới, theo giờ đồng hồ thật |
| `medianBedtime` | Quy đổi thang liên tục trước khi lấy trung vị |
