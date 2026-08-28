# logi - Implementation Roadmap

Cá nhân time-audit web app. Next.js (App Router) + Firebase + Vercel + Gemini Flash.
Single user, mobile-first, giao diện tiếng Anh.

---

## Nguyên tắc xuyên suốt (áp dụng cho MỌI stage)

Các quy tắc này bất biến. Agent thực thi không được thay đổi mà không hỏi.

1. **Logical day cắt lúc 04:00**, không phải nửa đêm. Mọi truy vấn analytics đi qua
   `logicalDate()` / `logicalWeek()`. Không bao giờ dùng ngày lịch thô.
2. **Timer là derived state**: luôn `now - startAt`. Không `setInterval` cộng dồn.
3. **Cho phép nhiều session chạy song song.** Không auto-stop khi start cái mới.
   Hệ quả: tổng giờ/ngày có thể > 24h → mọi chart dùng **giờ tuyệt đối**, không dùng
   % của 24h. Luôn hiển thị `overlapHours`.
4. **Không lưu audio.** Nhận → gửi Gemini → huỷ khỏi memory. Chỉ lưu transcript text.
5. **Gemini API key chỉ tồn tại server-side.** Không bao giờ có tiền tố `NEXT_PUBLIC_`.
6. **Không xoá dữ liệu tự động.** Session quá 15h → `status: 'abandoned'`, hỏi lại
   người dùng. Không hard-delete.
7. **Target là zero-sum 135.5h.** Không cho tăng tổng. Sàn cứng: sleep ≥ 42h,
   fitness ≥ 4.5h.
8. **Câu chữ nêu số, không dạy đời.** `"Work: 46h / 40h (+15%)"` - không phải
   `"Bạn đang làm việc quá nhiều rồi"`.
9. **iOS/WebKit là target chính** (iPhone 11, browser Edge/Safari). Không dùng
   `audio/webm`. Không phụ thuộc Web Push.
10. **Không viết test tự động ở Stage 1–2** trừ khi được yêu cầu. Ưu tiên chạy được
    thật trên điện thoại.

---

## Bảng stage

| Stage | Tên | Mục tiêu | Kết quả kiểm chứng được |
|---|---|---|---|
| **1** | Foundation & Auth | Dự án chạy được, đăng nhập được, deploy được | Mở app trên iPhone, login Google, thấy màn hình rỗng đã xác thực |
| **2** | Core Tracking | Ghi nhận hoạt động bằng tay | Bấm Start Work → đóng app → mở lại → timer vẫn đúng |
| **3** | Voice & AI | Nói để log | Nói "I worked on devops from 8 to 11 this morning" → ra đúng record |
| **4** | Targets & Balance | Đánh giá cân bằng | Thấy được lệch bao nhiêu so với mục tiêu, đổi được preset |
| **5** | Analytics | Chart & export | Xem tuần này dành nhiều cho cái gì, export CSV |
| **6** | Polish | Hoàn thiện | Dùng hàng ngày không vướng |

---

## Stage 1 - Foundation & Auth

→ Xem file `STAGE-1-DETAILED.md` để có plan đầy đủ.

Tóm tắt: scaffold Next.js + TypeScript + Tailwind, khởi tạo Firebase client (kèm
offline persistence) và Firebase Admin, đăng nhập Google popup + allowlist một email,
session cookie httpOnly 14 ngày, `AuthContext` toàn cục, app shell với bottom nav,
deploy Vercel, deploy Firestore rules.

**Không làm ở stage này:** activity, timer, voice, chart. Chỉ hạ tầng.

---

## Stage 2 - Core Tracking

**Mục tiêu:** log hoạt động bằng tay, đầy đủ và đáng tin, trước khi đụng tới AI.

### Phạm vi
- Firestore repository layer cho `activities` (create / update / stop / list theo
  `logicalDate` và `logicalWeek`).
- Màn hình **Now**:
  - 5 nút category lớn (Learn / Work / Fitness / Sleep / Leisure) để Start.
  - Danh sách session đang chạy dạng stack card: tên, giờ bắt đầu, timer, nút Stop.
  - Hiển thị `overlapHours` khi có ≥ 2 session chạy cùng lúc.
- Timer tính lại mỗi giây bằng `now - startAt`; khi tab quay lại foreground
  (`visibilitychange`) phải đồng bộ lại ngay.
- Ghi `logicalDate` + `logicalWeek` + `durationMin` (denormalize lúc stop).
- **Stale session recovery**: mở app thấy session > 15h → modal hỏi giờ kết thúc,
  dùng `suggestedEndTimes()`. Ba lựa chọn + "Xoá".
- Màn hình **History**: chọn ngày, hiển thị **timeline dọc** (không phải table).
  Tap block → bottom sheet sửa category / start / end / xoá.
- Offline: dựa vào IndexedDB persistence đã bật ở Stage 1. Start/Stop khi mất mạng
  vẫn phải chạy và sync sau.

### Ràng buộc
- Start category đang chạy lần nữa → cảnh báo, không tạo trùng.
- `endAt` phải > `startAt`. Sửa thành công phải ghi lại `durationMin`.
- Không tạo record có `startAt` quá 7 ngày trong quá khứ qua UI thủ công.

### Xong khi
Start Work trên điện thoại, khoá máy 10 phút, mở lại → timer hiện đúng 10 phút.
Stop → record xuất hiện trong History đúng ngày. Sửa giờ kết thúc → duration cập nhật.

---

## Stage 3 - Voice & AI

**Mục tiêu:** thay phần lớn thao tác tay bằng giọng nói, với cơ chế sửa lỗi tốt.

### Phạm vi
- `MediaRecorder` + `pickAudioMime()` (bắt buộc - iOS không nhận webm).
- Nút mic giữ-để-nói (press & hold) ở màn hình Now, có waveform hoặc chỉ báo đang ghi.
- API route `POST /api/parse`: verify session cookie → build system prompt kèm context
  (thời gian hiện tại, active sessions, 5 activity gần nhất) → `parseAudio()` → trả
  `ParseResult`. `maxDuration: 30` trong `vercel.json`.
- **Confirmation card** - tầng chống lỗi quan trọng nhất:
  - `confidence ≥ 0.85` → auto-commit + toast "Undo" 5 giây.
  - `confidence < 0.85` → hiện card, mọi field tap được để sửa, phải bấm Confirm.
  - `intent === 'clarify'` → hiện `clarifyQuestion` + `clarifyOptions` thành nút.
- Xử lý đủ 7 intent: `start`, `stop`, `log_past`, `schedule`, `edit`, `clarify`,
  `unknown`.
- **Voice edit**: "no, that was learning" / "change to 9 AM" → `parseTextCorrection()`
  áp patch lên activity gần nhất.
- **Delayed start**: `schedule` → tạo record `status: 'scheduled'` với `startAt` tương
  lai. UI hiện đếm ngược "starts in 4:32". Khi tới giờ tự chuyển `active`. Không dùng
  push notification.
- Xử lý lỗi: mic bị từ chối quyền, mạng chậm, Gemini trả rác → luôn có đường lui về
  nhập tay.

### Ràng buộc
- Audio không được ghi ra disk, không lên Storage, không log ra console ở production.
- Voice phải hoạt động cho cả 4 tổ hợp: Click→Click, Voice→Voice, Voice→Click,
  Click→Voice.

### Xong khi
Nói 10 câu mẫu (xem `STAGE-3-TEST-PHRASES` bên dưới) trên iPhone, ≥ 8 câu ra đúng
mà không cần sửa tay.

### Câu test bắt buộc
```
1. "I start to sleep now"
2. "Start working out"
3. "Start sleep in 5 minutes"
4. "This morning I worked on DevOps from 8 AM to 11 AM"
5. "I finished cooking 11 minutes ago"
6. "I'm driving to work now"              → phải ra category work
7. "I went out at 10"                      → phải suy ra 10 PM, hoặc hỏi lại
8. "Done"                                  → stop session đang chạy
9. "No, that was learning"                 → sửa record vừa tạo
10. "I read for two hours last night"
```

---

## Stage 4 - Targets & Balance

**Mục tiêu:** biến dữ liệu thô thành đánh giá cân bằng, kèm cơ chế chống tự lừa mình.

### Phạm vi
- Collection `weekTargets/{logicalWeek}`, khởi tạo từ `PRESETS.normal` nếu chưa có.
- Màn hình **Targets**:
  - 4 preset card (Normal / Crunch / Deep Learn / Recovery).
  - Slider tuỳ chỉnh dùng `rebalance()` - kéo một cái, các cái khác tự trừ.
    Hiện `validateTargets()` errors ngay dưới.
  - Sleep khoá cứng 46.5h. Sàn sleep 42h / fitness 4.5h không kéo xuống dưới được.
- **Debt ledger** (`meta/debt`):
  - Cuối tuần chạy `accrueDebt()`.
  - Đầu tuần chạy `applyDebt()` - cộng 50% nợ, trần 10h.
  - Nợ > 20h → khoá preset Crunch, hiện lý do.
- **Khoá tuần**: 21:00 Chủ nhật set `lockedAt`. Sau đó không sửa target được nữa
  (rules đã chặn ở tầng DB).
- Sửa target sau thứ Năm → `lateChange: true` → chart gắn dấu ⚠.
- **Balance banner** ở màn hình Now: chạy `deviations()` + `weekendConflict()`.
  Chỉ hiện khi có flag khác `ok`. Tối đa 1 dòng.
- **In-app reminders** (KHÔNG dùng push):
  - 06:15 chưa có Learn hôm nay
  - 20:45 chưa có Learn buổi tối
  - CN 19:00 tổng kết tuần
  - Kiểm tra khi app mở hoặc quay lại foreground. Dismiss được, không lặp lại trong ngày.
- `crunchStreak()` - 4/6 tuần là Crunch → hiện prompt hỏi có nên đặt lại baseline.

### Ràng buộc
- Deviation dùng `expectedHours()` (pro-rate theo lịch). **Tuyệt đối không chia đều**
  `weekly × ngày/7` - sai lệch tới 5h và sẽ báo động sai mỗi thứ Tư.
- Deadband kép: chỉ cảnh báo khi lệch > 25% **VÀ** ≥ 2h.

### Xong khi
Log một tuần dữ liệu giả, banner hiện đúng câu deviation. Đổi sang Crunch → target
Learn giảm và nợ được ghi. Tuần sau mở lên → target Learn tự tăng lại.

---

## Stage 5 - Analytics

**Mục tiêu:** trả lời hai câu hỏi - *tuần này mình dành nhiều cho cái gì*, và
*có lệch mục tiêu không*.

### Phạm vi
- **Bộ lọc**: chips `Today · This week · Last week · This month` + `Custom from–to`.
  Mặc định là `This week`.
- **Chart 1 - Balance bars** (chart chính, đặt trên cùng):
  5 thanh ngang, mỗi thanh có vạch dọc đánh dấu target, kèm nhãn `46.5h ✓` /
  `+15% ▲` / `−47% ▼`. Trả lời cả hai câu hỏi trong một hình.
- **Chart 2 - Stacked bar theo ngày**: 7 cột, màu theo `CATEGORY_COLOR`.
- **Chart 3 - Heatmap 24h × ngày**: trục dọc giờ trong ngày, trục ngang ngày.
  Đây là chart lộ ra OT tràn vào buổi tối và cuối tuần.
- **Coverage indicator**: `coverage()` - nếu < 55% hiện cảnh báo rằng dữ liệu chưa đủ
  để kết luận.
- **Overlap indicator**: tổng giờ double-count.
- **Export**: nút export CSV và JSON, chọn khoảng thời gian (`Last 3 days`,
  `Last month`, `Custom from–to`). Tạo file client-side, không cần API.

### Ràng buộc
- Thư viện chart: Recharts. Phải đọc được trên màn hình rộng 375px.
- Query Firestore theo `logicalWeek` (tuần) hoặc range `logicalDate` (custom).
  Không kéo toàn bộ collection.
- Không dùng pie/donut ở vị trí chính - ít thông tin và sẽ sai khi có overlap.

### Xong khi
Mở Analytics trên iPhone, chọn This week, đọc được ngay category nào vượt/thiếu.
Export CSV mở được bằng Excel.

---

## Stage 6 - Polish

- Loading skeleton, empty state, error boundary cho mọi màn hình.
- Undo cho mọi hành động phá huỷ dữ liệu.
- Bảng edit dạng table cho desktop (sửa hàng loạt) - ưu tiên thấp.
- Kiểm tra Firestore free tier: read/write per day, tối ưu query nếu cần.
- **Tuỳ chọn**: PWA + Add to Home Screen qua Safari để có push notification thật.
  Chỉ làm nếu in-app reminder chứng minh là không đủ sau vài tuần dùng thật.
- Backup: cron export Firestore hàng tuần.

---

## Thứ tự bắt buộc

Stage 1 → 2 → 3 phải theo đúng thứ tự.
Stage 4 và 5 có thể làm song song sau khi xong Stage 3.
Stage 6 làm cuối.

Không nhảy sang stage sau khi tiêu chí "Xong khi" của stage hiện tại chưa đạt.
