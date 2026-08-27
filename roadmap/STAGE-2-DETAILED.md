# STAGE 2 — Core Tracking

> Plan này viết cho một AI coding agent thực thi. Làm đúng thứ tự task.
> Sau mỗi task có mục **Verify** — phải pass mới đi tiếp.
> Nếu gặp mâu thuẫn hoặc thiếu thông tin, **DỪNG và hỏi người dùng**, không tự đoán.

---

## 0. Bối cảnh

Stage 1 đã xong: project chạy, đăng nhập được, có `AuthContext`, bottom nav 3 tab,
Firestore rules đã deploy.

Stage 2 làm **ghi nhận hoạt động bằng tay** — đầy đủ và đáng tin, trước khi đụng
tới AI. Mọi thứ ở Stage 3 (voice) sẽ gọi lại đúng repository layer viết ở đây, nên
tầng này phải chắc.

### KHÔNG làm ở Stage 2
- Voice, MediaRecorder, gọi Gemini, `/api/parse`
- Chart, analytics, export
- Target UI, preset, debt, deviation banner, reminder
- PWA, push notification

Nếu agent thấy `gemini-parse.ts` trong `src/lib/` thì cứ để yên, chưa dùng.

### Nhắc lại ràng buộc bất biến
1. Logical day cắt **04:00**. Mọi ghi/đọc đi qua `logicalDate()` / `logicalWeek()`.
2. Timer là **derived state**: luôn `now - startAt`. Không counter cộng dồn.
3. **Nhiều session chạy song song là hợp lệ.** Không auto-stop.
4. Không hard-delete tự động. Session > 15h → `status: 'abandoned'`, hỏi lại.
5. Không sửa `logi.ts` / `balance.ts` (trừ dòng import).

---

## Task 1 — Repository layer

Tạo `src/lib/activities.ts` — **toàn bộ** thao tác Firestore với activity đi qua đây.
Không component nào được gọi thẳng `addDoc` / `updateDoc`.

Đường dẫn: `users/{uid}/activities/{id}`

### Hàm bắt buộc

```ts
startActivity(uid, input: { category, label?, startAt? }): Promise<string>
stopActivity(uid, id, endAt?: number): Promise<void>
updateActivity(uid, id, patch: Partial<Activity>): Promise<void>
deleteActivity(uid, id): Promise<void>
createPastActivity(uid, input: { category, label?, startAt, endAt }): Promise<string>

subscribeActive(uid, cb: (a: Activity[]) => void): Unsubscribe
subscribeByDate(uid, logicalDate: string, cb): Unsubscribe
listStale(uid): Promise<Activity[]>
```

### Quy tắc dẫn xuất field — QUAN TRỌNG NHẤT

Có một hàm duy nhất tính các field dẫn xuất, và **mọi** đường ghi đều phải gọi nó:

```ts
function derive(startAt: number, endAt: number | null) {
  return {
    logicalDate: logicalDate(startAt),
    logicalWeek: logicalWeek(startAt),
    durationMin: endAt ? Math.round((endAt - startAt) / 60000) : null,
  };
}
```

`logicalDate` và `logicalWeek` luôn tính từ **`startAt`**, không phải `endAt`.
Giấc ngủ bắt đầu 22:00 thứ Hai thuộc về thứ Hai, kể cả khi kết thúc 04:30 thứ Ba.

Sửa `startAt` mà quên tính lại `logicalDate`/`logicalWeek` là lỗi âm thầm nguy hiểm
nhất ở stage này: record vẫn hiện đúng ở màn hình History nhưng biến mất khỏi thống
kê tuần. Vì vậy `updateActivity` phải **luôn** chạy lại `derive()` khi patch có chứa
`startAt` hoặc `endAt`.

### Validation trước khi ghi

Firestore rules đã chặn ở tầng DB, nhưng client phải validate trước để báo lỗi
dễ hiểu thay vì để rules ném `permission-denied` khó hiểu:

- `endAt > startAt` — nếu không, throw `"End time must be after start time"`
- `endAt - startAt <= 15h` — throw `"Session cannot exceed 15 hours"`
- `startAt` không quá 7 ngày trong quá khứ — throw `"Cannot log more than 7 days back"`
- `startAt` không ở tương lai (trừ khi `status === 'scheduled'`)
- `category` nằm trong `CATEGORIES`

### Giá trị mặc định khi tạo
```
status: 'active'   (hoặc 'done' nếu là createPastActivity)
source: 'manual'
confidence: null
rawText: null
label: input.label ?? null
createdAt / updatedAt: Date.now()
```

### Chống tạo trùng
`startActivity` phải kiểm tra: nếu đã có session `active` cùng `category` → throw
`"Already tracking {category}"`. UI bắt lỗi này và hiện toast, không phải crash.

Ngoài ra nút Start phải disable trong lúc request đang bay — double-tap trên mobile
rất dễ xảy ra.

### Verify
Viết một script tạm hoặc dùng dev console: tạo activity, stop, sửa `startAt` sang
ngày khác → kiểm tra trong Firebase Console thấy `logicalDate` và `logicalWeek`
đã đổi theo, `durationMin` khớp.

---

## Task 2 — Hook đọc dữ liệu

`src/hooks/useActivities.ts` — `'use client'`

### `useActiveActivities()`
Bọc `subscribeActive`. Trả `{ activities, loading, hasPendingWrites }`.

`hasPendingWrites` lấy từ `snapshot.metadata.hasPendingWrites` — dùng để hiện chỉ báo
"đang chờ sync" khi offline. Không có nó thì lúc mất mạng người dùng không biết
thao tác đã được ghi nhận hay chưa.

### `useDayActivities(logicalDate: string)`
Bọc `subscribeByDate`. Trả thêm `totals: Record<Category, number>` (giờ) tính bằng
`actualHours()` từ `balance.ts`, và `overlap: number` từ `overlapHours()`.

### `useElapsed(startAt: number): number`
Trả số **giây** đã trôi qua.

```ts
// setInterval 1s CHỈ để trigger re-render.
// Giá trị luôn tính lại từ Date.now() - startAt, không cộng dồn.
// Bắt buộc sync lại khi tab quay lại foreground: iOS throttle mạnh timer
// ở background, thiếu listener này thì mở app lên timer sẽ đứng ở giá trị cũ.
useEffect(() => {
  const tick = () => setNow(Date.now());
  const iv = setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
  return () => { clearInterval(iv); /* remove listeners */ };
}, []);
```

### Verify
Mở app, start một session, khoá màn hình 3 phút, mở lại → timer nhảy ngay tới đúng
giá trị, không đứng im rồi mới chạy tiếp.

---

## Task 3 — Màn hình Now

`src/app/(main)/now/page.tsx`

Đây là màn hình dùng nhiều nhất. Ưu tiên: thao tác trong 1 chạm, không cần cuộn để
bấm Stop.

### Bố cục từ trên xuống

**1. Header** — ngày logic hôm nay + nút Sign out.

Hiển thị ngày logic, không phải ngày lịch. Lúc 02:00 sáng thứ Ba app phải ghi
"Monday" — nếu hiện "Tuesday" thì người dùng sẽ tưởng app ghi sai.

**2. Stack session đang chạy** (nếu có)

Mỗi session một card:
```
┌──────────────────────────────┐
│ ● WORK                       │
│   devops                     │   ← label, ẩn nếu null
│   Started 8:00 AM            │
│   2:41:07                    │   ← timer, font to, tabular-nums
│                     [ Stop ] │
└──────────────────────────────┘
```
- Viền trái màu theo `CATEGORY_COLOR`
- Chấm tròn nhấp nháy nhẹ để báo đang chạy
- Timer dùng `font-variant-numeric: tabular-nums`, nếu không số sẽ nhảy qua lại
  mỗi giây trông rất khó chịu
- Nút Stop đủ lớn (min 44×44px theo chuẩn chạm của iOS)

Có ≥ 2 session → hiện dòng nhỏ phía dưới:
`"2 running in parallel · 0.8h overlap"`

**3. Lưới 5 nút Start**

Grid 2 cột (hàng cuối 1 nút chiếm hết chiều ngang), mỗi ô cao ≥ 72px:
`Learn · Work · Fitness · Sleep · Leisure`

- Category đang chạy → nút đổi trạng thái (mờ + chữ "Running"), bấm vào cuộn tới
  card tương ứng thay vì tạo mới.
- Long-press một nút → mở sheet "Start with adjusted time" cho phép chọn
  "started 5 / 15 / 30 minutes ago". Rất hay dùng vì thường người dùng nhớ ra
  phải bấm Start sau khi đã bắt đầu làm.

**4. Tổng hôm nay**

Dòng gọn: `Today: Work 6.2h · Learn 1.5h · Fitness 0h` — chỉ hiện category > 0.

### Trạng thái rỗng
Chưa có session nào → dòng chữ nhạt "Nothing tracked yet. Tap a category to start."

### Verify
Start Work, start Learn cùng lúc → hai card cùng hiện, dòng overlap hiện đúng.
Bấm Work lần nữa → không tạo trùng.

---

## Task 4 — Stale session recovery

`src/components/StaleSessionModal.tsx`

Chạy `listStale()` khi màn hình Now mount và mỗi lần app quay lại foreground.

Session `active` quá 15h → modal chặn (không dismiss được bằng cách bấm ra ngoài):

```
Unfinished session

WORK started Monday 8:00 AM — 19 hours ago.
When did you actually stop?

  [ 5:00 PM ]   [ 10:00 PM ]   [ Custom… ]

  [ Discard this session ]
```

- Các nút gợi ý lấy từ `suggestedEndTimes(activity)` trong `balance.ts`
- Chọn giờ → `stopActivity(uid, id, ts)` với `endAt` đã chọn
- "Discard" → `updateActivity(..., { status: 'abandoned' })`. **Không xoá.**
  Dữ liệu bị bỏ vẫn có giá trị chẩn đoán sau này.
- Nhiều session stale → xử lý lần lượt từng cái

### Verify
Sửa tay một record trong Firebase Console cho `startAt` lùi 20h và `status: 'active'`
→ mở app thấy modal hiện đúng.

---

## Task 5 — Timeline view (History)

`src/app/(main)/history/page.tsx`

**Không dùng bảng.** Bảng trên màn hình 375px là không dùng được, và không thấy được
khoảng trống chưa log.

### Chọn ngày
Dải ngày ngang cuộn được, 7 ngày gần nhất + nút mở date picker. Mặc định hôm nay.
Ngày có dữ liệu hiện chấm nhỏ bên dưới.

### Trục thời gian
Dọc, từ **04:00 đến 04:00 hôm sau** (đúng ranh giới ngày logic). Vạch giờ mỗi 2 tiếng.
Chiều cao gợi ý: 60px cho mỗi giờ → tổng 1440px, cuộn dọc. Tự cuộn tới 06:00 khi mở
để không phải cuộn qua khoảng đêm trống.

### Thuật toán xếp lane khi block chồng nhau

Vì cho log song song nên block chồng nhau là chuyện thường. Xếp theo lane:

```
1. Sắp xếp activity theo startAt tăng dần
2. Với mỗi activity, tìm lane đầu tiên có lastEnd <= startAt của nó
3. Không tìm được → tạo lane mới
4. Tổng số lane = số cột; mỗi block rộng (100% / laneCount)
5. Block đặt ở cột thứ laneIndex
```

Đa số ngày chỉ có 1 lane (full width). Ngày có overlap tự chia 2–3 cột.

**Không** dùng `position: absolute` với `z-index` chồng lên nhau — block sẽ che nhau
và không bấm được cái bên dưới.

### Block
- Cao tỉ lệ với thời lượng, **tối thiểu 24px** kể cả session 5 phút
- Nền là `CATEGORIES_COLOR` với alpha thấp, viền trái đậm
- Nội dung: tên category + label + `8:00–11:00 · 3h`
- Block < 40px → chỉ hiện category, ẩn phần còn lại
- `status: 'abandoned'` → hiện gạch chéo mờ, có nhãn "abandoned"

### Khoảng trống
Khoảng > 30 phút không có activity nào → hiện vùng gạch nhạt với chữ "untracked"
và thời lượng. Đây là thông tin có ích: nhìn phát thấy ngay mình hay quên log lúc nào.

### Tóm tắt đầu trang
`Tracked 14.2h · Untracked 9.8h · Overlap 0.5h` + thanh mini stacked bar theo category.

### Verify
Tạo 2 activity chồng thời gian nhau → hiện thành 2 cột, cả hai đều bấm được.

---

## Task 6 — Sửa & thêm record

### Bottom sheet
Tap một block → sheet trượt lên từ dưới:

```
WORK  ▾                    ← dropdown 5 category
Label: devops              ← text input, optional
Start: Aug 26, 8:00 AM     ← tap mở time picker
End:   Aug 26, 11:00 AM
Duration: 3h 0m            ← readonly, tự tính lại

[ Delete ]          [ Save ]
```

- Đổi `start` hoặc `end` → `duration` cập nhật ngay khi gõ
- Validate trực tiếp trong sheet, hiện lỗi đỏ dưới field sai, disable Save
- Save → `updateActivity()` (nhớ: hàm này tự chạy lại `derive()`)
- Delete → confirm 1 bước → `deleteActivity()` + toast **Undo 5 giây**

### Undo
Giữ bản sao activity trong state; bấm Undo thì `createPastActivity()` lại. Xoá nhầm
trên mobile rất dễ nên bước này không được bỏ.

### Thêm thủ công
Nút `+` góc trên phải màn hình History → cùng sheet nhưng trống, `start`/`end` mặc
định là giờ hiện tại làm tròn. Bắt buộc phải có ở Stage 2 vì chưa có voice.

### Đổi ngày
Nếu sửa `startAt` sang ngày khác, sau khi save phải hiện toast
`"Moved to Aug 25"` — nếu không người dùng sẽ tưởng record biến mất.

### Verify
Sửa một record từ 8:00 sang 23:30 hôm trước → record chuyển sang ngày đúng,
`logicalDate` trong Firebase Console đổi theo, toast hiện.

---

## Task 7 — Offline

Persistence đã bật ở Stage 1. Stage 2 chỉ cần làm cho nó *nhìn thấy được*:

- `navigator.onLine` + sự kiện `online`/`offline` → banner mảnh trên cùng:
  `"Offline — changes will sync"`
- `hasPendingWrites` → chấm nhỏ trên card đang chờ sync
- Start/Stop khi offline vẫn phải chạy bình thường (Firestore tự queue)
- **Không** chặn UI hay hiện spinner vô hạn khi mất mạng

### Verify
Bật chế độ máy bay → Start Work → thấy banner + chấm pending → tắt máy bay →
chấm biến mất, mở Firebase Console thấy record đã lên.

---

## Task 8 — Chi tiết mobile

Những thứ dễ bỏ sót nhưng ảnh hưởng trực tiếp tới việc dùng hàng ngày:

- Vùng chạm tối thiểu 44×44px cho mọi nút
- `padding-bottom: env(safe-area-inset-bottom)` cho bottom sheet và nav
- Input `font-size` ≥ 16px, nếu nhỏ hơn iOS Safari tự zoom khi focus
- `-webkit-tap-highlight-color: transparent` + trạng thái `:active` tự làm
- `touch-action: manipulation` để bỏ độ trễ 300ms
- Timeline cuộn mượt, không giật khi có nhiều block
- Bottom sheet vuốt xuống để đóng
- `overscroll-behavior: contain` cho sheet, tránh cuộn lan ra trang nền

---

## Task 9 — Kiểm thử trên iPhone 11

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Start Work | Card hiện, timer chạy từ 0 |
| 2 | Khoá máy 10 phút, mở lại | Timer hiện đúng ~10:00, không đứng |
| 3 | Start thêm Learn | 2 card, dòng overlap hiện |
| 4 | Bấm Work lần nữa | Không tạo trùng, có thông báo |
| 5 | Stop Work | Card biến mất, record vào History |
| 6 | Long-press Fitness → "15 min ago" | Session tạo với startAt lùi 15 phút |
| 7 | History: tap block, sửa giờ kết thúc | Duration cập nhật, block co lại |
| 8 | Xoá record rồi bấm Undo | Record quay lại y nguyên |
| 9 | Thêm thủ công một record hôm qua | Hiện đúng ngày hôm qua |
| 10 | Start Sleep 22:00, stop 04:30 hôm sau | Nằm ở ngày **hôm trước** trong History |
| 11 | Chế độ máy bay: Start → Stop | Chạy được, banner offline hiện |
| 12 | Tắt máy bay | Sync xong, chấm pending biến mất |
| 13 | Tạo 2 record chồng giờ | Timeline chia 2 cột, cả hai bấm được |
| 14 | Session giả 20h (sửa ở Console) | Modal recovery hiện khi mở app |
| 15 | Ngày trống | Empty state, không crash |

Test 2 và 10 là hai bài quan trọng nhất. Test 2 chứng minh timer là derived state.
Test 10 chứng minh logical day hoạt động — nếu giấc ngủ hiện ở ngày hôm sau thì
toàn bộ analytics ở Stage 5 sẽ sai.

---

## Definition of Done — Stage 2

- [ ] `npx tsc --noEmit` sạch, `npm run build` thành công
- [ ] Mọi thao tác Firestore đi qua `src/lib/activities.ts`
- [ ] `derive()` được gọi ở mọi đường ghi, không có ngoại lệ
- [ ] Timer không dùng counter cộng dồn ở bất kỳ đâu
- [ ] Nhiều session song song chạy đúng, overlap hiển thị
- [ ] Timeline xếp lane đúng khi block chồng nhau
- [ ] Sửa / xoá / undo / thêm thủ công đều hoạt động
- [ ] Stale recovery hoạt động, không hard-delete
- [ ] Offline hoạt động và nhìn thấy được trạng thái
- [ ] 15/15 mục Task 9 pass trên iPhone thật

---

## Báo cáo khi xong

1. Cây thư mục các file mới/sửa
2. Chữ ký đầy đủ của các hàm trong `src/lib/activities.ts`
3. Kết quả 15 mục kiểm thử
4. Ảnh chụp màn hình Now và History trên mobile
5. Chỗ nào lệch so với plan, kèm lý do

---

## Quy tắc cho agent

**Dừng và hỏi khi:**
- Firestore rules từ chối một thao tác hợp lệ (có thể rules cần bổ sung, đừng tự nới)
- Không rõ nên xử lý ra sao với một edge case về thời gian
- Cần thêm dependency ngoài những gì đã có

**Không được:**
- Auto-stop session cũ khi start session mới
- Dùng `setInterval` cộng dồn cho timer
- Hard-delete session quá hạn
- Tính `logicalDate` từ `endAt`
- Làm bảng dạng table cho History trên mobile
- Sửa `logi.ts` / `balance.ts`
- Làm sớm tính năng Stage 3+
