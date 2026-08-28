# STAGE 7 — AI Insights

> Phụ thuộc **Stage 5** (range picker, `expectedForRange`, `coverageForRange`).
> Có thể làm trước hoặc sau Stage 6.
>
> Plan này viết cho một AI coding agent thực thi.
> Sau mỗi task có mục **Verify** — phải pass mới đi tiếp.

---

## 0. Nguyên tắc thiết kế

Người dùng muốn hỏi AI: *"Nhìn lại 3 ngày qua / tuần qua, tôi đang mất cân bằng ở
đâu?"*

### Quy tắc bất biến

> **Code tính toán. AI chỉ diễn giải và chọn cái đáng nói.**

LLM **không bao giờ** nhìn thấy record thô và **không bao giờ** làm phép tính.
Ném vài trăm record cho LLM rồi bảo "phân tích đi" thì nó sẽ bịa số — và bịa một
cách trôi chảy nên người đọc không phát hiện.

Luồng đúng:
```
activities thô
   → code deterministic tính ~15 chỉ số      (Task 1)
   → gói thành digest JSON gọn                (Task 2)
   → Gemini chọn 3 điều đáng nói + viết câu   (Task 4)
   → UI hiển thị, kèm số gốc để đối chiếu     (Task 5)
```

### Bốn ràng buộc chống "tử vi"

1. **Mọi con số trong output phải đến từ digest.** AI chỉ được trích lại, không
   được tính mới. Sanitize sẽ kiểm tra.
2. **Không tuyên bố nhân quả.** Một tuần dữ liệu không chứng minh được A gây ra B.
   Chỉ được nói "đi kèm với", không được nói "vì".
3. **Chặn khi dữ liệu không đủ.** Coverage < 55% hoặc khoảng < 3 ngày → từ chối
   phân tích và nói rõ lý do.
4. **Nêu số, không dạy đời.** Cùng nguyên tắc với balance banner ở Stage 4.
   Không giảng đạo lý, không dùng từ mang tính phán xét.

---

## Task 1 — Tính chỉ số (deterministic)

Tạo `src/lib/signals.ts`. Thuần logic, không đụng Firestore, test được bằng
`node --test`.

```ts
export function computeSignals(
  activities: Activity[],
  range: Range,
  expected: Record<Category, number>,
  previous?: { activities: Activity[]; expected: Record<Category, number> },
  now: number
): Signals
```

Chỉ số chia thành **7 nhóm**: một nhóm chung, **năm nhóm cho năm category**, và một
nhóm liên hệ chéo. Mỗi category được phân tích ở cùng độ sâu — không ưu ái cái nào.

---

### Nhóm A — Chung (mọi category)
| Chỉ số | Cách tính |
|---|---|
| `hoursByCategory` | `actualHours()` của `balance.ts` |
| `expectedByCategory` | `expectedForRange()` của Stage 5 |
| `deviationPct` | `(actual − expected) / expected` |
| `deltaVsPrevious` | Chênh lệch giờ so với kỳ trước, từng category |
| `coverage` | `coverageForRange()` |
| `overlapHours` | `overlapHours()` |
| `sessionCount` | Số session, từng category |
| `medianSessionMin` | Thời lượng session trung vị, từng category |
| `longestBlockMin` | Block dài nhất, từng category |
| `zeroDays` | Số ngày không có session nào, từng category |

`medianSessionMin` và `longestBlockMin` cho biết **độ vụn**: 6 lần × 20 phút khác
hẳn 2 lần × 1h, dù tổng giờ như nhau.

---

### Nhóm B — Sleep
| Chỉ số | Cách tính |
|---|---|
| `medianBedtime` | Trung vị `startAt` của session Sleep > 4h |
| `medianWakeTime` | Trung vị `endAt` của các session đó |
| `bedtimeSpreadMin` | Chênh lệch giữa đêm ngủ sớm nhất và muộn nhất |
| `nightsAfter23` | Số đêm đi ngủ sau 23:00 |
| `medianSleepDuration` | Trung vị thời lượng đêm |
| `shortNights` | Số đêm dưới 6h |
| `napCount` / `napHours` | Session Sleep ≤ 4h |

`bedtimeSpreadMin` quan trọng không kém tổng giờ ngủ. Giờ dậy của người dùng cố định
04:30, nên giờ **đi ngủ** dao động mới là thứ quyết định mệt hay không — ngủ đủ 6.5h
mỗi đêm nhưng lúc 22:00 lúc 01:00 thì cơ thể vẫn như lệch múi giờ.

---

### Nhóm C — Work
| Chỉ số | Cách tính |
|---|---|
| `otHours` | Giờ Work **ngoài** 08:00–17:00, thứ Hai–thứ Sáu |
| `weekendWorkHours` | Giờ Work thứ Bảy/Chủ nhật |
| `lateWorkHours` | Giờ Work sau 20:00 |
| `longestWorkDay` | Ngày Work cao nhất, kèm số giờ |
| `daysOver10hWork` | Số ngày Work > 10h |
| `officeDaysLogged` | Số ngày có Work bắt đầu trước 07:45 (dấu hiệu đi văn phòng) |
| `workEndSpreadMin` | Dao động giờ kết thúc Work |

---

### Nhóm D — Learn

Đây là category quan trọng nhất của toàn dự án: pain point gốc là *OT cuối tuần
nuốt mất thời gian học*. Phân tích ở độ sâu cao nhất.

| Chỉ số | Cách tính |
|---|---|
| `morningLearnDays` | Số ngày có Learn bắt đầu trước 07:00 |
| `morningLearnHours` | Tổng giờ khối sáng (04:00–08:00) |
| `eveningLearnDays` | Số ngày có Learn trong 20:00–23:00 |
| `eveningLearnHours` | Tổng giờ khối tối |
| `weekendLearnHours` | Giờ Learn thứ Bảy/Chủ nhật |
| `weekendLearnTarget` | Target cuối tuần (16h ở preset Normal) |
| `learnStreak` | Chuỗi ngày liên tiếp đạt ≥ 50% target Learn ngày đó |
| `longestLearnBlock` | Block học dài nhất |
| `daysWithZeroLearn` | Số ngày không học gì |
| `weekdayWorstForLearn` | Thứ nào Learn thấp nhất |

Tách khối sáng và khối tối là chủ ý: hai khối này bị đe doạ bởi hai thứ khác nhau
(khối sáng bị mất do ngủ dậy trễ, khối tối bị mất do OT hoặc mệt). Gộp chung thì
không biết đường nào hỏng.

---

### Nhóm E — Fitness
| Chỉ số | Cách tính |
|---|---|
| `fitnessSessions` | Số buổi |
| `sessionsPerWeek` | Quy đổi theo độ dài khoảng |
| `longestGapDays` | Khoảng cách dài nhất giữa hai buổi |
| `daysSinceLast` | Số ngày kể từ buổi gần nhất |
| `medianSessionMin` | Thời lượng buổi trung vị |
| `weekdayDistribution` | Buổi tập rơi vào thứ mấy |
| `skippedAfterWorkDays` | Số ngày Work > 9h mà không có Fitness |

`longestGapDays` hữu ích hơn tổng giờ: tập 9h dồn vào 2 ngày rất khác 9h rải 6 ngày.

---

### Nhóm F — Leisure
| Chỉ số | Cách tính |
|---|---|
| `leisureHours` | Tổng giờ |
| `lateLeisureHours` | Giờ Leisure sau 22:00 |
| `leisureNightsDelayingSleep` | Số đêm có Leisure sau 22:00 **và** ngủ sau 23:00 |
| `longestLeisureBlock` | Block dài nhất |
| `weekdayLeisureHours` / `weekendLeisureHours` | Tách ngày thường và cuối tuần |

`leisureNightsDelayingSleep` là chỉ số Leisure có giá trị nhất — nó bắt được đúng
kiểu "xem phim tới 1 giờ sáng rồi hôm sau dậy không nổi", thứ mà tổng giờ Leisure
không bao giờ cho thấy.

---

### Nhóm G — Liên hệ chéo (chỉ mô tả, không kết luận nhân quả)
| Chỉ số | Cách tính |
|---|---|
| `learnOnHighWorkDays` | Learn trung bình ở ngày Work > 9h |
| `learnOnNormalDays` | Learn trung bình ở ngày còn lại |
| `fitnessAfterShortNights` | Fitness trung bình ngày sau đêm ngủ < 6h |
| `learnAfterShortNights` | Learn trung bình ngày sau đêm ngủ < 6h |
| `sleepAfterLateWork` | Giờ ngủ trung bình sau ngày có `lateWorkHours` > 0 |
| `weekendLearnVsWeekendWork` | Cặp giờ Learn và Work cuối tuần |
| `displacedBy` | Kỳ này category nào tăng, category nào giảm tương ứng |

Mỗi chỉ số nhóm này **bắt buộc kèm `sampleSize`**. Dưới 3 mẫu → trả `null`, không
đưa vào digest. Đây là điểm chặn quan trọng nhất chống suy diễn bừa: "ngày làm nhiều
thì học ít" dựa trên 1–2 ngày là ngẫu nhiên, không phải quy luật.

### Verify
Test với dữ liệu dựng sẵn, đối chiếu từng chỉ số bằng tay.

---

## Task 2 — Digest

`src/lib/digest.ts` — chuyển `Signals` thành JSON gọn cho prompt.

- Làm tròn 1 chữ số thập phân
- Giờ dạng `HH:MM` theo giờ địa phương
- Bỏ chỉ số `null` hoặc `sampleSize < 3`
- Giữ ít nhất 3 chỉ số của mỗi category, kể cả khi category đó không có gì bất thường —
  AI cần thấy đủ 5 để so sánh, không chỉ thấy cái đang lệch
- Kèm `rangeLabel`, `dayCount`, `preset` của tuần
- **Mục tiêu: dưới 1200 token.** Digest phình to là dấu hiệu đang tuồn dữ liệu thô

### Cổng chặn
```ts
export function canAnalyze(signals): { ok: boolean; reason?: string }
```
- `dayCount < 3` → `"Need at least 3 days of data."`
- `coverage < 0.55` → `"Only 41% of this period is logged."`
- Không có record nào → `"Nothing logged in this period."`

Không đạt → **không gọi API**. Hiện lý do kèm gợi ý cải thiện.

---

## Task 3 — API route

`src/app/api/insight/route.ts`

```
POST /api/insight
Body: { from, to, digest, digestHash }
Trả:  InsightResult
```

Trình tự: `requireSessionUser()` → rate limit **10 request/giờ** → gọi Gemini →
sanitize → trả về.

Chi phí thấp (digest ~1200 token, output ~400) nhưng rate limit vẫn cần để tránh
bấm liên tục.

`vercel.json` `maxDuration: 30` đã có.

---

## Task 4 — Schema & prompt

Thêm vào `src/lib/gemini-parse.ts` **hoặc** file mới `src/lib/gemini-insight.ts`
(khuyến nghị file mới, để `gemini-parse.ts` chỉ lo việc parse).

### Schema
```ts
{
  observations: [           // 2–4 mục
    {
      title: string,        // ≤ 8 từ
      body: string,         // 1–2 câu, phải chứa số lấy từ digest
      metric: string,       // tên chỉ số trong digest — để đối chiếu
      severity: 'info' | 'notable' | 'important'
    }
  ],
  suggestion: {
    text: string,           // 1 câu, hành động cụ thể
    preset: 'normal' | 'crunch' | 'deep_learn' | 'recovery' | null
  } | null,
  positive: string | null   // 1 câu về điều đang làm tốt, nếu có
}
```

`preset` cho phép nối thẳng vào màn Targets — bấm một nút là áp dụng.

### System prompt (tiếng Anh, model output tiếng Anh)

```
You analyse a personal time-audit digest and surface what matters.

The user is a DevOps engineer in Vietnam. Typical schedule: wake 04:30,
self-study until 06:30; work 08:00–17:00 Mon–Fri, in office Tue and Thu
(45 min commute each way, counted as work); workout 18:00–19:30;
study again 20:30–22:00; sleep at 22:00. Weekends are meant for study
but often get taken by unplanned work OT.

RULES — these are absolute:
1. Every number you write must appear in the digest. Never compute,
   estimate, or infer a number that is not there.
2. Never claim causation. Say "alongside" or "on days when", never
   "because" or "due to".
3. State numbers plainly. Do not lecture, moralise, or use judging
   words like "too much", "bad", "should have".
4. No medical, clinical, or diagnostic claims of any kind.
5. Pick the 2–4 observations that matter most. Do not list everything.
6. Prefer signals the user cannot see at a glance: timing consistency,
   change versus the previous period, associations between categories.
   Raw totals are already visible in the charts.
7. If a correlation signal is present, note its sample size and that
   it is only an association.
8. Suggestion must be one concrete, small action. Not "sleep more" —
   something like "protect the 20:30 study block on Tue and Thu".
9. If something is going well, say so in `positive`. One sentence.

Write in English. Be brief. No preamble, no closing summary.
```

### Sanitize — bắt buộc

Trước khi trả về client:
- Trích mọi số trong `body`, đối chiếu với giá trị trong digest (sai số 0.15).
  Không khớp → **bỏ observation đó**.
- Có từ nhân quả (`because`, `caused`, `due to`, `led to`) → bỏ observation
- `preset` không thuộc 4 giá trị hợp lệ → `null`
- Nhiều hơn 4 observation → cắt còn 4
- Rỗng sau khi lọc → trả `"Nothing notable in this period."`

Đây là lớp bảo vệ chính chống bịa số. Không được bỏ.

---

## Task 5 — Giao diện

Đặt ở màn Analytics, **dưới** các chart. Chart trả lời "cái gì", phần này trả lời
"nên để ý gì".

### Nút
```
┌──────────────────────────────┐
│  ✦  Analyse this period      │
│     Aug 21 – Aug 27 · 7 days │
└──────────────────────────────┘
```
Dùng đúng range đang chọn ở Stage 5 — không có picker riêng.

### Kết quả
```
Sleep drifted later
Median bedtime 23:40, 1h20m later than last week.
Four nights after 23:00.

Study lost to work days
On the 3 days with over 9h of work, Learn averaged
0.4h versus 2.1h on other days. Association only, n=3.

Fitness held steady          ← positive
Six sessions, longest gap 2 days.

─────────────────────────────
Try: protect the 20:30 block on Tue and Thu.
                    [ Switch to Recovery ]
```

- `severity` quyết định độ đậm của nhãn, **không** dùng màu đỏ
- Tap `metric` → hiện số gốc từ digest, để đối chiếu
- Nút preset → sang màn Targets với preset đã chọn sẵn (không tự áp)

### Trạng thái
- Đang chạy: skeleton + `Reading your week…` (2–4 giây)
- Bị chặn: hiện lý do từ `canAnalyze()` + gợi ý (`Log more of your day, then try again.`)
- Lỗi: `Could not analyse right now.` + nút Retry

---

## Task 6 — Cache & chi phí

Lưu `users/{uid}/insights/{id}`:
```
{ from, to, digestHash, result, createdAt }
```

`digestHash` = hash của digest JSON. Cùng khoảng + dữ liệu không đổi → **dùng lại
kết quả cũ**, không gọi API.

Lý do quan trọng hơn tiền: mở lại cùng một tuần mà nhận về nhận xét khác nhau thì
người dùng sẽ mất tin tưởng vào cả tính năng.

- Nút `Refresh` để ép chạy lại
- Giữ 20 insight gần nhất, xoá dần cái cũ
- Hiển thị `Generated Aug 27, 21:40` dưới kết quả

### Chi phí ước tính
~1600 token mỗi lần, Gemini Flash. Chạy mỗi ngày một lần thì gần như không đáng kể.
Ghi lại con số thật vào README sau một tuần dùng.

---

## Task 7 — Nối vào Weekly Review

Stage 6 Task 1, màn 2 (*"Điều đáng chú ý"*) hiện dùng luật cứng: `weekendConflict`
→ deviation lớn nhất → coverage → streak.

Nâng cấp: dùng luôn AI insight của tuần đó.
- Chạy phân tích khi mở Weekly Review, cache lại
- Không đủ dữ liệu hoặc lỗi → **quay về luật cứng**, không để màn trống
- Màn 3 (chọn preset tuần sau) dùng gợi ý `preset` làm lựa chọn được đánh dấu sẵn —
  nhưng người dùng vẫn phải tự bấm

Nếu Stage 6 chưa làm thì bỏ qua task này, quay lại sau.

---

## Task 8 — Giới hạn & an toàn

Đây là dữ liệu sinh hoạt cá nhân. Vài ràng buộc:

- **Không chẩn đoán.** Prompt đã cấm; sanitize kiểm tra thêm các từ như `insomnia`,
  `burnout`, `depression`, `disorder` → bỏ observation chứa chúng.
- **Không phán xét.** Không `too much`, `bad`, `unhealthy`, `you should have`.
- **Dữ liệu cực đoan** (ngủ trung vị < 5h, hoặc Work > 70h/tuần) → vẫn nêu số bình
  thường, thêm một dòng trung tính:
  `That is well below your own floor of 42h. Worth a rest week.`
  Không cảnh báo kiểu y tế, không hoảng hốt.
- **Digest không rời server ngoài Gemini.** Không log ra console ở production,
  không lưu vào analytics bên thứ ba.
- Người dùng xoá được insight đã lưu.

---

## Task 9 — Test

`test/signals.test.ts` — mỗi nhóm ít nhất 2 ca
- **B Sleep**: `medianBedtime` với 5 đêm khác giờ; `bedtimeSpreadMin`;
  session ngủ vắt qua nửa đêm gán đúng đêm; nap ≤ 4h không tính vào đêm
- **C Work**: `otHours` chỉ tính ngoài 08:00–17:00 T2–T6; `weekendWorkHours`
  tách đúng T7/CN; `lateWorkHours` sau 20:00
- **D Learn**: khối sáng và khối tối tách đúng; `weekendLearnHours`;
  `learnStreak` đứt khi có ngày dưới 50% target
- **E Fitness**: `longestGapDays`; `skippedAfterWorkDays`
- **F Leisure**: `lateLeisureHours` sau 22:00;
  `leisureNightsDelayingSleep` cần cả hai điều kiện mới đếm
- **G Liên hệ**: trả `null` khi `sampleSize < 3`; `displacedBy` khớp delta

`test/digest.test.ts`
- Bỏ chỉ số `null` và `sampleSize < 3`
- Digest dưới 1200 token với dữ liệu một tháng
- `canAnalyze` chặn đúng ba trường hợp

`test/insight-sanitize.test.ts`
- Số không có trong digest → bỏ observation
- Câu chứa `because` → bỏ
- Câu chứa `burnout` → bỏ
- 6 observation → cắt còn 4
- Bỏ hết → trả câu mặc định

---

## Task 10 — Kiểm thử tay

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Chọn This week, bấm Analyse | 2–4 nhận xét trong ~3 giây |
| 2 | Đối chiếu mọi con số với chart | Khớp hoàn toàn |
| 3 | Đọc kỹ câu chữ | Không có từ nhân quả, không phán xét |
| 4 | Bấm Analyse lại ngay | Dùng cache, không gọi API |
| 5 | Sửa một record rồi Analyse | Chạy lại vì digest đổi |
| 6 | Chọn khoảng 2 ngày | Bị chặn, báo cần ít nhất 3 ngày |
| 7 | Khoảng coverage 40% | Bị chặn, nêu rõ % |
| 8 | Tap vào metric | Hiện số gốc |
| 9 | Bấm nút preset | Sang Targets, chọn sẵn, chưa áp dụng |
| 10 | Ngắt mạng | Lỗi rõ ràng, có Retry |
| 11 | Đọc trên iPhone | Không tràn, chữ đọc được |
| 12 | Chạy 3 khoảng khác nhau | Nhận xét khác nhau, không lặp khuôn |

Mục 2 và 3 là hai bài quan trọng nhất. Chỉ cần một con số sai là cả tính năng mất
giá trị.

---

## Definition of Done

- [ ] Mọi chỉ số tính bằng code, AI không làm phép tính nào
- [ ] Digest < 1200 token, không chứa record thô
- [ ] Chặn khi < 3 ngày hoặc coverage < 55%
- [ ] Sanitize bỏ được số bịa, câu nhân quả, từ y tế
- [ ] Cả 5 category đều có nhóm chỉ số riêng (B–F), không nhóm nào bị bỏ nông
- [ ] Chỉ số liên hệ (nhóm G) có `sampleSize`, ẩn khi < 3
- [ ] Cache theo `digestHash`, cùng dữ liệu ra cùng kết quả
- [ ] Có gợi ý preset, nối sang Targets, không tự áp dụng
- [ ] Câu chữ nêu số, không dạy đời
- [ ] `npm test` xanh, typecheck sạch, build OK
- [ ] 12/12 mục Task 10 pass

---

## Quy tắc cho agent

**Dừng và hỏi khi:**
- Một chỉ số không tính được từ dữ liệu hiện có
- Sanitize bỏ quá nhiều observation → prompt cần chỉnh

**Không được:**
- Gửi record thô cho LLM
- Để LLM tính toán bất kỳ con số nào
- Bỏ bước sanitize đối chiếu số
- Cho phép câu nhân quả
- Hiện chỉ số liên hệ có `sampleSize < 3`
- Tự động áp preset do AI gợi ý
- Dùng màu đỏ hoặc ngôn ngữ phán xét
- Đưa nội dung mang tính chẩn đoán y tế
- Sửa `logi.ts` / `balance.ts`
