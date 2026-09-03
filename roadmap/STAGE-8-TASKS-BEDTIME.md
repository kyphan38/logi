# STAGE 8 — Task checklist tuần + Bedtime

> Hai tính năng mới, làm chung một lượt vì cùng đụng vào màn Now và card TREND.
>
> Plan này nêu **quyết định và ràng buộc**, không đặc tả từng pixel. Chi tiết
> triển khai để agent tự chọn, miễn giữ đúng các ràng buộc ghi ở đây.

---

## 0. Vì sao làm

App hiện đo **giờ theo category**. "Learn 3h" quá thô — nó không phân biệt được
shadowing hay đọc blog tech. Một task có tên và thời lượng biến mục tiêu mơ hồ thành
cam kết cụ thể, và tạo **ý định trước khi ngày bắt đầu** — thứ app hiện chỉ có ở mức
preset tuần.

Bedtime là phiên bản nhẹ của Sleep đã gỡ: ghi **một mốc**, không phải một khoảng.
Né được toàn bộ rắc rối cũ (start/stop, vắt qua nửa đêm, chia block, ngân sách giờ).

---

## 1. Quyết định đã chốt

Agent **không** đổi các quyết định này.

| # | Quyết định |
|---|---|
| 1 | Pool tối đa **5 task**. Mỗi task: title, thời lượng, category |
| 2 | Lưới **task × ngày**, chạm ô để bật/tắt. Không kéo-để-di-chuyển |
| 3 | Tối đa **3 task/ngày**, chặn cứng. Tối thiểu 1 chỉ là **gợi ý**, để trống được |
| 4 | Lưới đặt **bên trong tab Targets** |
| 5 | Chỉ session bấm **từ checklist** mới tính vào task |
| 6 | Hoàn thành = tổng giờ các session của task đó trong ngày **≥** thời lượng dự kiến |
| 7 | Đánh dấu hoàn thành **lúc bấm Stop**. Tiến độ dở dang hiện ngay trong lúc chạy |
| 8 | Chưa xong thì **không** đánh dấu, **không** dồn sang hôm sau |
| 9 | Giờ dự kiến vượt target ngày → **cảnh báo** |
| 10 | Màn Now: checklist **xếp chồng** phía trên lưới 4 nút |
| 11 | Bedtime: **chỉ giờ đi ngủ**, không giờ dậy |
| 12 | Bedtime ghi bằng **nút ở Now** và **voice** |
| 13 | Trend bedtime thêm vào **card TREND sẵn có** |
| 14 | Sửa/xoá task → **tuần cũ giữ nguyên** giá trị lúc gán |

---

## 2. Data model

### Pool
`users/{uid}/taskPool/{taskId}` — title, durationMin, category, order, archivedAt

Xoá task = set `archivedAt`, **không** hard-delete. Tuần cũ vẫn phải hiện được nó.

### Kế hoạch tuần
`users/{uid}/weekPlans/{week}` — một doc cho cả tuần (35 ô là cùng, rất nhẹ)

Mỗi ô đã bật lưu **bản chụp** tại thời điểm gán: `taskId`, `dow`, `title`,
`durationMin`, `category`.

Chụp lại là cách duy nhất giữ được quyết định 14. Nếu chỉ lưu `taskId` rồi đọc
thời lượng từ pool lúc hiển thị, thì đổi Running 45' → 30' sẽ khiến một tuần từng
"chưa xong" tự nhiên thành "đã xong" — lịch sử bị viết lại.

### Activity
Thêm `taskId: string | null`. Session không từ checklist thì `null`.

### Bedtime
`users/{uid}/dayLogs/{logicalDate}` — `bedtimeAt` (epoch ms)

Một mốc, không phải activity. **Không** vào collection `activities`.

### Rules
`taskPool`, `weekPlans`, `dayLogs` theo đúng pattern ownership hiện có.
`validActivity` chấp nhận `taskId` là string hoặc null.

---

## 3. Lưới kế hoạch (trong Targets)

### Bố cục
Hàng = task trong pool, cột = 7 ngày. Nhãn hàng mang title + thời lượng + category.
Ô bật thì tô màu category, ô tắt để trống.

Dưới cùng một dòng đếm số task đã lên kế hoạch mỗi ngày.

Cả tuần phải nằm gọn **một màn hình** ở 375px — đây là lý do chọn bố cục này thay vì
thẻ trong cột ngày.

### Tương tác
- **Mọi nơi**: chạm ô để bật/tắt
- **Desktop (≥ md)**: thêm kéo-để-**tô** (nhấn rồi rê ngang bật hàng loạt), chạm nhãn
  hàng để bật/tắt cả 7 ngày, chạm tên thứ để xoá sạch ngày đó
- **Mobile**: **tắt** kéo-để-tô — nó giành cử chỉ với cuộn trang, đúng vấn đề đã gặp
  với lưới nút ở Now

Không làm kéo-để-di-chuyển ở bất kỳ đâu. Ô chỉ là bật/tắt, kéo không mang thêm
thông tin gì.

### Giới hạn
- Ô thứ 4 của một ngày → chặn, báo `Max 3 per day`
- Ngày trống → cột hiện nhạt, **không** chặn

### Cảnh báo vượt target (quyết định 9)
Với mỗi ngày, cộng thời lượng dự kiến **theo từng category**, so với
`dailyTargetFor(weekday, weekly)`. Vượt → đánh dấu cột đó, nêu rõ category nào:
`Mon · Learn 4.0h planned vs 3.0h target`

Cảnh báo, không chặn.

### Copy tuần trước
Một nút, nhân bản toàn bộ lưới sang tuần đang xem. Tuần đã có kế hoạch → hỏi trước
khi ghi đè.

### Quản lý pool
Thêm / sửa / xoá task ngay trong màn này. Đủ 5 task → nút thêm bị mờ.

---

## 4. Checklist ở màn Now

### Vị trí
Dưới banner, trên lưới 4 nút. Chỉ hiện khi hôm nay có task.

Ảnh chụp cho thấy màn Now còn nhiều chỗ trống, nên xếp chồng thoải mái. Nhưng vẫn
giữ nguyên tiêu chí cũ: **cả trang vừa một màn hình iPhone 11, không phải cuộn.**
Kiểm tra lại sau khi thêm.

### Mỗi dòng
Ô trạng thái + title + chấm category + tiến độ `18 / 30m`.

Ba trạng thái: chưa bắt đầu, đang chạy (timer + Stop), đã xong (tick, tiến độ đầy).

### Bấm vào dòng
Gọi `startActivity` với `category` và `label` của task, kèm `taskId`.
Đang chạy → hiện Stop.

Áp cùng ba lớp chống click nhầm như lưới nút (ngưỡng di chuyển, chặn sau cuộn,
Undo 5 giây).

### Tính hoàn thành
Cộng thời lượng mọi session có `taskId` đó trong ngày logic hôm nay. Session đang
chạy tính tới `now` cho phần hiển thị tiến độ, nhưng **chỉ đánh giá hoàn thành lúc
bấm Stop** (quyết định 7).

Nhiều lần log trong ngày thì cộng dồn.

Hết ngày chưa đủ → để nguyên, không dồn (quyết định 8).

### Đường lui cho voice
Quyết định 5 nói chỉ session từ checklist mới tính. Nhưng người dùng dùng voice rất
nhiều — sáng sớm quen miệng nói "start shadowing" là task hôm đó không được tick dù
đã làm.

Nên: trong `RecordSheet` ở History, thêm mục chọn task để gắn một session vào task.
Không đoán tự động, chỉ cho sửa tay.

---

## 5. Bedtime

### Ghi
- **Nút ở Now**: một nút nhỏ, đặt cạnh header hoặc cuối màn. Bấm → ghi `now`.
  Đã ghi hôm nay → hiện giờ đã ghi, bấm lại để sửa.
- **Voice**: "going to bed now", "I went to bed at 11:30", "bedtime 23:45".
  Thêm intent vào prompt. Câu về giờ đi ngủ **không** được tạo activity.

### Quy tắc
- Dùng **cùng mốc 04:00**: đi ngủ 00:15 tính là đêm của ngày hôm trước
- **Không** vào ngân sách 89h, không có target, không hiện ở Balance / By day / When
- Mỗi ngày logic tối đa một giá trị, ghi lại thì ghi đè

### Thang liên tục
Trung vị và độ dao động phải quy đổi trước khi tính:
`22:00 → 22.0`, `00:15 → 24.25`, `01:30 → 25.5`

Không làm bước này thì trung vị của 22:00 và 00:15 sẽ ra 11 giờ trưa. Hai đêm đó
chênh nhau **135 phút**, không phải 22 tiếng.

---

## 6. Trend

### Thêm hai lựa chọn vào selector của card TREND
- **Bedtime** — trục Y là giờ trong ngày (thang liên tục), mỗi tuần một điểm là
  trung vị, kèm dải min–max để thấy độ dao động
- **Task completion** — tỉ lệ hoàn thành theo từng task qua các tuần
  (`Running: 8/12 ngày đã lên kế hoạch`)

Đây là chỗ lộ ra task nào bạn luôn bỏ — mà task luôn bỏ thường là task đặt sai, không
phải người lười.

### BUG cần sửa: tuần không có dữ liệu đang bị coi là 0

Ảnh chụp hiện `W31 0.0h → W35 7.3h · up +7.3h`. Sai: W31 không phải "học 0 giờ", mà
là **chưa có dữ liệu** — lúc đó app chưa dùng.

Sửa:
- Tuần không có activity nào → cột **để trống**, không vẽ cột 0
- Dòng so sánh chỉ lấy giữa các tuần **có** dữ liệu
- Không có đủ 2 tuần có dữ liệu → ẩn dòng so sánh

Cùng loại lỗi với quy tắc `sampleSize < 3` ở phần AI insights: thiếu dữ liệu không
phải dữ liệu bằng không. Áp cho **cả** category và bedtime.

---

## 7. BUG cần sửa: màn Now trộn số tuần và số ngày

Banner ghi `Leisure 11.4h` (cả tuần), nút Leisure ghi `0.0 / 1.5h` (hôm nay). Cùng
một chữ Leisure, hai con số vênh nhau, không nhãn nào phân biệt.

Sửa: thêm `this week` vào banner hoặc `today` vào nút. Chọn một, miễn đọc lên không
nhầm được.

---

## 8. Test

Ưu tiên các hàm thuần, tách khỏi Firestore như đã làm với `voice-plan.ts`.

**Task completion**
- Nhiều session cùng `taskId` trong ngày → cộng dồn
- Đủ thời lượng → hoàn thành; thiếu → không
- Session `taskId` khác không bị tính nhầm
- Sang ngày mới → đếm lại từ 0, không dồn

**Snapshot**
- Đổi thời lượng task trong pool → tuần cũ **giữ nguyên**, tuần mới dùng giá trị mới
- Xoá task → tuần cũ vẫn hiện được

**Lưới**
- Ô thứ 4 của một ngày bị chặn
- Ngày trống hợp lệ
- Cảnh báo vượt target bắn đúng category, đúng ngày

**Bedtime**
- 00:15 → ngày logic hôm trước
- Thang liên tục: 22:00 → 22.0, 00:15 → 24.25
- Trung vị của [22:00, 23:30, 00:15] ra 23:30
- Không xuất hiện trong tổng giờ của bất kỳ chart nào

**Trend**
- Tuần không có dữ liệu → không vẽ cột 0
- Dòng so sánh chỉ dùng tuần có dữ liệu
- Dưới 2 tuần có dữ liệu → ẩn dòng so sánh

---

## 9. Kiểm thử tay

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Tạo 5 task, thử task thứ 6 | Bị chặn |
| 2 | Lưới trên iPhone | Cả tuần vừa một màn hình |
| 3 | Chạm ô | Bật/tắt ngay, không cần kéo |
| 4 | Chạm ô thứ 4 của một ngày | Bị chặn, có báo |
| 5 | Desktop: rê ngang qua nhiều ô | Bật hàng loạt |
| 6 | Mobile: vuốt qua lưới | Chỉ cuộn, **không** bật ô nào |
| 7 | Lên kế hoạch vượt target ngày | Cảnh báo, nêu đúng category |
| 8 | Màn Now hôm nay | 3 dòng checklist, vẫn không phải cuộn |
| 9 | Bấm một dòng | Session chạy, có `taskId`, label = title |
| 10 | Dừng khi mới 20/30 phút | Chưa tick, tiến độ hiện 20/30 |
| 11 | Chạy tiếp cho đủ 30 phút | Tick xanh |
| 12 | Sang hôm sau | Đếm lại từ 0, không dồn |
| 13 | Sửa thời lượng task | Tuần cũ giữ nguyên |
| 14 | Nói "going to bed now" | Ghi mốc, **không** tạo activity |
| 15 | Bedtime 00:15 | Thuộc ngày hôm trước |
| 16 | Balance / By day / When | Không có dấu vết bedtime |
| 17 | TREND chọn Bedtime | Trục giờ, tuần trống để trống |
| 18 | TREND chọn Learn | Không còn cột 0 cho tuần chưa có dữ liệu |
| 19 | Gắn session voice vào task ở History | Task được tính |

Mục 6 và 8 quan trọng nhất — chúng bảo vệ hai thứ vừa mất công làm xong: cuộn không
bật ô, và màn Now không phải cuộn.

---

## Definition of Done

- [ ] Pool tối đa 5, lưới task × ngày, chạm ô, tối đa 3/ngày
- [ ] Bản chụp giữ nguyên tuần cũ khi sửa/xoá task
- [ ] Kéo-để-tô chỉ có trên desktop
- [ ] Cảnh báo vượt target ngày theo từng category
- [ ] Checklist ở Now, màn Now vẫn vừa một màn hình
- [ ] Hoàn thành tính bằng `taskId`, cộng dồn nhiều session, đánh giá lúc Stop
- [ ] Không dồn task sang hôm sau
- [ ] Gắn tay session vào task từ History
- [ ] Bedtime là mốc, không phải activity, không vào ngân sách 89h
- [ ] Thang liên tục cho trung vị bedtime
- [ ] Trend không vẽ cột 0 cho tuần không có dữ liệu
- [ ] Màn Now phân biệt rõ số tuần và số ngày
- [ ] `npm test` xanh, typecheck sạch, build OK
- [ ] 19/19 mục kiểm thử tay pass

---

## Quy tắc cho agent

**Dừng và hỏi khi:**
- Một quyết định ở mục 1 có vẻ mâu thuẫn với code hiện có
- Lưới không vừa một màn hình ở 375px dù đã thu gọn

**Không được:**
- Làm kéo-để-di-chuyển
- Bật kéo-để-tô trên mobile
- Lưu bedtime vào collection `activities`
- Cho bedtime có target hoặc vào ngân sách 89h
- Đọc thời lượng task từ pool khi hiển thị tuần cũ (phải dùng bản chụp)
- Tự đoán và gắn session voice vào task
- Dồn task chưa xong sang hôm sau
- Vẽ cột 0 cho tuần không có dữ liệu
- Đổi `DAY_CUTOFF_HOUR`
