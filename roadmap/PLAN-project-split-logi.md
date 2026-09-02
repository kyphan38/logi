# logi → project riêng `kyphan38-logi-app`

Trạng thái: **chưa làm**
Đọc `roadmap/PLAN-project-split.md` trước (quy ước tên + phần việc chung).

Thứ tự trong 4 app: **làm logi đầu tiên**. logi không dùng Storage, nên đây là
ca dễ nhất, dùng làm mẫu cho cogi và noda.

---

## 0. Hiện trạng logi

| Mục | Giá trị hiện tại |
| --- | --- |
| Project | `kyphan38-apps` (dùng chung) |
| Database | `logi-db` |
| Dữ liệu | `users/yjzds6g7Y6VjmwtgW4QTnUqaX0F2/` → `activities`, `meta`, `weekTargets` (21 doc) |
| Auth | Google, allowlist theo **email** (`ALLOWED_USER_EMAIL`), không theo UID |
| Storage | **không dùng** |
| Functions | `pushReminders`, `trimPushLog` — cả hai là `onSchedule`, region `asia-southeast1`, không có secret |
| FCM | **có** — `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, token lưu ở `users/{uid}/meta/fcm.token` |
| Hosting | Vercel (`vercel.json`) |
| Indexes | 4 composite trên `activities` + 1 fieldOverride collection-group `meta.token` |

Hai điểm sướng cho logi:
- Allowlist dùng **email**, không phải UID → UID đổi cũng không phải sửa `.env`.
- Không có Storage → không có download URL nào phải viết lại.

Một điểm phải nhớ: **FCM token sẽ chết**. Token gắn với sender ID của project cũ.

---

## 1. Việc trên Console (làm một lần, trước khi đụng code)

1. Tạo project **`kyphan38-logi-app`**, display name để giống ID.
   - Tắt Google Analytics (không dùng).
2. Authentication → Sign-in method → bật **Google**. Support email: tài khoản của bạn.
3. Firestore Database → Create database:
   - Database ID để nguyên **`(default)`**
   - Location **`asia-southeast1`** (không đổi được về sau)
   - **Production mode**
4. Project settings → General → Your apps → Add app → **Web** (`</>`),
   tên `logi`. Chép 6 giá trị config ra chỗ tạm.
5. Cloud Messaging → Web configuration → **Generate key pair** → chép VAPID key mới.
6. Project settings → Service accounts → **Generate new private key** → file JSON.
7. Nâng project lên **Blaze**. Bắt buộc, vì Cloud Functions v2 cần Blaze.

Chỉ khi 7 mục trên xong mới sang bước 2.

---

## 2. Backup

```bash
cd /Users/kyphan/ws/app/logi
git status --short          # phải sạch
cp .env.local /tmp/logi.env.bak
```

Dữ liệu cũ trong `kyphan38-apps/logi-db` **không xoá**, nên đó cũng là backup.

---

## 3. Đổi `.env.local`

Thay 6 dòng client + VAPID + 3 dòng admin. Tên biến giữ nguyên hết, chỉ đổi giá trị:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...            (mới)
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=kyphan38-logi-app.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=kyphan38-logi-app
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=kyphan38-logi-app.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...  (mới)
NEXT_PUBLIC_FIREBASE_APP_ID=...               (mới)
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...            (mới, từ bước 1.5)

FIREBASE_ADMIN_PROJECT_ID=kyphan38-logi-app
FIREBASE_ADMIN_CLIENT_EMAIL=...   (từ file JSON mới)
FIREBASE_ADMIN_PRIVATE_KEY="..."  (từ file JSON mới)
```

Giữ nguyên: `ALLOWED_USER_EMAIL`, `NEXT_PUBLIC_ALLOWED_USER_EMAIL`,
`AUTH_COOKIE_NAME`, `AUTH_COOKIE_MAX_AGE_SECONDS`, `GEMINI_API_KEY`.

> Service account cũ (`firebase-adminsdk-fbsvc@kyphan38-apps...`) **đừng xoá vội** —
> script copy ở bước 6 cần nó để đọc dữ liệu nguồn.

---

## 4. Sửa code

| File | Sửa gì |
| --- | --- |
| `.firebaserc` | `"default": "kyphan38-apps"` → `"kyphan38-logi-app"` |
| `src/lib/db-id.ts` | `DB_ID = 'logi-db'` → `'(default)'`, viết lại comment |
| `functions/src/index.ts:26` | `getFirestore('logi-db')` → `getFirestore()` |
| `scripts/count-sleep.mjs:46` | `getFirestore(app, 'logi-db')` → `getFirestore(app)` |
| `scripts/delete-sleep.mjs:43` | như trên |
| `firebase.json` | `firestore` quay lại **object**, bỏ mục `(default)` |
| `firestore.default.rules` | **xoá file** |
| `scripts/copy-to-logi-db.mjs` | xoá (đã xong việc) hoặc thay bằng script mới ở bước 6 |
| `README.md` | sửa lại dòng 11 bảng Security review + đoạn nói về `logi-db` |

`firebase.json` sau khi sửa:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "logi",
      "runtime": "nodejs22",
      "predeploy": ["npm --prefix \"$RESOURCE_DIR\" run build"],
      "ignore": ["node_modules", ".git", "*.local"]
    }
  ]
}
```

`src/lib/firebase-client.ts` và `src/lib/firebase-admin.ts` **không cần sửa** —
chúng vẫn gọi `getFirestore(app, DB_ID)`, và đã kiểm chứng rằng
`getFirestore(app, '(default)')` cho ra đúng cùng một thứ với `getFirestore(app)`.

Giữ `db-id.ts` lại (không xoá) để sau này còn chỗ đổi nếu cần.

---

## 5. Deploy rules + indexes lên project mới

```bash
firebase use kyphan38-logi-app
firebase deploy --only firestore
```

Luôn dùng `--only firestore`, **đừng dùng** `--only firestore:rules` (bug
firebase-tools #10447 làm nó im lặng không làm gì).

Kiểm tra: Console → Firestore → tab Rules phải thấy hàm `validActivity`.
Tab Indexes: 4 index `activities` đang **Building**, chờ xanh hết.

---

## 6. Chuyển dữ liệu

Chỉ 21 doc, một UID. Nhưng UID **sẽ đổi**, nên phải lấy UID mới trước.

### 6a. Lấy UID mới

```bash
npm run dev
```

Đăng nhập bằng `kyphan.work@gmail.com`. Vì allowlist theo email nên vào được ngay.
App sẽ trống trơn — đúng, chưa copy dữ liệu.

Lấy UID mới: Console → Authentication → Users → cột User UID.

### 6b. Script copy giữa hai project

Viết `scripts/copy-to-new-project.mjs`. Khác script cũ ở chỗ nó dùng **hai
service account** (một của project cũ, một của project mới) và **đổi UID**.

```
node --env-file=.env.local scripts/copy-to-new-project.mjs \
  --from-uid yjzds6g7Y6VjmwtgW4QTnUqaX0F2 --to-uid <UID_MỚI>            # dry-run
node --env-file=.env.local scripts/copy-to-new-project.mjs \
  --from-uid ... --to-uid ... --commit                                   # ghi thật
```

Yêu cầu với script:
- **Mặc định dry-run.** Chỉ `--commit` mới ghi.
- Nguồn: `kyphan38-apps` / `logi-db`, đọc bằng service account cũ
  (đọc từ `/tmp/logi.env.bak` hoặc biến `OLD_FIREBASE_ADMIN_*`).
- Đích: `kyphan38-logi-app` / `(default)`, dùng `FIREBASE_ADMIN_*` mới.
- Chép `users/{uid}` doc gốc + 3 subcollection `activities`, `meta`, `weekTargets`.
- Batch 400.
- **Bỏ field `token` trong `users/{uid}/meta/fcm`.** Token cũ thuộc sender ID cũ,
  copy sang là rác, còn làm `pushReminders` gửi trượt rồi tự xoá.
- In số doc từng collection ở cả dry-run lẫn sau khi commit, để so.

### 6c. Đối chiếu

Chạy lại dry-run sau khi commit, số phải khớp: `activities` + `meta` +
`weekTargets` = 21 doc.

---

## 7. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

Lần đầu deploy lên project mới, CLI sẽ hỏi bật một loạt API (Cloud Build,
Artifact Registry, Eventarc, Cloud Scheduler). Đồng ý hết.

Kiểm tra:
```bash
firebase functions:list
```
Phải thấy `pushReminders` và `trimPushLog`, region `asia-southeast1`.

Cả hai đều là `onSchedule` nên **không cần** tuỳ chọn database. Không có secret
nào phải set lại.

`trimPushLog` chạy chủ nhật 03:00, `pushReminders` theo lịch riêng — muốn thử ngay
thì Console → Cloud Scheduler → Force run.

---

## 8. Bật lại push trên máy thật

Token cũ đã bỏ, VAPID key đổi. Nên **phải bật lại push bằng tay** trên từng thiết bị:

- Mở app trên iPhone (bản đã cài màn hình chính) → tắt push → bật lại.
- Kiểm tra Firestore: `users/{uid_mới}/meta/fcm` phải có `token` mới.
- Force run `pushReminders` để xác nhận có nhận được thông báo.

Nếu bỏ qua bước này thì nhắc nhở im lặng không chạy nữa mà không báo lỗi gì.

---

## 9. Vercel

Env var nằm trên dashboard Vercel, `.env.local` không tự đẩy lên.

- Vercel → project logi → Settings → Environment Variables.
- Cập nhật đúng 10 biến ở bước 3 (6 client + VAPID + 3 admin) cho **cả 3 môi trường**
  Production / Preview / Development.
- Deploy lại (Redeploy, **bỏ tick** "use existing build cache").
- Console Firebase mới → Authentication → Settings → Authorized domains →
  thêm domain Vercel (`*.vercel.app` và domain thật nếu có).
  **Quên bước này thì đăng nhập trên web sẽ hỏng.**

---

## 10. Kiểm tra

Tự động:
```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Bằng tay, trên máy thật:
- [ ] Đăng nhập Google được
- [ ] Now: Start một hoạt động, Stop, thấy nó trong History
- [ ] History: sửa và xoá một bản ghi
- [ ] History: nhập tay, để trống End → thành hoạt động đang chạy
- [ ] Targets: hiện đúng số cũ (đã copy sang)
- [ ] Voice: nói một câu, ParseConfirmCard hiện đúng
- [ ] Push: bật lại, nhận được thông báo thử

---

## 11. Dọn dẹp (chỉ làm sau 30 ngày chạy ổn)

- [ ] Xoá `scripts/copy-to-logi-db.mjs` và `scripts/copy-to-new-project.mjs`
- [ ] Trong `kyphan38-apps`: xoá database `logi-db`
- [ ] Xoá bản backup `/tmp/logi.env.bak` (nó có private key)
- [ ] Xoá file JSON service account đã tải về

**Không** xoá project `kyphan38-apps` chừng nào cogi và noda chưa xong.

---

## 12. Checklist ngắn

- [ ] 1. Console: tạo project, bật Auth, tạo Firestore, web app, VAPID, service account, Blaze
- [ ] 2. Backup `.env.local`
- [ ] 3. Đổi `.env.local`
- [ ] 4. Sửa code (7 file)
- [ ] 5. `firebase deploy --only firestore`
- [ ] 6. Đăng nhập lấy UID mới → chạy script copy
- [ ] 7. `firebase deploy --only functions`
- [ ] 8. Bật lại push trên thiết bị
- [ ] 9. Cập nhật env + authorized domains trên Vercel
- [ ] 10. Chạy test + kiểm tra tay
- [ ] 11. Commit
- [ ] 12. Dọn dẹp (sau 30 ngày)
