# STAGE 5 — Analytics

> Plan này viết cho một AI coding agent thực thi. Làm đúng thứ tự task.
> Sau mỗi task có mục **Verify** — phải pass mới đi tiếp.
> Nếu gặp mâu thuẫn hoặc thiếu thông tin, **DỪNG và hỏi người dùng**, không tự đoán.

---

## 0. Bối cảnh

Stage 4 đã có `weekTargets`, debt, balance banner. Stage 4.5/4.6 đã dọn History và
dựng design token.

Analytics trả lời đúng **hai câu hỏi**, không hơn:
1. *Tuần này mình dành nhiều thời gian cho cái gì?*
2. *Có lệch so với mục tiêu không?*

Mọi thứ không phục vụ hai câu này thì không làm. Đây là app cá nhân, không phải
dashboard doanh nghiệp.

### KHÔNG làm ở Stage 5
- Pie / donut chart ở vị trí chính (ít thông tin, và sai khi có overlap)
- Dự đoán, xu hướng ngoại suy, "insight" do AI sinh
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts`

### Dependency mới
`npm i recharts` — chart duy nhất được phép thêm. Không cài thư viện chart nào khác.

---

## Task 1 — Bộ lọc khoảng thời gian

`src/components/RangePicker.tsx`

### Lựa chọn
Chips ngang: `Today` · `This week` · `Last week` · `This month` · `Custom`
Mặc định **This week**.

`Custom` → hai date picker `from` / `to`, kèm nút nhanh `Last 7 days` / `Last 30 days`.

### Kiểu dữ liệu
```ts
type Range = {
  from: string;        // logicalDate, "2026-08-24"
  to: string;          // logicalDate, bao gồm cả ngày này
  kind: 'today' | 'this_week' | 'last_week' | 'this_month' | 'custom';
  isPartial: boolean;  // true nếu 'to' là hôm nay và ngày chưa kết thúc
};
```

`isPartial` quyết định có pro-rate target hay không. Thiếu cờ này thì "This week"
vào thứ Ba sẽ luôn báo thiếu mọi thứ.

### Truy vấn
- Khoảng nằm gọn trong 1–4 tuần → query theo `logicalWeek in [...]`
  (`in` giới hạn 30 phần tử, thừa sức)
- Ngược lại → query `logicalDate >= from && logicalDate <= to`
  (index `logicalDate ASC, startAt ASC` đã có từ Stage 1)

**Một query cho cả khoảng.** Gom nhóm ở client. Không query từng ngày.

Giới hạn: khoảng > 92 ngày → chặn, hiện `Range too large — max 3 months.`

### Verify
Chọn từng chip, kiểm tra `from`/`to` đúng theo mốc ngày logic 04:00. `Today` lúc
02:00 sáng phải trả về ngày hôm trước.

---

## Task 2 — Target cho một khoảng bất kỳ

**Đây là phần khó nhất và dễ sai nhất của Stage 5.**

Tạo `src/lib/range-target.ts`. Không sửa `balance.ts`.

```ts
export function expectedForRange(
  range: Range,
  weekTargets: Map<string, Record<Category, number>>, // key = logicalWeek
  now: number
): Record<Category, number>
```

### Thuật toán
```
với mỗi ngày logic d trong [from..to]:
   w       = logicalWeek(d)
   weekly  = weekTargets.get(w) ?? PRESETS.normal.weekly   // tuần chưa có target
   daily   = dailyTargetFor(weekdayOf(d), weekly)           // đã có từ Stage 4.5
   nếu d là hôm nay và range.isPartial:
      daily = daily × dayProgress(now)
   cộng dồn
```

### Ba điều bắt buộc
1. **Không** dùng `weeklyTarget × số ngày / 7`. Target không phân bố đều — thứ Ba
   Work là 9.5h còn Chủ nhật là 0h. Đã kiểm chứng ở Stage 4: chia đều lệch tới 5h.
2. **Mỗi tuần có target riêng.** Tuần trước có thể là Crunch, tuần này Normal.
   Phải đọc `weekTarget` của từng tuần trong khoảng, không dùng chung một bộ.
3. **Chỉ pro-rate ngày hôm nay**, và chỉ khi `isPartial`. Ngày quá khứ luôn tính
   target đầy đủ.

### Coverage cho khoảng
`coverage()` trong `balance.ts` chia cứng cho 168h (một tuần). Không dùng được cho
khoảng bất kỳ. Viết riêng:

```ts
export function coverageForRange(activities, range, now): number {
  // tổng giờ đã log (đã trừ overlap) / tổng giờ thực của khoảng
  // ngày hôm nay chỉ tính tới thời điểm now
}
```

### Verify — bắt buộc có test
- Khoảng Thứ Hai→Thứ Sáu, preset Normal → Work expected **43h** (5 ngày có commute
  T3/T5), không phải `43 × 5/7 = 30.7h`
- Khoảng vắt qua hai tuần khác preset → tổng đúng bằng tổng hai phần
- `isPartial` giữa ngày → target hôm nay bị cắt theo `dayProgress`
- Tuần không có `weekTarget` → rơi về `PRESETS.normal`

---

## Task 3 — Balance bars (chart chính)

Đặt **trên cùng**. Đây là chart trả lời cả hai câu hỏi trong một hình.

### Hình thức
5 thanh ngang, mỗi thanh có vạch dọc đánh dấu target:

```
Sleep     ████████████████████│▓▓        46.5h   ✓
Work      ████████████████████│████████  +15%    ▲
Learn     ██████████│                    −38%    ▼
Fitness   ████│                          −47%    ▼
Leisure   ███████│▓                      +8%     ✓
```

- Chiều dài thanh = `actual`, thang đo chung cho cả 5 (không mỗi thanh một thang)
- Vạch dọc = `expected` từ Task 2
- Vượt target → phần thừa đổi sang màu hổ phách
- Bên phải: giờ tuyệt đối + `%` lệch + mũi tên
- `flag === 'ok'` → dấu ✓, không mũi tên

### Ngưỡng
Dùng đúng `deviations()` của `balance.ts` — deadband kép: chỉ đánh dấu ▲▼ khi lệch
> 25% **và** ≥ 2h. Nằm trong deadband thì hiện ✓ dù số % có lớn.

### Màu
`--text-secondary` cho nhãn, `CATEGORY_COLOR` cho thanh, hổ phách cho phần vượt.
**Không dùng đỏ** — đỏ dành cho lỗi hệ thống, không dành cho hành vi người dùng.

### Có thể tự vẽ bằng div
Chart này đơn giản, dùng div + CSS sẽ gọn và dễ chỉnh hơn Recharts. Agent tự chọn,
miễn đọc được ở 320px.

---

## Task 4 — Stacked bar theo ngày

### Gộp nhóm theo độ dài khoảng
| Số ngày | Mỗi cột là |
|---|---|
| ≤ 14 | 1 ngày |
| 15–92 | 1 tuần |

30 cột trên màn 375px là không đọc được. Quy tắc này bắt buộc.

### Hình thức
- Recharts `BarChart` + `ResponsiveContainer`
- Trục X: `Mon 24` (ngày) hoặc `W35` (tuần)
- Trục Y: giờ. **Không** dùng % của 24h — có overlap nên tổng có thể vượt 24
- 5 stack theo `CATEGORY_COLOR`
- Đường ngang đứt = target trung bình mỗi ngày trong khoảng
- Tuần có `lateChange: true` → dấu ⚠ nhỏ dưới nhãn trục X

### Tương tác
Tap một cột → hiện tooltip với breakdown. Trên mobile tooltip phải bấm được, không
chỉ hover.

---

## Task 5 — Heatmap 24h × ngày

Chart giá trị nhất với bạn: nó cho thấy **khi nào**, không chỉ **bao nhiêu**. Đây là
thứ lộ ra OT tràn vào buổi tối và cuối tuần.

### Quan trọng
Heatmap dùng **tỉ lệ tuyến tính**. Không áp co giãn như History — trục giờ phải
thẳng hàng giữa các ngày thì mới so sánh được. Đây chính là lý do heatmap tồn tại.

### Hình thức
- Cột = ngày, hàng = giờ **04:00 → 04:00** (đúng ranh giới ngày logic)
- Ô = màu của category **chiếm nhiều phút nhất** trong giờ đó
- Độ đậm theo số phút được log trong giờ (ô 15 phút nhạt hơn ô 60 phút)
- Không có gì → ô trống, nền `--surface-0`

### Giới hạn
Chỉ hiện khi khoảng ≤ 14 ngày. Dài hơn → ẩn, kèm dòng
`Heatmap available for ranges up to 14 days.`

### Kích thước mobile
7 cột × 24 hàng ở 375px → ô rộng ~45px, cao 18px. Nhãn giờ mỗi 3 tiếng.
Cuộn dọc được, **không** cuộn ngang.

### Chú thích
Hàng chip nhỏ 5 màu ở dưới. Tap một chip → làm mờ các category khác.

---

## Task 6 — Coverage & overlap

Đặt dưới cùng, chữ nhỏ, không phải chart.

```
Coverage 68%  ·  Overlap 2.1h
```

### Cảnh báo coverage
`coverageForRange < 0.55` → banner nhạt phía **trên** các chart:

```
Only 41% of this period is logged.
The numbers below may not reflect reality.
```

Chỉ số này quan trọng hơn vẻ ngoài của nó: coverage 40% thì mọi kết luận khác đều
không đáng tin, và người dùng cần biết điều đó **trước khi** đọc chart.

Coverage mục tiêu ~70% (129.5h/168h là kế hoạch, phần còn lại là ăn uống, sinh hoạt,
đi lại — không log).

### Overlap
Chỉ hiện khi `> 0`. Tap → tooltip:
`Time counted in two categories at once (e.g. Work while Learning).`

---

## Task 7 — Export

Nút `Export` góc trên phải màn Analytics → sheet:

```
Export

Range:  [ Current range ▾ ]
        Current range · Last 3 days · Last 30 days · Custom

Format: ( ) CSV   ( ) JSON

[ Cancel ]   [ Download ]
```

### CSV
Cột: `id, category, label, start, end, durationMin, logicalDate, logicalWeek, status, source`

- `start` / `end`: ISO 8601 kèm offset `+07:00`
- Escape đúng chuẩn RFC 4180: field chứa `,` `"` hoặc xuống dòng thì bọc nháy kép
  và nhân đôi nháy bên trong. `label` do voice sinh nên rất dễ có dấu phẩy.
- Có dòng header
- Thêm BOM `\uFEFF` ở đầu file để Excel đọc đúng tiếng Việt trong `label`

### JSON
```json
{
  "exportedAt": "...",
  "range": { "from": "...", "to": "..." },
  "weekTargets": [...],
  "activities": [...]
}
```
Kèm `weekTargets` để dữ liệu tự đủ nghĩa khi phân tích ngoài.

### Cách tải
Tạo file **hoàn toàn ở client** (`Blob` + `URL.createObjectURL`). Không cần API route.

Tên file: `logi-2026-08-01_2026-08-31.csv`

**iOS**: Safari xử lý tải file khác desktop. Kiểm tra file mở được bằng app Files
trên iPhone. Nếu không được, fallback sang mở tab mới với `data:` URL.

---

## Task 8 — Bố cục màn Analytics

Từ trên xuống:
1. Range picker (chips + custom)
2. Cảnh báo coverage (nếu < 55%)
3. **Balance bars**
4. Stacked bar
5. Heatmap (nếu ≤ 14 ngày)
6. Coverage · Overlap
7. Nút Export (góc trên phải, cạnh tiêu đề)

Desktop: `max-width: 720px`, căn giữa — nhất quán với các màn khác sau Stage 4.6.

### Trạng thái
- Loading: skeleton cho từng chart, không chặn cả trang
- Khoảng không có dữ liệu: `Nothing logged in this period.` + nút về `This week`
- Lỗi query: hiện lỗi + nút Retry, không crash

---

## Task 9 — Test

`test/range-target.test.ts`
- T2→T6 preset Normal → Work **43h**, không phải 30.7h
- Khoảng vắt hai tuần khác preset → tổng đúng
- `isPartial` → chỉ ngày hôm nay bị cắt
- Tuần thiếu `weekTarget` → rơi về Normal

`test/coverage-range.test.ts`
- Khoảng 1 ngày, log 12h → 50%
- Có overlap → không tính hai lần
- Hôm nay chỉ tính tới `now`, không tính phần tương lai

`test/bucketing.test.ts`
- 14 ngày → gộp theo ngày; 15 ngày → gộp theo tuần
- Ranh giới ngày logic 04:00 đúng

`test/heatmap.test.ts`
- Session 8:00–11:00 → tô 3 ô
- Session 8:30–9:15 → ô 8h đậm 50%, ô 9h đậm 25%
- Hai category chồng giờ → ô lấy category nhiều phút hơn
- Sleep 22:00→06:00 → tô đúng, vắt qua ranh giới ngày

`test/export.test.ts`
- Label chứa dấu phẩy → escape đúng
- Label chứa nháy kép → nhân đôi
- Header đủ cột

---

## Task 10 — Kiểm thử tay trên iPhone

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Mở Analytics | Mặc định This week, load < 2s |
| 2 | Balance bars | Đọc được cái nào vượt/thiếu trong một lượt mắt |
| 3 | Đổi sang Last week | Target là tuần đầy đủ, không pro-rate |
| 4 | This week vào giữa tuần | Target đã pro-rate, không báo thiếu oan |
| 5 | This month | Stacked bar gộp theo tuần, không 30 cột |
| 6 | This month | Heatmap ẩn, có dòng giải thích |
| 7 | Custom 10 ngày | Heatmap hiện |
| 8 | Heatmap | Không cuộn ngang, ô đủ lớn để đọc |
| 9 | Tap chip category | Các category khác mờ đi |
| 10 | Coverage thấp | Banner cảnh báo hiện trên chart |
| 11 | Export CSV | Tải được, mở bằng Files, cột đúng |
| 12 | Export JSON | Có `weekTargets` |
| 13 | Khoảng trống dữ liệu | Empty state, không crash |
| 14 | Khoảng 4 tháng | Bị chặn, có thông báo |
| 15 | Xoay ngang | Layout không vỡ |

Mục 3 và 4 là hai bài quan trọng nhất — chúng chứng minh `expectedForRange` xử lý
đúng chuyện pro-rate.

---

## Definition of Done

- [ ] `expectedForRange` cộng dồn theo lịch, đọc target riêng từng tuần
- [ ] Chỉ pro-rate ngày hôm nay, chỉ khi `isPartial`
- [ ] `coverageForRange` không chia cứng cho 168
- [ ] Balance bars dùng `deviations()` của `balance.ts`
- [ ] Stacked bar gộp theo tuần khi > 14 ngày
- [ ] Heatmap tuyến tính, chỉ hiện khi ≤ 14 ngày
- [ ] Cảnh báo coverage < 55% hiện trên chart
- [ ] Export CSV escape đúng, có BOM; JSON kèm `weekTargets`
- [ ] Một query cho cả khoảng, không query từng ngày
- [ ] Không tràn ngang ở mọi bề rộng ≥ 320px
- [ ] `npm test` xanh, typecheck sạch, build OK
- [ ] 15/15 mục Task 10 pass trên iPhone thật

---

## Báo cáo khi xong

1. File mới/sửa
2. Kết quả 15 mục kiểm thử
3. Ảnh chụp cả 3 chart trên mobile
4. Thời gian load Analytics với dữ liệu 1 tháng
5. Chỗ nào lệch so với plan, kèm lý do

---

## Quy tắc cho agent

**Dừng và hỏi khi:**
- Recharts không render được đúng ở 320px và cần đổi cách tiếp cận
- Một khoảng thời gian rơi vào trường hợp không có trong plan

**Không được:**
- Tính target bằng `weekly × ngày / 7`
- Dùng chung một `weekTarget` cho khoảng vắt nhiều tuần
- Pro-rate ngày trong quá khứ
- Dùng `coverage()` của `balance.ts` cho khoảng khác một tuần
- Dùng % của 24h cho trục Y (có overlap nên tổng vượt 24)
- Áp co giãn cho heatmap
- Đặt pie/donut ở vị trí chính
- Query từng ngày một
- Dùng màu đỏ cho deviation
- Cài thư viện chart khác ngoài Recharts
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts`
