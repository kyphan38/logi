# STAGE 10 — Routine: checklist hằng ngày theo thứ

> Thay thế phần **task tuần** của Stage 8. Bedtime của Stage 8 giữ nguyên.

---

## 0. Vì sao làm

Task Stage 8 gắn với thời gian: có thời lượng, bấm Start/Stop, đủ giờ mới tính
là xong. Pool tối đa 5 task, mỗi ngày tối đa 3. Thực tế người dùng cần thứ đơn
giản hơn: mỗi ngày một danh sách việc (bài tập, chủ đề học), tick là xong.

Danh sách khác nhau theo thứ, nhưng lặp lại y hệt mỗi tuần cho tới khi người
dùng sửa. Không cần lên kế hoạch lại từng tuần.

---

## 1. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | **Nhóm** (Exercise, IT…) chứa nhiều **mục**. Không giới hạn số nhóm/mục |
| 2 | Mỗi mục có `days` (danh sách thứ). Mục lặp nhiều ngày thì gõ tên **một lần** |
| 3 | Template **không gắn tuần**. Sửa lúc nào áp dụng từ lúc đó |
| 4 | Chỉ tick. **Không** thời lượng, không Start/Stop, không category |
| 5 | Reset lúc **04:00**, cùng mốc cắt ngày logic của cả app |
| 6 | Hiện ở **Now**, dưới lưới 4 nút. Chỉnh ở **Targets** |
| 7 | Nhóm không có mục nào hôm nay → **ẩn** ở Now |
| 8 | Xoá mục khỏi template → biến mất khỏi hôm nay luôn; tick cũ ở lại trong doc ngày, không được đếm |
| 9 | Phase này chỉ có tick + đếm `2/3`. Streak / % tuần để sau |

---

## 2. Data model

### Template
`users/{uid}/routines/{groupId}` — `title`, `order`, `items[]`, `archivedAt`

Mỗi mục: `{ id, text, days }`. `days` theo `Date.getDay()` (0 = CN).
Xoá nhóm = set `archivedAt`, không hard-delete.

### Tick theo ngày
`users/{uid}/routineChecks/{logicalDate}` — `{ date, checked: { itemId: epochMs } }`

"Reset" không cần xoá gì: ngày logic mới đọc một doc mới, đang trống. Lịch sử
tick vẫn còn, nên streak sau này không phải đổi schema.

Tick / bỏ tick ghi bằng `setDoc(..., { merge: true })` theo key, nên hai chạm
nhanh vào hai mục khác nhau không ghi đè nhau.

---

## 3. Gỡ task Stage 8

- Xoá toàn bộ UI, hook, lib, test của task tuần; card Tasks trong Trend.
- `Activity.taskId` bỏ khỏi code. Record cũ còn field này trên Firestore;
  `validActivity` vẫn chấp nhận nó để update record cũ không bị chặn.
- `taskPool`, `weekPlans`: rules chỉ còn **đọc**. Dữ liệu cũ giữ nguyên.

---

## 4. File

- `src/lib/routine.ts` — logic thuần, test ở `test/routine.test.ts`
- `src/lib/routine-store.ts` — Firestore
- `src/hooks/useRoutine.ts` — `useRoutines`, `useRoutineChecks(date)`
- `src/components/RoutineChecklist.tsx` — Now
- `src/components/RoutineSection.tsx`, `RoutineSheet.tsx` — Targets
