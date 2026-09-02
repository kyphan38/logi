# Tách 4 app thành 4 Firebase project riêng

Trạng thái: **chưa làm** (viết ngày 2026-09-02)
Áp dụng cho: cogi, logi, noda, mesi

---

## 1. Vì sao lại làm tiếp

Lần trước ta chỉ tách **database**: `cogi-db`, `logi-db`, `noda-db` trong cùng
project `kyphan38-apps`. Việc đó chữa đúng một bệnh: deploy rules của app này
xoá rules của app kia.

Nhưng còn nhiều thứ vẫn dùng chung ở mức project, và không thể tách bằng cách
đó được:

| Thứ dùng chung | Hậu quả |
| --- | --- |
| Auth user pool | 1 user = 1 UID cho cả 3 app. Xoá user ở app này là mất luôn ở app kia. |
| Tên Cloud Function | 3 app chung một không gian tên. Trùng tên là đè nhau. |
| Storage bucket mặc định + `storage.rules` | Y hệt lỗi rules cũ, chỉ khác là ở Storage. |
| Service account admin | Một key đọc được dữ liệu của cả 3 app. |
| Hạn mức free tier / billing | 3 app tranh nhau cùng một quota. |
| API key, authorized domains | Chung. |

Mỗi app là một sản phẩm độc lập. Best practice của Firebase là **một app một
project**. Làm bây giờ là đúng lúc: dữ liệu còn rất ít.

---

## 2. Quy ước đặt tên (chốt)

Format duy nhất cho cả 4 app:

```
Project ID       kyphan38-<app>-app
Display name     kyphan38-<app>-app          (đặt giống ID cho khỏi lệch)
Firestore DB     (default)                   -- KHÔNG dùng tên riêng nữa
Storage bucket   kyphan38-<app>-app.firebasestorage.app   (mặc định, tự sinh)
functions codebase  <app>
.firebaserc default  kyphan38-<app>-app
```

Bảng cụ thể:

| App | Project ID mới | Database | Tình trạng |
| --- | --- | --- | --- |
| cogi | `kyphan38-cogi-app` | `(default)` | phải tạo mới + chuyển dữ liệu |
| logi | `kyphan38-logi-app` | `(default)` | phải tạo mới + chuyển dữ liệu |
| noda | `kyphan38-noda-app` | `(default)` | phải tạo mới + chuyển dữ liệu + **chuyển Storage** |
| mesi | `kyphan38-mesi-app` | `(default)` | **đã đúng rồi — không phải làm gì** |

### Vì sao chọn hậu tố `-app`?

`kyphan38-mesi-app` đã tồn tại. Project ID của Firebase **không đổi tên được**,
chỉ đổi được display name. Nếu chọn format `kyphan38-<app>` thì mesi sẽ lệch, và
phải migrate mesi một cách vô ích (mesi đang chạy tốt, tách sẵn rồi).

Chọn `kyphan38-<app>-app` thì mesi khớp luôn. Tiết kiệm hẳn một lần migrate.

### Vì sao quay lại `(default)`?

- Firestore chỉ cho **một database miễn phí mỗi project**. `(default)` là cái đó.
- Trong project riêng, không còn ai để mà đụng nhau nữa, nên tên riêng vô nghĩa.
- Đã kiểm chứng: `getFirestore(app, '(default)')` **giống hệt** `getFirestore(app)`.
  Nên code giữ nguyên hình dạng, chỉ đổi giá trị hằng số `DB_ID`.

### Project cũ `kyphan38-apps`

- Đổi display name thành `ARCHIVE-kyphan38-apps` để khỏi bấm nhầm.
- **Giữ nguyên, không xoá.** Đây là bản backup của cả 3 app.
- Xoá sớm nhất: 30 ngày sau khi cả 3 app chạy ổn trên project mới.

---

## 3. Thứ tự làm

Làm **tuần tự từng app**, không làm song song. Xong hẳn app này mới sang app sau.
Lý do: mỗi app cần một lần đăng nhập Google trên project mới để lấy UID mới, và
làm song song rất dễ nhầm UID.

Đề xuất thứ tự (dễ → khó):

1. **logi** — không có Storage, function chỉ là scheduled/callable. Làm mẫu.
2. **cogi** — không có Storage (đã xác nhận), nhiều collection hơn.
3. **noda** — có Storage + download URL lưu trong Firestore. Khó nhất, để cuối.
4. **mesi** — không làm gì.

---

## 4. Việc chung: UID đổi khi sang project mới

Đây là điểm dễ sập nhất, ghi rõ ở đây một lần cho cả 4 plan.

Project mới = **user pool mới**. Cùng một tài khoản Google
`kyphan.work@gmail.com` khi đăng nhập vào project mới sẽ nhận **một UID khác**.

Hiện trạng đã kiểm tra (2026-09-02, project `kyphan38-apps`):

```
Auth users: 2
  yjzds6g7Y6VjmwtgW4QTnUqaX0F2  kyphan.work@gmail.com    google.com
  Y9bl48K3MnXsGfAP5J6mVSXwISt2  tienky30082002@gmail.com google.com

Dữ liệu của CẢ BA app đều nằm dưới đúng một UID: yjzds6g7Y6VjmwtgW4QTnUqaX0F2
  logi-db  users/yjzds.../  -> activities, meta, weekTargets   (21 doc)
  cogi-db  users/yjzds.../  -> 8 subcollection                  (18 doc)
  noda-db  users/yjzds.../  -> lessons (5) + shadowingAnalysis (24)
```

Vì chỉ có một UID cần đổi, việc chuyển dữ liệu rất nhẹ. Quy trình chung:

1. Tạo project mới, bật Auth Google, bật Firestore ở chế độ production.
2. Chạy app local trỏ vào project mới, **đăng nhập một lần**.
3. Lấy UID mới (xem Console → Authentication, hoặc `console.log(user.uid)`).
4. Chạy script copy có tham số `--from-uid <cũ> --to-uid <mới>`.
5. Cập nhật `NEXT_PUBLIC_ALLOWED_USER_UID` (và `ALLOWED_USER_UID` phía server)
   sang UID mới. **Quên bước này là app tự đăng xuất ngay.**

Ai cũng nên viết script copy theo cùng một khuôn: **mặc định là dry-run**, phải
truyền `--commit` mới thật sự ghi.

---

## 5. Việc chung: những chỗ phải sửa trong mỗi repo

Checklist dùng chung, plan riêng của từng app sẽ nói rõ file nào.

- [ ] `.firebaserc` → project ID mới
- [ ] `.env.local` → 6 biến `NEXT_PUBLIC_FIREBASE_*` mới
- [ ] `.env.local` → `NEXT_PUBLIC_ALLOWED_USER_UID` = UID mới
- [ ] `.env.local` → 3 biến `FIREBASE_ADMIN_*` = service account **mới**
- [ ] `.env.example` → cập nhật nếu tên biến có thay đổi
- [ ] hằng số `DB_ID` → `'(default)'`
- [ ] `firebase.json` → `firestore` quay lại dạng **object** (không còn mảng),
      bỏ hẳn mục `(default)` deny-all
- [ ] xoá `firestore.default.rules` (không còn database nào để khoá)
- [ ] functions: bỏ tham số database id nếu có; secret phải set lại trên project mới
- [ ] scripts/: bỏ database id cứng
- [ ] deploy: `firebase deploy --only firestore` (+ `storage`, `functions` nếu có)
- [ ] chạy test + build
- [ ] kiểm tra tay trên máy thật

---

## 6. Việc chung: những cái KHÔNG tự chuyển được

Phải làm tay trên Console của project mới:

| Thứ | Ghi chú |
| --- | --- |
| Bật Google sign-in provider | Console → Authentication → Sign-in method |
| Authorized domains | `localhost` có sẵn. Thêm domain thật nếu app đã deploy. |
| Tạo Firestore database | Chọn **Production mode**, region **asia-southeast1** (Singapore) cho cả 4 app |
| Tạo Storage bucket | Chỉ noda cần |
| Service account key mới | Console → Project settings → Service accounts → Generate new key |
| Secret của Cloud Functions | `firebase functions:secrets:set GEMINI_API_KEY` chạy lại trên project mới |
| Composite indexes | `firebase deploy --only firestore` sẽ tự tạo từ `firestore.indexes.json` |
| Lịch sử Auth (ngày tạo, refresh token) | Mất. Chấp nhận. |

**Cảnh báo region:** region của Firestore chọn xong là **không đổi được**. Chọn
`asia-southeast1` cho cả 4 project để nhất quán và gần Việt Nam nhất.

---

## 7. Rollback

Vì ta **không xoá gì** ở project cũ, rollback rất đơn giản: `git revert` commit
đổi cấu hình, khôi phục `.env.local` từ bản backup, deploy lại. Dữ liệu cũ vẫn
nguyên trong `kyphan38-apps`.

Điều kiện bắt buộc trước khi bắt đầu mỗi app:
- [ ] `cp .env.local /tmp/<app>.env.bak`
- [ ] git tree sạch, đã push

---

## 8. Plan riêng của từng app

- logi → `roadmap/PLAN-project-split-logi.md`
- cogi → `/Users/kyphan/ws/app/cogi/web/docs/PLAN-project-split.md`
- noda → `/Users/kyphan/ws/app/noda/PLAN-project-split.md`
- mesi → `/Users/kyphan/ws/app/mesi/docs/PLAN-project-split.md` (chủ yếu là "không phải làm gì", kèm phần dọn nhỏ)
