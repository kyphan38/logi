# STAGE 3 — Voice & AI

> Plan này viết cho một AI coding agent thực thi. Làm đúng thứ tự task.
> Sau mỗi task có mục **Verify** — phải pass mới đi tiếp.
> Nếu gặp mâu thuẫn hoặc thiếu thông tin, **DỪNG và hỏi người dùng**, không tự đoán.

---

## 0. Bối cảnh

Stage 2 đã xong: repository layer `activities.ts`, màn hình Now với session song song,
timeline History, sheet sửa/thêm record, offline, 46 test tự động.

Stage 3 thêm **giọng nói**. Nguyên tắc kiến trúc quan trọng nhất:

> API route chỉ **parse** và trả về JSON. Việc **ghi** Firestore vẫn đi qua
> `src/lib/activities.ts` ở phía client, y như Stage 2.

Không viết đường ghi thứ hai ở server. Có hai đường ghi thì `derive()` sẽ bị bỏ sót
ở một trong hai, và dữ liệu lệch âm thầm.

### KHÔNG làm ở Stage 3
- Chart, analytics, export (Stage 5)
- Target UI, preset, debt, deviation banner, reminder (Stage 4)
- Push notification, PWA

---

## PHẦN A — Carry-over từ Stage 2

Bốn việc phải xong **trước** khi bắt đầu phần voice.

### A1 — Deploy production (BLOCKER)

`getUserMedia` chỉ hoạt động trong **secure context**: HTTPS hoặc `localhost`.
Địa chỉ LAN `http://192.168.1.29:3000` trên iPhone **không phải** secure context —
mic bị từ chối, không có cách lách. Trên laptop `localhost` vẫn chạy, nên lỗi này
chỉ lộ ra khi test trên điện thoại.

Việc cần làm:
1. Hỏi người dùng URL repo GitHub, `git remote add`, push.
2. Import vào Vercel, nạp **toàn bộ** env var (kể cả `GEMINI_API_KEY` mới, xem A4).
3. Deploy.
4. Firebase Console → Authentication → Settings → Authorized domains → thêm domain
   Vercel. Bỏ bước này thì login lỗi `auth/unauthorized-domain`.
5. Chạy đủ 12 mục kiểm thử của Stage 1 Task 12 trên iPhone thật.
6. Chạy đủ 15 mục kiểm thử của Stage 2 Task 9 trên iPhone thật.

**Cho vòng lặp dev**: dùng `cloudflared tunnel --url http://localhost:3000` hoặc
`ngrok http 3000` để có HTTPS trỏ về máy local. Nhớ thêm domain tunnel vào
Authorized domains nữa.

Không đi tiếp khi chưa có URL HTTPS mở được trên iPhone.

### A2 — Sửa lỗi sleep bị cắt mất trên timeline

Session ngủ 22:00 → 06:00 thuộc `logicalDate` hôm trước. Timeline hiện 04:00→04:00
nên phần 04:00–06:00 bị cắt (`clippedEnd`). Ngày hôm sau cũng không hiện vì record
không thuộc ngày đó. Kết quả: **2 tiếng vô hình ở cả hai ngày**.

Dữ liệu không sai (`durationMin` vẫn đủ), nhưng heatmap ở Stage 5 sẽ thủng lỗ.

Cách sửa: `subscribeByDate` / `layoutDay` nhận thêm activity của **ngày logic liền
trước** có `endAt` vượt quá 04:00 của ngày đang xem, và vẽ phần thừa đó ở đầu
timeline với cờ `continuedFromPrevious` (viền đứt, nhãn "cont. from Aug 25").

Ngược lại, phần bị cắt ở cuối giữ nguyên cờ `clippedEnd` như hiện tại.

**Verify**: tạo record Sleep 22:00 hôm qua → 06:00 hôm nay. Mở timeline hôm qua thấy
block từ 22:00 tới 04:00 với cờ clipped. Mở timeline hôm nay thấy block 04:00–06:00
với nhãn "cont.".

### A3 — Bổ sung repository

Thêm vào `src/lib/activities.ts`:

```ts
listRecent(uid, n = 5): Promise<Activity[]>
// status IN ['done','active'], orderBy startAt DESC, limit n
// Dùng làm context cho prompt Gemini

promoteScheduled(uid): Promise<number>
// status === 'scheduled' && startAt <= now  →  chuyển sang 'active'
// Trả về số record đã chuyển

subscribeScheduled(uid, cb): Unsubscribe
// status === 'scheduled', orderBy startAt ASC
```

`status: 'scheduled'` đã có trong type từ Stage 1 nhưng chưa được xử lý ở đâu cả.
Stage 3 dùng nó cho delayed start.

Cần index Firestore mới: `status ASC, startAt ASC`. Deploy lại
`firebase deploy --only firestore:indexes`.

Kiểm tra `firestore.rules` đã cho `status: 'scheduled'` — có rồi, không cần sửa.
Nhưng rules đang yêu cầu `startAt` hợp lệ; xác nhận record scheduled với `startAt`
tương lai không bị chặn.

### A4 — Gemini API key

1. Người dùng lấy key ở https://aistudio.google.com/apikey
2. Thêm `GEMINI_API_KEY=` vào `.env.local` và Vercel env
3. **Không** có tiền tố `NEXT_PUBLIC_`
4. Thêm vào `.env.example` với giá trị rỗng

**Verify**: `grep -rn "GEMINI" src/ | grep -i "NEXT_PUBLIC"` không ra kết quả.

---

## PHẦN B — Voice

### Task 1 — Ghi âm

`src/hooks/useRecorder.ts` — `'use client'`

```ts
useRecorder(): {
  state: 'idle' | 'requesting' | 'recording' | 'processing';
  start(): Promise<void>;
  stop(): Promise<{ base64: string; mimeType: string; durationMs: number } | null>;
  cancel(): void;
  level: number;   // 0..1, cho waveform
  error: string | null;
}
```

#### Ràng buộc iOS — làm sai là hỏng

**Mime type**: dùng `pickAudioMime()` đã có sẵn trong `gemini-parse.ts`. iOS WebKit
**không hỗ trợ `audio/webm`**; gọi `MediaRecorder` với webm sẽ ném lỗi ngay. Trên
iPhone sẽ ra `audio/mp4`.

**Giải phóng mic**: sau khi `stop()`, bắt buộc
```ts
stream.getTracks().forEach(t => t.stop());
```
Thiếu dòng này thì chấm cam trên thanh trạng thái iOS không tắt, và lần ghi sau
có thể bị kẹt. Đây là lỗi rất hay gặp.

**User gesture**: `getUserMedia` phải được gọi trong cùng tick với thao tác chạm.
Không gọi trong `useEffect` hay sau `await` của việc khác.

**Giới hạn**: tự dừng sau **30 giây**. Bỏ luôn bản ghi < 400ms (chạm nhầm).

**Chuyển base64**: dùng `FileReader.readAsDataURL` rồi cắt phần sau dấu phẩy.
Bản ghi 30s mp4 khoảng 300–500KB → base64 khoảng 600KB, dưới giới hạn 4.5MB body
của Vercel.

**Không lưu audio**: blob chỉ tồn tại trong biến local, gán `null` sau khi gửi.
Không ghi disk, không lên Storage, không `console.log` ở production.

#### Lỗi cần xử lý
| Lỗi | Xử lý |
|---|---|
| `NotAllowedError` | "Microphone access denied. Enable it in Settings → Safari → Microphone." |
| `NotFoundError` | "No microphone found." |
| Không phải HTTPS | "Voice requires a secure connection." |
| `MediaRecorder` undefined | Ẩn hẳn nút mic, chỉ còn nhập tay |

**Verify**: trên iPhone qua HTTPS, ghi 3 giây, kiểm tra `mimeType` ra `audio/mp4`
và chấm cam tắt sau khi dừng.

---

### Task 2 — Nút mic

`src/components/MicButton.tsx`

FAB tròn nổi phía trên bottom nav ở màn hình Now.

**Tương tác giữ-để-nói**:
- `pointerdown` → `start()`
- `pointerup` / `pointercancel` → `stop()`
- `touch-action: none` và `onContextMenu={e => e.preventDefault()}` — nếu không,
  iOS sẽ hiện menu copy/paste khi giữ lâu
- Vuốt lên rồi thả → `cancel()` (huỷ, không gửi). Hiện "Release to cancel" khi đang
  ở vùng huỷ.

**Trạng thái hiển thị**:
| State | Giao diện |
|---|---|
| idle | Icon mic |
| requesting | Spinner |
| recording | Nút phình to, vòng đỏ nhấp nháy, waveform từ `level`, đếm giây |
| processing | Spinner + "Thinking…" |

`level` lấy từ `AudioContext` + `AnalyserNode`. Trên iOS phải `resume()` AudioContext
trong user gesture, nếu không nó ở trạng thái `suspended` và waveform đứng im.

Có haptic thì tốt: `navigator.vibrate?.(10)` lúc bắt đầu ghi (Android; iOS bỏ qua).

---

### Task 3 — API route parse

`src/app/api/parse/route.ts`

```
POST /api/parse
Body: { audio?: string, mimeType?: string, text?: string, requestId: string }
Trả:  ParseResult (đã định nghĩa trong gemini-parse.ts)
```

#### Trình tự
1. `requireSessionUser()` từ `server-auth.ts`. Không có → `401`.
2. Kiểm tra kích thước body. Audio base64 > 6MB → `413`.
3. **Rate limit**: tối đa 30 request / 5 phút cho mỗi uid. Dùng Map trong module scope
   (đủ cho một người dùng; serverless có thể reset nhưng không sao). Vượt → `429`.
4. Đọc context từ Firestore bằng **Admin SDK**:
   - `listActive` — session đang chạy
   - `listRecent(5)` — activity gần đây
5. `buildSystemPrompt({ nowISO, weekday, activeActivities, recentActivities })`
   — hàm đã có sẵn trong `gemini-parse.ts`.
6. Có `audio` → `parseAudio()`. Có `text` → `parseTextCorrection()`.
7. **Sanitize kết quả** (xem dưới).
8. Trả `ParseResult`.

#### Sanitize — bắt buộc, không được bỏ

LLM có thể trả về dữ liệu vô lý. Server phải lọc trước khi trả cho client:

- `category` không nằm trong `CATEGORIES` → set `null`, `intent = 'clarify'`
- `startAt` / `endAt` parse không ra ngày hợp lệ → `null`
- `startAt` quá 7 ngày trước → `intent = 'clarify'`
- `startAt` xa hơn 24h trong tương lai → `intent = 'clarify'`
- `endAt <= startAt` → bỏ `endAt`
- `endAt - startAt > 15h` → `intent = 'clarify'`, kèm câu hỏi xác nhận
- `confidence` không thuộc `[0,1]` → `0`
- `targetActivityId` không nằm trong danh sách active/recent vừa đọc → `null`
- Cắt `transcript` và `label` tối đa 200 ký tự

Chuyển timestamp về epoch ms trước khi trả về, để client khỏi phải parse ISO lần nữa.

#### `vercel.json`
`maxDuration: 30` đã có từ Stage 1. Xác nhận pattern `src/app/api/**/*.ts` phủ được
route mới.

#### Lỗi
Gemini timeout hoặc trả rác → `502` với `{ error: "Could not understand that" }`.
Client hiện toast + mở sheet nhập tay. **Luôn phải có đường lui.**

**Verify**: gọi bằng curl với text đơn giản, kiểm tra `401` khi không có cookie.

---

### Task 4 — Confirmation card

`src/components/ParseConfirmCard.tsx`

Đây là **tầng chống lỗi quan trọng nhất** của Stage 3. Giết khoảng 80% lỗi voice.

```
┌──────────────────────────────┐
│  ● WORK          ▾           │  ← dropdown 5 category
│    devops                    │  ← tap để sửa label
│                              │
│  8:00 AM → 11:00 AM          │  ← tap mở time picker
│  3h 0m                       │
│                              │
│  "worked on devops from…"    │  ← transcript, chữ nhạt
│                              │
│  [ Cancel ]      [ Confirm ] │
└──────────────────────────────┘
```

#### Ngưỡng confidence
| Điều kiện | Hành vi |
|---|---|
| `≥ 0.85` và đủ field | Ghi luôn + toast **Undo 5 giây** |
| `< 0.85` | Hiện card, bắt buộc bấm Confirm |
| Thiếu `category` hoặc `startAt` | Hiện card, highlight đỏ field thiếu |
| `intent === 'clarify'` | Hiện card dạng câu hỏi (Task 5) |

`AUTO_COMMIT_THRESHOLD` đã có sẵn trong `gemini-parse.ts`.

#### Ghi dữ liệu
Gọi hàm của `activities.ts` — **không** viết đường ghi mới:
- `intent: 'start'` → `startActivity(uid, { category, label, startAt })`
- `intent: 'log_past'` → `createPastActivity(uid, {...})`
- `intent: 'stop'` → `stopActivity(uid, targetActivityId, endAt)`
- `intent: 'schedule'` → `startActivity` với `status: 'scheduled'`
- `intent: 'edit'` → `updateActivity(uid, targetActivityId, patch)`

Ghi kèm `source: 'voice'`, `confidence`, `rawText: transcript`.

Bọc trong `capWait()` như Stage 2 để không kẹt UI khi offline.

#### Chống ghi trùng
`requestId` (UUID sinh ở client) lưu trong một Set; đã xử lý rồi thì bỏ qua.
Mạng chậm, người dùng bấm Confirm hai lần là chuyện thường.

---

### Task 5 — Clarify & voice edit

#### Clarify
`intent === 'clarify'` → hiện `clarifyQuestion` với `clarifyOptions` thành nút:

```
Did you mean 10:00 AM or 10:00 PM?
   [ 10:00 AM ]   [ 10:00 PM ]   [ Type it ]
```

Chọn xong → áp giá trị vào ParseResult → hiện confirmation card bình thường.
**Chỉ hỏi một lần.** Trả lời xong vẫn thiếu thông tin thì mở thẳng sheet nhập tay,
đừng hỏi vòng hai — hỏi hai lần là người dùng bỏ dùng voice.

#### Voice edit
Sau khi ghi xong, nói tiếp "no, that was learning" hoặc "change it to 9 AM":
- Gửi text (hoặc audio) kèm `targetActivityId` của record vừa tạo
- `parseTextCorrection()` → `intent: 'edit'` + patch
- Áp `updateActivity()` (hàm này tự chạy lại `derive()`)
- Toast: `"Changed to Learning"`

Giữ `lastCreatedActivityId` trong state màn hình Now, hết hạn sau 5 phút.

---

### Task 6 — Delayed start

`intent: 'schedule'` → tạo record `status: 'scheduled'`, `startAt` tương lai.

**Không dùng push notification.** Cách này đơn giản hơn và không phụ thuộc iOS.

#### Card đếm ngược
Ở màn hình Now, phía trên các session đang chạy:
```
┌──────────────────────────────┐
│ ⏱ SLEEP                      │
│   starts in 4:32             │
│                    [ Cancel ]│
└──────────────────────────────┘
```

#### Tự chuyển sang active
Gọi `promoteScheduled(uid)` khi:
- Màn hình Now mount
- App quay lại foreground (`visibilitychange`)
- Mỗi 30 giây trong lúc còn record scheduled

Chuyển xong thì `startAt` giữ nguyên giá trị đã đặt — timer sẽ đếm từ thời điểm đó,
kể cả khi người dùng mở app muộn hơn. Đúng ý nghĩa "bắt đầu lúc 22:05".

#### Record scheduled quá hạn
`startAt` đã qua hơn 2 giờ mà app chưa mở → vẫn promote bình thường (timer sẽ hiện
2h+). Stale recovery của Stage 2 sẽ lo phần > 15h.

**Cancel** → `deleteActivity()` (record chưa bao giờ chạy, xoá được).

---

### Task 7 — Ghép vào màn hình Now

- Nút mic FAB, không che nút Stop
- Đang xử lý → overlay mờ nhẹ, không chặn hẳn màn hình
- Confirmation card trượt lên từ dưới, đè lên nội dung
- Vẫn giữ nguyên toàn bộ luồng bấm tay của Stage 2

**Bốn tổ hợp phải chạy được**:
| Start | Stop |
|---|---|
| Click | Click |
| Voice | Voice |
| Voice | Click |
| Click | Voice |

Tổ hợp 3 và 4 là chỗ dễ hỏng: `targetActivityId` phải khớp đúng session bất kể nó
được tạo bằng cách nào.

---

### Task 8 — Test tự động

Thêm vào bộ test có sẵn (`node --test`):

`test/sanitize.test.ts` — hàm sanitize của Task 3:
- category rác → clarify
- startAt 10 ngày trước → clarify
- endAt trước startAt → bỏ endAt
- khoảng thời gian 20h → clarify
- confidence 1.5 → 0
- targetActivityId không tồn tại → null

`test/parse-apply.test.ts` — ánh xạ ParseResult sang lời gọi repository:
- mỗi intent gọi đúng hàm với đúng tham số
- requestId trùng → chỉ ghi một lần
- confidence 0.9 → auto-commit; 0.7 → cần confirm

Không mock Gemini API. Chỉ test phần logic thuần.

---

### Task 9 — Kiểm thử trên iPhone qua HTTPS

**Bắt buộc chạy trên URL HTTPS.** Localhost không chứng minh được gì.

| # | Nói | Mong đợi |
|---|---|---|
| 1 | "I start to sleep now" | Sleep bắt đầu ngay |
| 2 | "Start working out" | Fitness bắt đầu |
| 3 | "Start sleep in 5 minutes" | Card đếm ngược |
| 4 | "This morning I worked on DevOps from 8 AM to 11 AM" | Work 3h, đúng hôm nay |
| 5 | "I finished cooking 11 minutes ago" | Nhận ra không thuộc 5 category → clarify hoặc gợi ý Leisure |
| 6 | "I'm driving to work now" | **Work** (không phải category khác) |
| 7 | "I went out at 10" | Suy ra 10 PM, hoặc hỏi lại |
| 8 | "Done" | Stop session đang chạy |
| 9 | "No, that was learning" | Sửa record vừa tạo |
| 10 | "I read for two hours last night" | Learn 2h, đêm qua |

**Đạt khi ≥ 8/10 đúng mà không phải sửa tay.**

Kiểm tra thêm:
| # | Kiểm tra | Mong đợi |
|---|---|---|
| 11 | Lần đầu bấm mic | iOS hỏi quyền, cho phép xong ghi được |
| 12 | Từ chối quyền mic | Thông báo rõ ràng, vẫn nhập tay được |
| 13 | Sau khi ghi xong | Chấm cam trên status bar **tắt** |
| 14 | Giữ mic rồi vuốt lên thả | Huỷ, không gửi |
| 15 | Chạm nhầm 0.2s | Bỏ qua, không gọi API |
| 16 | Bật máy bay rồi nói | Báo lỗi mạng, mở sheet nhập tay |
| 17 | Bấm Confirm hai lần | Chỉ tạo một record |
| 18 | Voice start → Click stop | Chạy đúng |
| 19 | Click start → Voice stop ("done") | Chạy đúng |
| 20 | Nói 30 giây liên tục | Tự dừng ở 30s |

Test 13 quan trọng: nếu chấm cam không tắt thì thiếu `track.stop()`, và lần ghi
sau sẽ hỏng.

---

## Definition of Done — Stage 3

- [ ] A1: deploy HTTPS xong, test Stage 1 + Stage 2 trên iPhone đã pass hết
- [ ] A2: sleep vắt qua 04:00 hiện đủ ở cả hai ngày
- [ ] A3: `listRecent` / `promoteScheduled` / `subscribeScheduled` + index đã deploy
- [ ] A4: `GEMINI_API_KEY` chỉ ở server
- [ ] Ghi âm ra `audio/mp4` trên iOS, mic được giải phóng
- [ ] `/api/parse` có auth, rate limit, giới hạn dung lượng, sanitize đầy đủ
- [ ] Mọi đường ghi vẫn đi qua `activities.ts`
- [ ] Confirmation card + ngưỡng confidence hoạt động
- [ ] Clarify chỉ hỏi một lần
- [ ] Voice edit hoạt động
- [ ] Delayed start hoạt động, không dùng push
- [ ] 4/4 tổ hợp start-stop chạy được
- [ ] ≥ 8/10 câu voice đúng, 20/20 mục kiểm tra pass
- [ ] Audio không được lưu ở bất kỳ đâu
- [ ] `npm test` xanh, typecheck sạch, build OK

---

## Báo cáo khi xong

1. URL production
2. Kết quả từng câu trong 10 câu voice (đúng / sai / phải sửa gì)
3. Kết quả 20 mục kiểm tra
4. Chi phí Gemini ước tính cho một ngày dùng bình thường
5. Chỗ nào lệch so với plan, kèm lý do

---

## Quy tắc cho agent

**Dừng và hỏi khi:**
- Chưa có repo GitHub hoặc chưa có `GEMINI_API_KEY`
- Chất lượng nhận dạng kém với giọng người dùng — có thể cần chỉnh prompt, đừng tự
  đổi model
- Model `gemini-2.5-flash` trong `gemini-parse.ts` không còn khả dụng

**Không được:**
- Ghi Firestore từ phía server (trừ lúc đọc context cho prompt)
- Lưu audio ở bất kỳ đâu
- Đặt `GEMINI_API_KEY` vào biến `NEXT_PUBLIC_*`
- Dùng `audio/webm` mà không kiểm tra `isTypeSupported`
- Bỏ qua bước sanitize kết quả LLM
- Tin `targetActivityId` do LLM trả về mà không đối chiếu
- Dùng push notification cho delayed start
- Hỏi clarify quá một lần cho cùng một câu nói
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts` (trừ dòng import)
- Làm sớm tính năng Stage 4+
