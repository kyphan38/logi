# STAGE 4.6 — Design polish

> Gộp chung với Stage 4.5 (History redesign) — làm cùng một lượt, vì cả hai đều
> đụng vào màn hình History.
>
> Plan này viết cho một AI coding agent thực thi.
> Sau mỗi task có mục **Verify** — phải pass mới đi tiếp.

---

## 0. Mục tiêu

App hiện chạy đúng nhưng trông như demo Tailwind mặc định. Vấn đề gốc **không phải
bo góc** mà là: mọi thứ đều dùng viền màu pastel, không có thứ bậc thị giác, số liệu
và nhãn cùng cỡ chữ.

Stage này sửa hình thức + vài bug nhỏ. **Không đụng vào logic nghiệp vụ nào.**

### KHÔNG làm ở stage này
- Chart, heatmap, export (Stage 5)
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts`
- Đổi bất kỳ công thức hay luồng dữ liệu nào

---

## Task 1 — Design tokens

Tạo `src/styles/tokens.css` (hoặc mở rộng `globals.css`). Mọi component dùng token,
không hardcode màu.

### Bán kính
| Token | Giá trị | Dùng cho |
|---|---|---|
| `--radius-sm` | 8px | button, input, chip |
| `--radius-md` | 12px | card, timeline block, sheet row |
| `--radius-lg` | 16px | bottom sheet, modal |
| `--radius-full` | 9999px | FAB, dot, pill |

Hiện tại nhiều chỗ gần như vuông. Đây là thay đổi thấy rõ nhất.

### Bề mặt & viền
```
--surface-0: nền trang
--surface-1: card
--surface-2: card nổi / sheet
--border:    hairline 0.5px, xám rất nhạt
--border-strong: viền đứt cho vùng untracked
```

Nguyên tắc: **bớt viền, thêm nền.** Card dùng nền khác biệt thay vì viền bao quanh.

### Màu category
Giữ nguyên `CATEGORY_COLOR` trong `logi.ts` làm màu gốc. Thêm cho mỗi category
2 biến thể dẫn xuất:
- `tint` — nền block timeline (alpha ~0.12)
- `ink` — chữ trên nền tint (đủ tương phản, ratio ≥ 4.5)

**Không sửa `logi.ts`.** Đặt bảng dẫn xuất trong file CSS/TS mới.

### Chữ
- Số liệu: `font-variant-numeric: tabular-nums` ở **mọi** chỗ hiện giờ/thời lượng.
  Thiếu cái này thì timer và các con số nhảy qua lại trông rất lộn xộn.
- Thứ bậc: số 13px `--text-primary`, nhãn 11px `--text-secondary`.
  Hiện số và nhãn cùng cỡ nên không phân biệt được cái nào quan trọng.

### Verify
`grep -rn "#[0-9a-fA-F]\{6\}" src/components src/app` — chỉ còn trong file token.

---

## Task 2 — Nút mic to hơn

Bạn dùng voice thường xuyên, nút hiện quá nhỏ trên điện thoại.

| Thuộc tính | Giá trị |
|---|---|
| Đường kính (mobile) | **64px** (hiện ~56px) |
| Đường kính (desktop ≥ md) | 56px |
| Cách mép phải | 20px |
| Cách bottom nav | 16px + `env(safe-area-inset-bottom)` |
| Icon | 26px |
| Bóng | nổi rõ hơn, để tách khỏi nội dung phía sau |

Lúc đang ghi phình lên **76px** với vòng đỏ. Đảm bảo không đè lên nút Stop của
session card — nếu đụng, đẩy padding-bottom của danh sách session.

**Verify**: trên iPhone, ngón cái với tới nút mà không phải đổi tư thế cầm máy.

---

## Task 3 — Nút category ở màn Now

Hiện mỗi nút một viền màu pastel khác nhau, cạnh nhau — đây chính là thứ làm app
trông "phèn". Không có nút nào nổi hơn nút nào, và 5 màu viền cạnh nhau gây nhiễu.

Sửa:
- Nền `--surface-1`, viền hairline `--border` (**không** viền màu)
- Màu category thu về một **chấm tròn 8px** bên trái tên
- Chiều cao ≥ 72px, `--radius-md`
- Trạng thái nhấn: nền đậm hơn một bậc, không đổi màu viền
- Đang chạy: nền tint của category + chữ "Running", chấm nhấp nháy

**Desktop**: bọc nội dung trong `max-width: 720px; margin: 0 auto`. Hiện nút Learn
kéo dài ~700px trông rất kỳ.

---

## Task 4 — Summary gauge ở History

Thay dòng chữ `Learn 0.0 / 3.2Work 0.3 / 7.3…` bằng 5 thanh gauge nhỏ.

### Bố cục
Grid 5 cột đều nhau, gap 8px. Mỗi ô từ trên xuống:
1. Nhãn category, 11px, `--text-secondary`
2. Thanh cao **6px**, `--radius-full`, track `--surface-0`
3. Số `1.0/3.2` — phần actual `--text-primary`, phần `/target` `--text-muted`,
   `tabular-nums`

### Quy tắc thanh
```
fill = min(1, actual / target)
màu  = CATEGORY_COLOR[c]
```
- `actual > target` → thanh đầy + **vạch hổ phách 3px ở mép phải** báo vượt
- `target === 0` (VD Fitness ngày Chủ nhật) → không vẽ thanh, số hiện `0.0/—`
- `actual === 0 && target === 0` → cả ô làm mờ đi

### Bỏ hẳn
- Thanh ngang mảnh full-width dưới dòng summary — hiện 100% cam vì chỉ có Work
  được log, không mang thông tin gì.
- Dòng `Tracked … · Untracked … · Overlap …`. Overlap chuyển thành dòng phụ nhỏ,
  chỉ hiện khi `> 0`.

### Ở 375px
5 cột × ~66px. Nhãn `Fitness` và `Leisure` sẽ chật — dùng `font-size: 10px` và
`letter-spacing: -0.01em` cho nhãn, không viết tắt.

**Verify**: đọc được ở 320px, không tràn ngang, không xuống dòng nhãn.

---

## Task 5 — Timeline block

Áp dụng cùng lúc với Stage 4.5 Task 2 (timeline co giãn).

- `--radius-md` (12px) cho mọi block
- Nền `tint`, **viền trái 3px** màu gốc, **không** viền bao quanh
- Chữ dùng `ink`
- **Bỏ hẳn dòng Label.** Chỉ hiện: tên category (13px) + dòng giờ/thời lượng (11px).
  Label vẫn lưu trong DB và vẫn sửa được trong `RecordSheet`, chỉ không hiện ở
  timeline.
- Vùng untracked: viền đứt `--border-strong`, `--radius-md`, chữ 11px `--text-muted`

### Record 0 phút
Có mấy record `7:28 AM–7:28 AM · 0m` trong dữ liệu. Start-stop trùng phút gần như
luôn là thao tác nhầm.

- Timeline: hiện với chiều cao tối thiểu + nhãn `0m` màu `--text-muted`
- `stopActivity`: nếu `endAt - startAt < 60s` → hiện confirm
  `"Less than a minute. Save anyway?"` với lựa chọn `[Discard] [Save]`
- **Không** tự động chặn — có thể người dùng thật sự muốn ghi

---

## Task 6 — Chuyển Targets sang tiếng Anh

Toàn bộ giao diện là tiếng Anh. Màn Targets đang lẫn tiếng Việt.

### Chuỗi chính xác

**Preset**
| Card | Tiêu đề | Mô tả |
|---|---|---|
| 1 | `Normal` | `Standard week` |
| 2 | `Crunch` | `Deadline or OT — adds Learn debt` |
| 3 | `Deep Learn` | `Certification or exam push` |
| 4 | `Recovery` | `Post-crunch reset` |

Dòng số giữ nguyên định dạng gọn: `L31 · W43 · F9 · Le6`

**Custom**
- Nhãn mục: `CUSTOM`
- `Sleep` → `46.5h — fixed`
- Chạm sàn → `floor`
- `Total` → `135.5 / 135.5h ✓`
- Vượt ngân sách → `Over by 3.0h — reduce another category`
- Còn thừa → `3.0h unallocated`

**Sheet đổi preset**
```
Switch to Crunch?

Learn    31h → 19h    +12h debt
Fitness   9h →  6h     +3h debt
Work     43h → 57h
Leisure   6h →  7h

[ Cancel ]   [ Switch ]
```

**Nợ**
- Tiêu đề mục: `DEBT`
- Dòng: `Learn  12.0h` + `6.0h applied this week`
- Crunch bị khoá: `Locked — 24h of debt outstanding`

**Tuần khoá**: `This week is closed.`

**Streak**: `Crunch: 4 of the last 6 weeks.` +
`Reset your baseline, or is this something to fix?` + `[ Reset baseline ] [ Keep as is ]`

### Verify
`grep -rnP "[\x{00C0}-\x{1EF9}]" src/` — không còn tiếng Việt trong chuỗi hiển thị.
(Comment trong code thì để tiếng Việt cũng được.)

---

## Task 7 — Sửa banner ở màn Now

Banner hiện ghi `Work: 0.4h / 31.0h (-99%)`. Con số 31.0h là **expected tính tới
thời điểm hiện tại trong tuần**, nhưng đọc lên tưởng target Work là 31h — trong khi
màn Targets ghi 40h. Gây hiểu nhầm.

### Sửa cách viết
```
Work  0.4h · 31h expected by now   (-99%)
```
Hoặc gọn hơn: `Work is 30.6h behind pace`

Chọn cách nào cũng được, miễn **không** để con số expected đứng cạnh dấu `/` như
thể nó là target tuần.

### Ẩn khi thiếu dữ liệu
`coverage(weekActivities) < 0.20` → **ẩn hẳn banner**.

Khi tuần gần như trống thì mọi category đều `-99%`, banner không mang thông tin mà
chỉ gây nản. Đây cũng là lý do bạn đang thấy `-99%` ở ảnh chụp.

Thay bằng dòng nhạt: `Not enough logged this week to compare.`

---

## Task 8 — Sửa bug hiển thị

1. **Dòng summary dính chữ**: `Learn 0.0 / 3.2Work 0.3 / 7.3` — thiếu dấu phân cách.
   Task 4 thay bằng gauge nên tự hết, nhưng kiểm tra xem còn chỗ nào nối chuỗi kiểu
   này không.
2. **Desktop**: mọi màn hình bọc `max-width: 720px; margin: 0 auto`. Hiện Targets
   căn giữa còn Now/History kéo full width — không nhất quán.
3. **Sidebar desktop** rộng 220px nhưng nội dung ít; giảm còn 180px.
4. `-webkit-tap-highlight-color: transparent` + trạng thái `:active` tự định nghĩa
   cho mọi phần tử bấm được.

---

## Task 9 — Kiểm thử

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Nút mic trên iPhone | 64px, ngón cái với tới dễ |
| 2 | Đang ghi | Phình 76px, không đè nút Stop |
| 3 | Nút category ở Now | Viền xám, chấm màu, không viền pastel |
| 4 | Gauge ở History | 5 thanh, đọc được ở 320px |
| 5 | Category vượt target | Thanh đầy + vạch hổ phách |
| 6 | Chủ nhật, Fitness target 0 | Không vẽ thanh, hiện `0.0/—` |
| 7 | Block timeline | Bo 12px, không hiện Label |
| 8 | Sửa record | Label vẫn sửa được trong RecordSheet |
| 9 | Màn Targets | Toàn tiếng Anh |
| 10 | Banner khi tuần trống | Ẩn, hiện dòng "Not enough logged" |
| 11 | Stop sau 30 giây | Hỏi `Less than a minute. Save anyway?` |
| 12 | Desktop 1440px | Nội dung giới hạn 720px, căn giữa |
| 13 | Mọi màn ở 320px | Không tràn ngang |

---

## Definition of Done

- [ ] Token bán kính/màu/chữ áp dụng toàn app, không hardcode màu ngoài file token
- [ ] Mic 64px trên mobile, với tới dễ
- [ ] Nút category dùng chấm màu, không viền pastel
- [ ] Gauge thay dòng summary, đọc được ở 320px
- [ ] Timeline block bo 12px, bỏ Label
- [ ] Targets toàn tiếng Anh
- [ ] Banner không còn gây hiểu nhầm, ẩn khi coverage < 20%
- [ ] Desktop giới hạn 720px
- [ ] `npm test` xanh, typecheck sạch, build OK
- [ ] 13/13 mục Task 9 pass

---

## Quy tắc cho agent

**Không được:**
- Đổi bất kỳ công thức hay luồng dữ liệu nào — đây là stage hình thức
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts`
- Xoá field `label` khỏi DB hay khỏi `RecordSheet` (chỉ ẩn ở timeline)
- Tự chặn record 0 phút (chỉ hỏi lại)
- Hardcode màu ngoài file token
- Làm sớm chart của Stage 5
