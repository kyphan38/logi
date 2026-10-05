# STAGE 9 - Tab Reminder: sự kiện sắp tới

> Một tab để ghi những mốc **phải nhớ**: hạn nộp, lịch khám, đám cưới.
> App đếm ngược và đẩy thông báo trước 14 / 7 / 3 / 1 ngày, và lại vào đúng ngày.

---

## 0. Vì sao làm

App đo **giờ theo category** và **task theo tuần**. Cả hai đều lặp lại. Không có
chỗ nào cho một mốc **xảy ra đúng một lần** - thứ mà quên là hỏng thật.

Ghi vào Notes hay Calendar thì được, nhưng người dùng đã mở logi mỗi ngày rồi.
Thêm một app nữa để mở là thêm một app nữa để quên.

---

## 1. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Ngày bắt buộc, **giờ tuỳ chọn**. Giờ chỉ để hiển thị |
| 2 | Mốc nhắc: **14, 7, 3, 1, 0** ngày. Cố định, không cho chỉnh |
| 3 | Push **một lần/ngày lúc 06:00**, không phải 15 phút/lần |
| 4 | **Không gửi bù**. Lỡ một ngày thì mốc đó trôi luôn |
| 5 | Trần **40 sự kiện** đang chờ |
| 6 | Xoá = `archivedAt`, không hard-delete (trừ Undo trong 60 giây) |
| 7 | Đổi ngày → **xoá sạch `notified`** |
| 8 | Sự kiện **lặp lại** (sinh nhật hằng năm): **chưa làm** |
| 9 | Push sự kiện là function **riêng**, không gộp vào `pushReminders` |

### Vì sao 1

Bản đầu bỏ hẳn trường giờ. Nhưng người dùng gõ ngay `11:30:` và `6:30` vào ô
Note - tức là giờ **có** cần, chỉ là không phải lúc nào cũng có.

Giờ **không đổi lịch gửi**: mốc vẫn tính bằng ngày, push vẫn 06:00. Nhắc trước
vài tiếng là tính năng khác, chưa làm. Việc cả ngày (`time === null`) đứng
trước việc có giờ trong cùng ngày - nó không có mốc nào để xếp vào.

### Vì sao 9

`pushReminders` cố ý chỉ gửi **một** thông báo mỗi lần chạy - nhiều dòng cùng lúc
thì người dùng học cách bỏ qua tất cả. Nhét sự kiện vào đó nghĩa là hôm nào có
sự kiện thì mất nhắc học, hoặc ngược lại. Hai thứ khác bản chất: nhắc học tính
theo **giờ trong ngày**, sự kiện tính theo **ngày trên lịch**.

### Vì sao 4

"In 7 days" gửi vào ngày còn 6 ngày là thông báo **sai**. Sai còn tệ hơn không có:
một lần sai là người dùng thôi tin mọi con số app đưa ra.

### Vì sao 7

Cờ "đã gửi mốc 3 ngày" chỉ có nghĩa với ngày lúc gửi. Dời sự kiện từ còn-3-ngày
sang còn-20-ngày mà giữ cờ thì mốc 3 ngày sẽ bị bỏ qua khi nó đến **lần nữa**.

---

## 2. Đặt tên

App **đã có** khái niệm "reminder" rồi: `src/lib/reminders.ts` nhắc học sáng /
tối / tổng kết Chủ nhật, tự suy ra từ activity.

Cái mới gọi là **Event** trong code, nhãn ngoài UI là **"Reminder"**. Trùng tên
ở tầng file là cách nhanh nhất để sửa nhầm chỗ.

---

## 3. Data model

`users/{uid}/events/{eventId}`

| Field | Kiểu | Ghi chú |
|---|---|---|
| `title` | string | ≤ 60 ký tự |
| `date` | string | `"2026-10-15"` - ngày logic, mốc cắt 04:00 |
| `time` | string \| null | `"11:30"` - 24 tiếng. `null` = cả ngày |
| `note` | string \| null | ≤ 140 |
| `notified` | map | `{ "14": ts, "7": ts }` - mốc đã push |
| `archivedAt` | number \| null | xoá mềm |
| `createdAt` / `updatedAt` | number | |

`notified` nằm **trên chính doc sự kiện**, không ở `meta/pushLog`. Cờ đặt cạnh
dữ liệu nó nói về thì không bao giờ lệch, kể cả khi sự kiện đổi ngày.

### Index

`(archivedAt ASC, date ASC)` - cho query `where archivedAt == null orderBy date`.
Lọc archive **trong query** chứ không ở client: việc đã xoá tích lại mãi mãi,
còn việc đang chờ mới có trần 40. Chỉ cái có trần mới được stream.

---

## 4. Ngày logic - chỗ dễ sai nhất

`daysUntil` phải trừ theo **ngày lịch**, không phải `(target - now) / 86400000`.

Trừ theo ms thì lúc 23:00 việc của ngày mai ra 0 ngày → thông báo "Today" cho
một việc còn chưa tới.

Hai bản chép:
- `src/lib/events.ts` - bản gốc
- `functions/src/events.ts` - bản cho Cloud Function, **không import gì cả**

`dateLabel()` tự ghép chuỗi thay vì `toLocaleDateString()`: hàm đó đọc locale và
múi giờ của máy đang chạy, nên cùng một ngày ra thứ khác nhau giữa app (+07:00)
và Cloud Function (UTC).

`test/events-parity.test.ts` so hai bản trên hàng nghìn đầu vào. Đó là thứ **duy
nhất** giữ chúng không trôi khỏi nhau.

---

## 5. Chữ đếm ngược

Dùng **chung** cho danh sách trong app và cho push, để thông báo trên màn khoá
nói đúng câu người dùng thấy khi mở app.

| Còn | Chữ |
|---|---|
| 14 | `In 2 weeks` |
| 7 | `Next week` |
| 3 | `In 3 days` |
| 1 | `Tomorrow` |
| 0 | `Today` |
| −1 | `Yesterday` |
| ≥ 21 | `In 3 weeks` |
| ≥ 60 | `In 3 months` |

Mốc 7 và 14 nói bằng **tuần** vì đó là cách người ta thật sự nghĩ về chúng.
"In 14 days" bắt não phải chia; "In 2 weeks" thì không.

---

## 6. Push

`pushEvents` - `every day 06:00`, `Asia/Ho_Chi_Minh`, `asia-southeast1`.

1. Lấy máy đã bật push (`collectionGroup('meta').where('token','>','')` - index
   đã có từ Stage 6).
2. Đọc `events` chưa archive của user đó.
3. Lọc những cái `daysBetween(today, date)` ∈ {14,7,3,1,0} và chưa có cờ.
4. Gửi **một** thông báo. Nhiều cái cùng đến hạn thì gộp, tối đa 2 dòng rồi
   `and N more` - dài hơn thì màn khoá cắt mất.
5. Đánh dấu `notified` **sau khi gửi xong**. Gửi hỏng thì không đánh dấu, để
   ngày mai còn thử lại (nếu mốc chưa trôi qua).

`public/sw.js` **không đổi** - chỉ nhận `url: '/reminders'`, `tag: 'events'`.

---

## 7. Việc còn lại

- Sự kiện **lặp lại** hằng năm / hằng tháng (quyết định 8)
- Giờ trong ngày, nếu sau này có việc cần nhắc trước vài tiếng
- Dọn `events` đã archive quá cũ - hiện chúng ở lại vĩnh viễn

---

## 8. Hiển thị

Trên mỗi dòng, thứ to nhất là **đếm ngược**, không phải tên việc - người ta mở
tab này để biết "còn bao lâu".

Bản đầu để đếm ngược thành dòng chữ 13px màu xám nằm dưới tên việc: thứ quan
trọng nhất lại là thứ mờ nhất. Nay nó là khối số 24px bên trái, và ngày tháng
lấy lại màu chữ đầy đủ (`ink-soft`, không phải `ink-muted`).

`countdownParts()` tách số và đơn vị cho khối đó. Nó **phải** chọn cùng đơn vị
với `countdownText()` - danh sách ghi "7 days" trong khi push ghi "Next week"
là bắt người dùng dừng lại đối chiếu. Có test buộc điều đó trên 800 giá trị.

Màu chỉ dùng để báo **gấp**: đỏ ở ngày 0, hổ phách ở 1–3 ngày, còn lại để trung
tính. Tô màu mọi dòng thì màu không còn nói được gì.
