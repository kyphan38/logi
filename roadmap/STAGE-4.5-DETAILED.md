# STAGE 4.5 — History redesign

> Chèn giữa Stage 4 và Stage 5. **Chỉ bắt đầu khi Stage 4 đã xong**, vì summary line
> cần `weekTarget` do Stage 4 tạo ra.
>
> Plan này viết cho một AI coding agent thực thi. Làm đúng thứ tự task.
> Sau mỗi task có mục **Verify** — phải pass mới đi tiếp.

---

## 0. Bối cảnh

Màn hình History hiện tại có một bug thật và một vấn đề thiết kế.

**Bug**: timeline tràn ngang. Các block bị đẩy sang mép phải, giữa là vùng trắng lớn,
có thanh cuộn ngang.

**Thiết kế**: timeline dùng tỉ lệ tuyến tính cho 24 tiếng (~1440px) để hiển thị
5–8 record. Phần lớn màn hình là khoảng trống, phải cuộn nhiều mới xem hết một ngày.

Stage 4.5 sửa cả hai, và làm History phục vụ đúng **hai việc** nó cần làm:
1. **Kiểm tra & sửa** — voice parse sai, quên bấm Stop. Đây là việc chính.
2. **Nhìn lại hình dạng của ngày** — cái gì chiếm bao nhiêu, lỗ hổng ở đâu.

### KHÔNG làm ở stage này
- Chart, heatmap, export (Stage 5)
- Đụng vào màn hình Now, Targets, hay luồng voice
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts`

---

## Task 1 — Sửa bug tràn ngang

### Chẩn đoán trước khi sửa
Nguyên nhân khả dĩ:
- Lane tính `width: 100% / laneCount` nhưng phần trăm ăn theo container có
  `min-width` cố định thay vì bề ngang viewport
- Cột nhãn giờ dùng `position: absolute` còn vùng block dùng `margin-left` cứng
- `layoutDay()` trả `laneCount` sai

**Điểm nghi ngờ cụ thể**: ảnh chụp cho thấy `Overlap 0.0h` nhưng có nhiều sliver
mảnh xen kẽ. Không có overlap thì đúng ra chỉ có **một** lane full-width. Chạy
`layoutDay()` với đúng dữ liệu ngày 27/08 và in ra `laneCount` + kích thước từng
segment trước khi đụng CSS. Có thể đây là bug logic, không phải bug layout.

### Yêu cầu sau khi sửa
- Container timeline `width: 100%`, `overflow-x: hidden`
- Không bao giờ có thanh cuộn ngang ở bất kỳ bề rộng nào từ 320px trở lên
- Lane chia theo phần trăm của bề ngang thực tế
- Ẩn thanh cuộn **không** phải là cách sửa. Phải sửa layout.

### Verify
Mở DevTools ở 320px, 375px, 414px, 768px — không có tràn ngang ở bề rộng nào.
`document.documentElement.scrollWidth === clientWidth`.

---

## Task 2 — Timeline co giãn

Thay tỉ lệ tuyến tính 24h bằng bố cục co giãn: khối có dữ liệu giữ chiều cao đọc
được, khoảng trống thu về một dòng.

### Chiều cao block

Bán tỉ lệ, có chặn hai đầu:

```ts
height = clamp(44, 44 + (durationMin - 30) * 0.22, 132)
```

- Tối thiểu **44px** — đủ để chạm theo chuẩn iOS, kể cả session 5 phút
- Tối đa **132px** — session ngủ 6.5h không được chiếm hết màn hình
- Ở giữa vẫn thấy được cái nào dài hơn

Chấp nhận đánh đổi: mất tính tỉ lệ chính xác. Bù lại, thời lượng luôn viết bằng
chữ trên block (`08:00 – 17:00 · 9h`), nên thông tin không mất.

### Khoảng trống

| Khoảng | Hiển thị |
|---|---|
| > 30 phút | Dòng cao 32px, viền đứt, chữ nhạt: `1h 45m untracked` |
| ≤ 30 phút | Chỉ để 8px khoảng cách, không hiện gì |

Ngày hôm nay: khoảng trống chỉ tính tới **hiện tại**, không tính phần tương lai.
(Logic này đã có sẵn từ Stage 2, giữ nguyên.)

### Nhãn giờ
Cột trái rộng 42px, chỉ hiện giờ bắt đầu của mỗi block. **Không** vẽ thang giờ
đều đặn 2 tiếng nữa — thang đó chỉ có nghĩa khi tỉ lệ tuyến tính.

### Block chồng nhau
Vẫn dùng `layoutDay()` để chia lane. Trong bố cục mới, các block cùng khung giờ
nằm **cạnh nhau trên cùng một hàng**, chia đôi/ba bề ngang. Chiều cao hàng = block
cao nhất trong nhóm.

Không dùng `position: absolute` chồng lên nhau — block dưới sẽ không bấm được.

### Giữ nguyên từ bản cũ
- `continuedFromPrevious` → viền đứt phía trên + nhãn `cont. from Aug 26`
- `clippedEnd` → viền đứt phía dưới
- `status: 'abandoned'` → gạch chéo mờ + nhãn `abandoned`
- Tap block → mở `RecordSheet` như cũ

### Ngày trống
Empty state: `Nothing tracked on this day.` + nút `+` để thêm.

### Verify
- Ngày 6 record → vừa một màn hình, không cuộn dọc
- Ngày 12 record → cuộn dọc bình thường, **không** cuộn ngang
- Ngày có 2 record chồng giờ → hai cột cạnh nhau, cả hai bấm được

---

## Task 3 — Summary line theo target

Thay `Tracked 9.4h · Untracked 6.9h · Overlap 0.0h` — dòng này không cho biết
9.4h là nhiều hay ít.

Dòng mới đối chiếu với target của **đúng ngày trong tuần đó**:

```
Learn 1.5 / 3.0 · Work 9.5 / 9.5 · Fitness 0 / 1.5
```

### Helper mới
Tạo `src/lib/day-target.ts` (**không** sửa `balance.ts`):

```ts
export function dailyTargetFor(
  weekday: number,                        // 0 = CN ... 6 = T7
  weekly: Record<Category, number>
): Record<Category, number> {
  // Giữ nguyên hình dạng tuần của BASELINE_DAILY, scale theo target thực tế
  // out[c] = BASELINE_DAILY[c][weekday] * (weekly[c] / BASELINE_WEEKLY[c])
}
```

Đây đúng là cách `expectedHours()` trong `balance.ts` đang làm cho cả tuần —
tách ra thành phiên bản một ngày để dùng lại, không sao chép công thức khác đi.

### Quy tắc hiển thị
- Chỉ hiện category có `actual > 0` **hoặc** `target > 0`. Chủ nhật không có
  Fitness thì không hiện Fitness.
- Đạt hoặc vượt target → chữ bình thường
- Dưới 50% target → chữ màu `--text-secondary` đậm hơn một chút. **Không dùng đỏ.**
- Ngày hôm nay: target pro-rate theo `dayProgress()`, không lấy target cả ngày.
  Lúc 10 giờ sáng mà so với target cả ngày thì cái gì cũng "thiếu".
- Chưa có `weekTarget` cho tuần đó (dữ liệu cũ) → quay về dòng
  `Tracked X · Untracked Y` như hiện tại.

### Overlap
Chuyển xuống dòng phụ, chỉ hiện khi `> 0`: `0.8h overlap`.

### Verify
Ngày thứ Ba với preset Normal → Work target hiện `9.5` (8h + 1.5h commute), không
phải `8.0`. Chủ nhật → Learn target `8.0`.

---

## Task 4 — Day strip có ý nghĩa

Dải 7 ngày trên cùng hiện chỉ có chấm "có dữ liệu / không có". Đổi thành thanh
mini 5 màu theo tỉ lệ category của ngày đó.

```
┌─────┐ ┌─────┐ ┌─────┐
│ Mon │ │ Tue │ │ Wed │
│  24 │ │  25 │ │  26 │
│▁▃▅▂ │ │▁▇▁▁ │ │▂▄▃▁ │   ← thanh ngang 4px, chia theo tỉ lệ giờ
└─────┘ └─────┘ └─────┘
```

- Thanh ngang cao 4px dưới số ngày, chia đoạn theo `CATEGORY_COLOR`
- Tỉ lệ theo tổng giờ đã log của ngày đó (không phải 24h)
- Ngày chưa log gì → thanh xám nhạt liền
- Ngày đang chọn → thanh dày 6px

Mục đích: lướt ngang là thấy ngay tuần này ngày nào bị Work nuốt hết, chưa cần mở
Analytics.

### Hiệu năng
Cần tổng giờ của 7 ngày cùng lúc. Dùng **một** query theo `logicalWeek` (index đã
có từ Stage 1) rồi gom nhóm ở client. **Không** chạy 7 query riêng.

Cache kết quả, chỉ query lại khi đổi tuần.

### Verify
Thanh của ngày hôm nay phải khớp với summary line bên dưới.

---

## Task 5 — Test

Thêm vào bộ `node --test`:

`test/day-target.test.ts`
- Thứ Ba, preset Normal → Work 9.5, Learn 3.0
- Chủ nhật → Learn 8.0, Fitness 0
- Preset Crunch → tỉ lệ scale đúng, tổng 7 ngày = weekly target

`test/timeline-elastic.test.ts`
- Block 5 phút → chiều cao 44px
- Block 9h → chiều cao 132px (chạm trần)
- Khoảng trống 45 phút → tạo dòng untracked
- Khoảng trống 20 phút → không tạo dòng
- 2 record chồng giờ → cùng một hàng, 2 lane
- Ngày hôm nay → không tạo dòng untracked cho phần tương lai

---

## Task 6 — Kiểm thử tay trên iPhone

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Mở History | **Không** có thanh cuộn ngang |
| 2 | Xoay ngang máy | Vẫn không tràn ngang |
| 3 | Ngày thường (5–7 record) | Vừa một màn hình, không cuộn dọc |
| 4 | Summary line | Hiện dạng `Learn 1.5 / 3.0`, số khớp target ngày đó |
| 5 | Ngày hôm nay lúc 10h sáng | Target đã pro-rate, không so với cả ngày |
| 6 | Day strip | 7 thanh màu, ngày Work nhiều thì đoạn cam dài |
| 7 | Tap block | RecordSheet mở, sửa được như cũ |
| 8 | Khoảng trống dài | Hiện `Xh Ym untracked`, gọn một dòng |
| 9 | Ngày có sleep vắt qua 04:00 | Vẫn hiện `cont. from …` |
| 10 | Ngày trống | Empty state, không crash |
| 11 | Tuần chưa có weekTarget | Quay về summary cũ, không crash |
| 12 | Ngày có 2 record chồng giờ | Hai cột cạnh nhau, cả hai bấm được |

Test 1 và 3 là hai bài chính — chúng là lý do stage này tồn tại.

---

## Definition of Done

- [ ] Không có cuộn ngang ở mọi bề rộng ≥ 320px
- [ ] `layoutDay()` đã được kiểm chứng lại với dữ liệu thật (laneCount đúng)
- [ ] Ngày thưa vừa một màn hình
- [ ] Chiều cao block trong khoảng 44–132px
- [ ] Khoảng trống > 30 phút thu về một dòng
- [ ] Summary line đối chiếu target, pro-rate cho hôm nay
- [ ] Day strip hiện tỉ lệ category, chỉ dùng một query/tuần
- [ ] Sửa record vẫn hoạt động y như cũ
- [ ] `npm test` xanh, typecheck sạch, build OK
- [ ] 12/12 mục Task 6 pass trên iPhone thật

---

## Quy tắc cho agent

**Không được:**
- Ẩn thanh cuộn ngang thay vì sửa layout
- Dùng `position: absolute` chồng block lên nhau
- Chạy 7 query cho day strip
- Dùng màu đỏ cho category dưới target
- Sao chép công thức từ `balance.ts` thay vì gọi lại nó
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts`
- Đụng vào màn hình Now, Targets, hay luồng voice
- Làm sớm chart của Stage 5

**Ghi chú cho Stage 5**: heatmap 24h × ngày ở Analytics **vẫn dùng tỉ lệ tuyến
tính**. Co giãn chỉ áp dụng cho History một ngày. Hai chỗ phục vụ hai mục đích
khác nhau — heatmap cần trục giờ thẳng hàng giữa các ngày mới so sánh được.
