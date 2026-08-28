# STAGE 6 — Weekly Review & hardening

> Stage cuối. Plan này viết cho một AI coding agent thực thi.
> Sau mỗi task có mục **Verify** — phải pass mới đi tiếp.
> Task 2 có quyết định về chi phí — **phải hỏi người dùng trước khi làm**.

---

## 0. Bối cảnh

Stage 1–5 đã xong. App ghi được, sửa được, nói được, đặt mục tiêu được, xem chart được.

Stage 6 làm ba việc:
1. **Đóng vòng lặp** — thêm khoảnh khắc nhìn lại tuần và quyết định tuần tới
2. **Làm cứng** — backup, quota, lỗi, bảo mật
3. **Tuỳ chọn** — PWA + push notification thật

Phần lớn nội dung polish của roadmap gốc đã được làm ở Stage 4.5/4.6.

### KHÔNG làm ở Stage 6
- Tính năng mới ngoài Weekly Review
- Sửa `logi.ts` / `balance.ts` (trừ nội dung prompt trong `gemini-parse.ts`)

---

## Task 1 — Weekly Review

### Tại sao cần

Vòng lặp hiện đang hở. Bạn log → app tính lệch → hết. Việc chọn preset cho tuần mới
không bao giờ xảy ra chủ động, nó chỉ mặc định Normal.

Mà đó mới là điểm app tạo ra thay đổi hành vi: nhìn lại tuần vừa rồi, thấy Learn
thiếu 8h vì OT cuối tuần, rồi **chủ động** quyết tuần tới là Normal hay Deep Learn.
Không có bước này thì app chỉ là sổ ghi chép có biểu đồ đẹp.

### Kích hoạt
- Chủ nhật từ 19:00 trở đi (giờ logic) → banner ở màn Now: `Review your week` + nút
- Hoặc mở bất cứ lúc nào từ màn Targets
- Đã review tuần đó rồi → không hiện lại. Lưu cờ trong `weekTargets/{week}.reviewedAt`

### Ba màn, vuốt ngang

**Màn 1 — Tuần vừa rồi**
```
Week 35 · Aug 24–30

Learn      22.4h / 31h    −28%
Work       51.2h / 43h    +19%
Fitness     6.0h / 9h     −33%
Sleep      44.1h / 46.5h   −5%
Leisure     7.8h / 6h     +30%

Coverage 71%
```
Dùng lại component Balance bars của Stage 5, không viết lại.

**Màn 2 — Điều đáng chú ý**
Tối đa **hai** dòng, chọn theo thứ tự ưu tiên:
1. `weekendConflict()` nếu có
2. Deviation lớn nhất theo `|deltaHours|`
3. Coverage < 55%
4. Streak: `Crunch: 4 of the last 6 weeks`

Nêu số, không dạy đời. Không có gì đáng nói → `A balanced week.` rồi sang màn 3.

**Màn 3 — Tuần tới**
```
Set up week 36

[ Normal ]  [ Crunch ]  [ Deep Learn ]  [ Recovery ]

Carrying over: Learn +6.0h debt

[ Skip ]              [ Confirm ]
```
- Chọn preset → ghi `weekTargets` cho tuần **kế tiếp** (tạo trước, không đợi rollover)
- Hiện rõ phần nợ sẽ cộng vào
- `Skip` → để rollover xử lý như bình thường

### Ràng buộc
- Rollover ở Stage 4 vẫn phải chạy đúng kể cả khi đã tạo target tuần sau từ đây.
  `ensureWeekTarget` phải kiểm tra doc đã tồn tại thì không ghi đè.
- Toàn bộ trong một transaction, giữ tính idempotent.
- Review tuần cũ (mở lại từ Targets) → chỉ xem, không cho đổi preset tuần đã qua.

### Verify
Chạy review, chọn Deep Learn cho tuần sau, kiểm tra Firestore có doc tuần sau với
đúng preset và `debtApplied`. Sau đó chạy rollover → **không** ghi đè.

---

## Task 2 — PWA & push notification (CẦN QUYẾT ĐỊNH)

**Dừng và hỏi người dùng trước khi làm task này.**

### Được gì
- Nhắc 06:15 / 20:45 hiện ở màn khoá **kể cả khi không mở app**. Hiện tại nhắc
  in-app chỉ thấy khi đã mở — mà lúc đó thường là bạn đã nhớ rồi.
- Bỏ thanh địa chỉ Safari, được thêm ~15% chiều cao màn hình
- Quyền mic ổn định hơn giữa các phiên

### Mất gì
1. **Phải dùng Safari để Add to Home Screen.** iOS chỉ cho A2HS qua Safari, không
   qua Edge. Bạn đang dùng Edge — sẽ phải đổi, ít nhất cho lần cài đặt.
2. **Cần Firebase Blaze plan.** Cloud Functions (để gửi push theo lịch) yêu cầu
   Blaze — trả theo mức dùng, phải gắn thẻ. Mức dùng của app cá nhân gần như chắc
   chắn nằm trong hạn mức miễn phí, nhưng vẫn phải có thẻ.
   Vercel Hobby cron chỉ chạy **1 lần/ngày**, không đủ cho nhắc theo giờ.
3. Thêm service worker → thêm một tầng phải debug khi có lỗi cache.

### Nếu người dùng đồng ý
1. `manifest.json`: `display: standalone`, icon 192/512, `theme_color`
2. Service worker: chỉ xử lý push, **không** cache asset (tránh phiền phức phiên bản)
3. `Notification.requestPermission()` từ đúng một cú chạm của người dùng
4. FCM token lưu ở `users/{uid}/meta/fcm`
5. Cloud Function scheduled chạy mỗi 15 phút, kiểm tra ba điều kiện nhắc,
   gửi qua FCM
6. Dedupe: một loại nhắc chỉ gửi một lần mỗi ngày logic
7. **Giữ nguyên nhắc in-app** làm dự phòng — không xoá

### Nếu người dùng từ chối
Bỏ qua task này hoàn toàn. Nhắc in-app của Stage 4 vẫn hoạt động.
Ghi lại quyết định vào README để sau này khỏi bàn lại.

---

## Task 3 — Backup & an toàn dữ liệu

Sau một năm, đây là dữ liệu không thể tạo lại. Firestore free tier **không có backup
tự động**.

### Nhắc export
- Chủ nhật đầu tiên mỗi tháng → dòng nhắc ở màn Analytics:
  `Last export: 47 days ago` + nút Export
- Lưu `meta/lastExport` mỗi lần export thành công
- Chưa export bao giờ và có > 30 ngày dữ liệu → nhắc luôn

### Export toàn bộ
Thêm lựa chọn `All time` vào sheet export của Stage 5. Kèm cả `weekTargets` và
`meta/debt` để file tự đủ nghĩa.

### Import (chỉ để khôi phục)
Màn ẩn ở `/settings/restore`:
- Nhận file JSON đã export
- Hiện preview: số record, khoảng thời gian, số tuần
- **Chỉ thêm record chưa tồn tại** (đối chiếu theo `id`), không ghi đè, không xoá
- Yêu cầu gõ `RESTORE` để xác nhận

Không cần đẹp. Cần đúng.

### Verify
Export all-time → xoá vài record → import lại → record quay về, không tạo bản trùng.

---

## Task 4 — Quota & hiệu năng

### Kiểm tra quota Firestore
Free tier: **50k đọc/ngày**. Nghe nhiều nhưng subscription realtime có thể đốt nhanh.

Việc cần làm:
1. Đếm số listener đang chạy đồng thời. Mỗi màn hình có bao nhiêu `onSnapshot`?
2. Màn hình không hiển thị vẫn còn listener → phải `unsubscribe` khi unmount
3. Day strip ở History: xác nhận đúng **một** query mỗi tuần (Stage 4.5 Task 4)
4. Analytics: một query cho cả khoảng, không query từng ngày
5. `promoteScheduled` mỗi 30 giây — xác nhận chỉ query khi thật sự có record đến hạn

Ghi lại số đọc ước tính cho một ngày dùng bình thường. Vượt 20k/ngày là dấu hiệu
có listener bị rò.

### Hiệu năng
- Analytics với 1 tháng dữ liệu → load < 2s trên iPhone 11
- History đổi ngày → < 300ms (dữ liệu tuần đã cache)
- Không re-render toàn bộ danh sách khi timer nhảy mỗi giây — dùng `memo` cho
  session card, chỉ phần số đếm re-render

---

## Task 5 — Xử lý lỗi & trạng thái rỗng

Rà soát toàn bộ, bổ sung chỗ còn thiếu:

| Màn hình | Loading | Rỗng | Lỗi |
|---|---|---|---|
| Now | skeleton | ✓ đã có | error boundary |
| History | skeleton | ✓ đã có | error boundary |
| Targets | skeleton | tuần chưa có target → tự tạo | error boundary |
| Analytics | skeleton từng chart | ✓ Stage 5 | retry |

### Error boundary
Bọc mỗi route. Lỗi → hiện thông báo + nút Reload, **không** trang trắng.
Log lỗi ra console kèm ngữ cảnh (không kèm dữ liệu cá nhân).

### Trường hợp biên còn sót
- Đổi múi giờ thiết bị (đi công tác) → `logicalDate` tính theo giờ thiết bị.
  Chấp nhận, nhưng ghi rõ trong README.
- Đồng hồ thiết bị sai → timer hiện số âm. Chặn: `elapsed < 0` → hiện `0:00`.
- Session `scheduled` mà `startAt` đã qua 7 ngày → dọn thành `abandoned`.

---

## Task 6 — Chỉnh prompt theo lỗi thật

Sau khi dùng thật vài tuần, gom các câu voice bị parse sai.

Quy trình:
1. Ghi lại: câu nói → kết quả sai → kết quả mong muốn
2. Chỉ sửa **nội dung** `buildSystemPrompt()` trong `gemini-parse.ts`.
   Không đổi schema, không đổi model, không đổi ngưỡng confidence.
3. Chạy lại 10 câu test của Stage 3 để chắc không làm hỏng cái đang đúng
4. Ghi lại thay đổi vào README

Đây là task **lặp lại**, không có điểm kết thúc. Cứ vài tuần rà một lần.

---

## Task 7 — Rà soát bảo mật

Checklist cuối:

- [ ] `git log -p | grep -i "private_key\|api_key\|BEGIN PRIVATE"` → không có gì
- [ ] Không biến `NEXT_PUBLIC_*` nào chứa secret
- [ ] Firestore rules: thử đọc `users/{uid khác}` → bị từ chối
- [ ] `/api/parse` từ chối request không có session cookie
- [ ] Rate limit `/api/parse` hoạt động
- [ ] Allowlist chặn được email khác
- [ ] Session cookie `httpOnly`, `secure`, `sameSite: lax`
- [ ] Không có audio nào được ghi ra disk hay Storage
- [ ] Không `console.log` dữ liệu cá nhân ở production
- [ ] Firebase Console → Authorized domains chỉ có domain thật

---

## Task 8 — Bảng sửa hàng loạt cho desktop (tuỳ chọn)

**Ưu tiên thấp nhất.** Chỉ làm nếu bảy task trên đã xong và bạn thấy cần.

`/history?view=table` trên màn ≥ 1024px:
- Bảng: date, category, start, end, duration, source
- Sắp xếp, lọc theo category
- Sửa tại chỗ, chọn nhiều dòng để xoá
- Mobile không bao giờ hiện chế độ này

Thực tế nếu voice và timeline hoạt động tốt thì bạn sẽ không cần đến nó.

---

## Task 9 — Kiểm thử cuối

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Chủ nhật 19:00 | Banner Review hiện |
| 2 | Chạy Weekly Review | Ba màn, chọn preset tuần sau |
| 3 | Sau review, chạy rollover | Không ghi đè target vừa chọn |
| 4 | Review lại tuần đã review | Không hiện banner nữa |
| 5 | Export all-time | File đủ activities + weekTargets + debt |
| 6 | Xoá record, import lại | Quay về, không trùng |
| 7 | Dùng app 1 ngày bình thường | Số đọc Firestore < 20k |
| 8 | Analytics 1 tháng | Load < 2s |
| 9 | Timer chạy 10 phút | Không re-render cả danh sách |
| 10 | Ngắt mạng giữa chừng ở mọi màn | Không trang trắng |
| 11 | Chỉnh đồng hồ máy lùi | Timer hiện 0:00, không số âm |
| 12 | Rà soát bảo mật | 10/10 mục pass |
| 13 | (Nếu làm PWA) A2HS qua Safari | Chạy standalone, nhận được push |

---

## Definition of Done

- [ ] Weekly Review hoạt động, không phá rollover
- [ ] Quyết định về PWA đã chốt và ghi lại
- [ ] Export all-time + import khôi phục hoạt động
- [ ] Nhắc export hàng tháng
- [ ] Số đọc Firestore < 20k/ngày, không listener rò
- [ ] Error boundary ở mọi route
- [ ] Rà soát bảo mật 10/10
- [ ] `npm test` xanh, typecheck sạch, build OK
- [ ] 12/12 (hoặc 13/13 nếu làm PWA) mục Task 9 pass

---

## Sau Stage 6

Dự án coi như xong. Việc còn lại là bảo trì:

- **Hàng tuần**: chạy Weekly Review, đặt preset tuần tới
- **Hàng tháng**: export backup
- **Vài tuần một lần**: rà lỗi voice, chỉnh prompt (Task 6)
- **Sau 3 tháng dùng thật**: xem lại `BASELINE_DAILY` trong `logi.ts`. Nếu dữ liệu
  cho thấy baseline không phản ánh đời thật (VD Learn cuối tuần 8h/ngày chưa bao giờ
  đạt) thì sửa con số — nhưng sửa vì có bằng chứng, không phải vì tuần này bận.

Đây là lần duy nhất được sửa `logi.ts`, và chỉ sau khi có ít nhất 8 tuần dữ liệu
với coverage > 60%.

---

## Quy tắc cho agent

**Dừng và hỏi khi:**
- Task 2 — **luôn hỏi trước**, vì liên quan chi phí và phải đổi browser
- Số đọc Firestore vượt xa dự kiến và cần đổi kiến trúc query

**Không được:**
- Làm Task 2 mà chưa được đồng ý
- Ghi đè `weekTargets` đã tồn tại
- Cho import xoá hay ghi đè dữ liệu hiện có
- Đổi schema, model, hay ngưỡng confidence khi chỉnh prompt
- Sửa `logi.ts` / `balance.ts`
- Thêm tính năng mới ngoài Weekly Review
