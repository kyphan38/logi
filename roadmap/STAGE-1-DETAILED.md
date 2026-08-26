# STAGE 1 — Foundation & Auth

> Plan này viết cho một AI coding agent thực thi. Làm đúng thứ tự task.
> Sau mỗi task có mục **Verify** — phải pass mới đi tiếp.
> Nếu gặp mâu thuẫn hoặc thiếu thông tin, **DỪNG và hỏi người dùng**, không tự đoán.

---

## 0. Bối cảnh

Xây `logi` — web app kiểm toán quỹ thời gian cá nhân, một người dùng duy nhất.
Mobile-first (iPhone 11, browser Edge/Safari), UI tiếng Anh.

Stage 1 **chỉ** làm hạ tầng: project scaffold, Firebase, đăng nhập, app shell rỗng,
deploy. Không có tính năng nghiệp vụ nào.

### File người dùng đã có sẵn
Nằm ở thư mục gốc hoặc thư mục tải về:
- `logi.ts` — data model, categories, targets, presets
- `balance.ts` — logic thời gian logic / deviation / debt
- `gemini-parse.ts` — schema + prompt Gemini (Stage 3 mới dùng)
- `firestore.rules` — security rules
- Một file credentials Firebase (xem Task 2)

### KHÔNG làm ở Stage 1
- Activity CRUD, timer, màn hình Now có chức năng
- Voice, MediaRecorder, gọi Gemini
- Chart, analytics, export
- Target UI, deviation banner, reminder
- Test tự động (trừ khi người dùng yêu cầu sau)

Agent **không được** tự ý làm sớm các mục trên. Scope creep ở stage này sẽ khiến
phần auth khó debug.

---

## Task 1 — Scaffold project

```bash
npx create-next-app@latest logi \
  --typescript --tailwind --app --src-dir --eslint \
  --import-alias "@/*" --no-turbopack
cd logi
npm i firebase firebase-admin
```

Nếu `create-next-app` hỏi thêm câu nào, chọn mặc định.

### Cấu trúc thư mục cần tạo

```
logi/
├── firestore.rules
├── firebase.json
├── vercel.json
├── .env.local
├── .env.example
├── .gitignore
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── globals.css
    │   ├── login/page.tsx
    │   ├── (main)/
    │   │   ├── layout.tsx
    │   │   ├── now/page.tsx
    │   │   ├── history/page.tsx
    │   │   └── analytics/page.tsx
    │   └── api/auth/session/route.ts
    ├── components/
    │   ├── LoginView.tsx
    │   ├── BottomNav.tsx
    │   └── AppShell.tsx
    ├── contexts/
    │   └── AuthContext.tsx
    ├── lib/
    │   ├── firebase-client.ts
    │   ├── firebase-admin.ts
    │   ├── server-auth.ts
    │   └── balance.ts        ← copy từ file người dùng
    └── types/
        └── logi.ts           ← copy từ file người dùng
```

Copy `logi.ts` → `src/types/`, `balance.ts` → `src/lib/`, `gemini-parse.ts` →
`src/lib/` (chưa dùng, cứ để sẵn), `firestore.rules` → thư mục gốc.

**Sửa import trong `balance.ts`**: đổi `from '../types/logi'` thành `from '@/types/logi'`.
Tương tự với `gemini-parse.ts`.

### Verify
`npm run dev` chạy được, mở `http://localhost:3000` không lỗi.
`npx tsc --noEmit` không báo lỗi.

---

## Task 2 — Xử lý file credentials

**Đây là task nhạy cảm nhất. Đọc kỹ.**

Firebase cho tải hai loại file rất khác nhau. Agent phải tự nhận diện:

### Loại A — Web app config
Nội dung có dạng `firebaseConfig` với các key: `apiKey`, `authDomain`, `projectId`,
`storageBucket`, `messagingSenderId`, `appId`.

→ Các giá trị này **an toàn khi để ở client**. Map vào `NEXT_PUBLIC_*`.

### Loại B — Service account JSON
Nội dung có `"type": "service_account"` và `"private_key": "-----BEGIN PRIVATE KEY..."`.

→ Đây là **khoá admin, bỏ qua toàn bộ Security Rules**. Xử lý bắt buộc:
- **KHÔNG BAO GIỜ** đặt vào biến `NEXT_PUBLIC_*`
- **KHÔNG BAO GIỜ** commit vào git
- **KHÔNG** in nội dung ra console hay log
- Chỉ trích 3 trường: `project_id`, `client_email`, `private_key`

Nếu người dùng chỉ đưa Loại B, agent phải **hỏi xin thêm** web app config
(lấy ở Firebase Console → Project Settings → General → Your apps → SDK setup).

Nếu người dùng chỉ đưa Loại A, agent phải **hỏi xin thêm** service account
(Firebase Console → Project Settings → Service accounts → Generate new private key).

**Cả hai đều cần** cho kiến trúc này.

### Tạo `.env.local`

```bash
# ---- Client (an toàn để lộ) ----
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# ---- Server only (BÍ MẬT) ----
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ---- Allowlist ----
ALLOWED_USER_EMAIL=
NEXT_PUBLIC_ALLOWED_USER_EMAIL=

# ---- Session ----
AUTH_COOKIE_NAME=logi_session
AUTH_COOKIE_MAX_AGE_SECONDS=1209600
```

`FIREBASE_ADMIN_PRIVATE_KEY` phải bọc trong dấu nháy kép và giữ nguyên `\n`
dạng literal hai ký tự. Code sẽ `.replace(/\\n/g, '\n')` lúc đọc.

Hỏi người dùng email Google họ dùng để đăng nhập → điền vào cả hai biến
`ALLOWED_USER_EMAIL`.

Tạo `.env.example` y hệt nhưng để trống hết giá trị.

### `.gitignore`
Đảm bảo có:
```
.env*.local
*serviceAccount*.json
*firebase-adminsdk*.json
```

Sau khi trích xong biến môi trường, **xoá file service account JSON gốc** khỏi
thư mục project (hoặc yêu cầu người dùng chuyển nó ra ngoài repo).

### Verify
- `git status` không thấy `.env.local` hay file JSON nào.
- `grep -r "private_key\|BEGIN PRIVATE" src/` không ra kết quả.
- `grep -rn "NEXT_PUBLIC" src/ | grep -i "admin\|private\|secret"` không ra kết quả.

---

## Task 3 — Firebase client init

`src/lib/firebase-client.ts`

Yêu cầu:
- Singleton pattern qua `getApps().length ? getApp() : initializeApp(config)`.
  Bắt buộc — Next.js hot reload sẽ khởi tạo lại nhiều lần và ném lỗi duplicate app.
- Export `app`, `auth`, `db`.
- Bật **IndexedDB persistence đa tab** qua
  `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`.
- Bọc try/catch, fallback về `memoryLocalCache()` nếu browser không hỗ trợ
  (chế độ riêng tư trên iOS Safari sẽ fail ở đây).
- Chỉ khởi tạo Firestore ở phía client — guard `typeof window !== 'undefined'`.

Lý do bật persistence: bạn dùng trên điện thoại, mạng có lúc chập chờn, Start/Stop
phải chạy được offline và sync sau.

### Verify
Import vào một page, `console.log(auth.app.name)` ra `[DEFAULT]`, không lỗi duplicate
khi save file nhiều lần (hot reload).

---

## Task 4 — Firebase Admin init

`src/lib/firebase-admin.ts`

Yêu cầu:
- `import 'server-only'` ở dòng đầu — chặn file này lọt vào client bundle.
- Singleton qua `getApps()`.
- `cert({ projectId, clientEmail, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, '\n') })`.
- Export `adminAuth` và `adminDb`.
- Nếu thiếu env var → throw lỗi rõ ràng nêu tên biến bị thiếu.

### Verify
Tạo route tạm `/api/health` gọi `adminAuth.listUsers(1)`, trả 200. Xong thì xoá route.

---

## Task 5 — Session cookie API

`src/app/api/auth/session/route.ts`

### `POST` — tạo session
1. Đọc `{ idToken }` từ body.
2. `adminAuth.verifyIdToken(idToken)`.
3. **Kiểm tra allowlist**: `decoded.email === process.env.ALLOWED_USER_EMAIL`.
   Không khớp → trả `403` với message rõ ràng. Đây là lớp bảo vệ chính của app
   một-người-dùng.
4. `adminAuth.createSessionCookie(idToken, { expiresIn: 14 * 24 * 60 * 60 * 1000 })`.
5. Set cookie:
   ```
   name: process.env.AUTH_COOKIE_NAME
   httpOnly: true
   secure: process.env.NODE_ENV === 'production'
   sameSite: 'lax'
   path: '/'
   maxAge: Number(process.env.AUTH_COOKIE_MAX_AGE_SECONDS)
   ```
6. Trả `{ ok: true }`.

**Quan trọng**: dùng `createSessionCookie`, KHÔNG lưu thẳng ID token vào cookie.
ID token hết hạn sau 1 giờ — bạn dùng app hàng ngày, sẽ phải login lại liên tục.
Session cookie sống 14 ngày.

### `DELETE` — đăng xuất
Xoá cookie (set `maxAge: 0`). Trả `{ ok: true }`.

### Xử lý lỗi
Mọi lỗi → trả JSON `{ error: string }` với status phù hợp. Không để lộ stack trace.

---

## Task 6 — Server auth helper

`src/lib/server-auth.ts`

- `import 'server-only'`.
- `getSessionUser()`: đọc cookie → `adminAuth.verifySessionCookie(cookie, true)`
  (tham số `true` = check revoked) → kiểm tra allowlist → trả
  `{ uid, email } | null`. Nuốt lỗi, trả `null`.
- `requireSessionUser()`: gọi `getSessionUser()`, `null` thì `throw`. Dùng trong
  API route ở các stage sau (đặc biệt `/api/parse` ở Stage 3).

---

## Task 7 — AuthContext

`src/contexts/AuthContext.tsx` — `'use client'`

Dùng React Context thay vì HOC bọc layout, để mọi component lấy được `user` và
`loading` mà không cần prop drilling.

State: `{ user: User | null, loading: boolean, error: string | null }`
Actions: `signIn()`, `signOut()`

### `signIn()`
1. `signInWithPopup(auth, new GoogleAuthProvider())`
2. `await result.user.getIdToken()`
3. `POST /api/auth/session` với idToken
4. Nếu response `403` → `signOut(auth)` ngay + set error
   `"This account is not authorized."`
5. Nếu OK → `router.push('/now')`

### Xử lý lỗi bắt buộc
- `auth/unauthorized-domain` → hiện hướng dẫn: thêm domain vào Firebase Console →
  Authentication → Settings → Authorized domains. Lỗi này chắc chắn sẽ gặp lúc
  deploy Vercel lần đầu.
- `auth/popup-blocked` → gợi ý cho phép popup. **Trên iOS Safari/Edge popup hay bị
  chặn** — nếu gặp, fallback sang `signInWithRedirect` và xử lý
  `getRedirectResult()` lúc mount.
- `auth/popup-closed-by-user` → im lặng, không hiện lỗi.

### `signOut()`
Gọi `signOut(auth)` **và** `DELETE /api/auth/session`. Thiếu bước hai thì cookie
vẫn còn và server vẫn coi là đã đăng nhập.

### Đồng bộ state
Dùng `onAuthStateChanged` để set `user` và tắt `loading`. Nếu client có user nhưng
server không có cookie hợp lệ (VD cookie hết hạn sau 14 ngày), gọi lại
`POST /api/auth/session` để làm mới.

Wrap `AuthProvider` ở `src/app/layout.tsx`.

---

## Task 8 — Login view

`src/components/LoginView.tsx` + `src/app/login/page.tsx`

- Toàn màn hình, căn giữa, mobile-first.
- Logo/wordmark "logi" + một dòng tagline tiếng Anh.
- Một nút "Continue with Google". Không có form email/password.
- Hiện `error` từ AuthContext trong khối cảnh báo dễ đọc.
- Đang loading → disable nút, hiện spinner.
- Nếu đã đăng nhập → redirect `/now`.

Giao diện tiếng Anh toàn bộ.

---

## Task 9 — App shell & routing

### `src/app/page.tsx`
Redirect: có user → `/now`, không → `/login`.

### `src/app/(main)/layout.tsx` — `'use client'`
- Dùng `useAuth()`. `loading` → skeleton. Không user → `router.replace('/login')`.
- Có user → render children + `<BottomNav />`.

### `src/components/BottomNav.tsx`
Bottom navigation cố định, 3 tab: **Now** / **History** / **Analytics**.
- Chỉ hiện trên mobile; ở màn hình ≥ `md` chuyển thành sidebar trái.
- Tab đang active highlight rõ.
- `padding-bottom: env(safe-area-inset-bottom)` — thiếu cái này thì trên iPhone
  thanh nav bị home indicator che mất.

### 3 page rỗng
`now`, `history`, `analytics` — mỗi page chỉ có tiêu đề và placeholder
"Coming in Stage 2". Có nút Sign out ở màn hình Now.

### Viewport
Trong `src/app/layout.tsx` export:
```ts
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,   // chặn iOS tự zoom khi focus input
  viewportFit: 'cover',
};
```

---

## Task 10 — Firestore rules & indexes

### Deploy rules
```bash
npm i -g firebase-tools
firebase login
firebase init firestore    # chọn project đã có, giữ nguyên firestore.rules
firebase deploy --only firestore:rules
```

Không để `firebase init` ghi đè `firestore.rules` — file này đã viết sẵn.

### `firestore.indexes.json`
Tạo composite index cho các query Stage 2 sẽ dùng:
- `activities`: `logicalDate ASC, startAt ASC`
- `activities`: `logicalWeek ASC, startAt ASC`
- `activities`: `status ASC, startAt DESC`

```bash
firebase deploy --only firestore:indexes
```

### Verify
Vào Firebase Console → Firestore → Rules, thấy rules mới. Thử đọc collection
`users/{uid nào đó khác}` từ console → bị từ chối.

---

## Task 11 — Deploy Vercel

1. Push code lên GitHub (kiểm tra lại `.env.local` KHÔNG có trong commit).
2. Import repo vào Vercel.
3. Thêm **toàn bộ** biến môi trường vào Vercel → Settings → Environment Variables.
   `FIREBASE_ADMIN_PRIVATE_KEY` dán nguyên cả dấu nháy và `\n`.
4. Deploy.
5. **Bắt buộc**: Firebase Console → Authentication → Settings → Authorized domains
   → thêm domain Vercel (`logi-xxx.vercel.app`). Bỏ bước này thì login sẽ fail với
   `auth/unauthorized-domain`.

### `vercel.json`
```json
{
  "functions": {
    "src/app/api/**/*.ts": { "maxDuration": 30 }
  }
}
```
(chuẩn bị sẵn cho `/api/parse` ở Stage 3)

---

## Task 12 — Kiểm thử trên thiết bị thật

Đây là bước quyết định, không được bỏ. Mở URL Vercel trên **iPhone 11, browser Edge**:

| # | Kiểm tra | Mong đợi |
|---|---|---|
| 1 | Mở app lần đầu | Ra màn hình Login |
| 2 | Bấm Continue with Google | Popup (hoặc redirect) hiện ra |
| 3 | Đăng nhập bằng email allowlist | Vào `/now` |
| 4 | Đóng hẳn browser, mở lại | Vẫn đăng nhập, không hỏi lại |
| 5 | Chuyển tab bottom nav | Điều hướng mượt, không reload trắng |
| 6 | Bottom nav | Không bị home indicator che |
| 7 | Bấm Sign out | Về Login, cookie đã xoá |
| 8 | Đăng nhập bằng Google account KHÁC | Bị từ chối, hiện thông báo rõ ràng |
| 9 | Bật chế độ máy bay, mở app | Không crash, hiện trạng thái offline |
| 10 | Xoay ngang màn hình | Layout không vỡ |

Test 8 là quan trọng nhất — nó chứng minh allowlist hoạt động.
Test 4 chứng minh session cookie 14 ngày hoạt động (nếu phải login lại thì
nhiều khả năng đang lưu nhầm ID token).

---

## Definition of Done — Stage 1

Chỉ đánh dấu hoàn thành khi **tất cả** đúng:

- [ ] `npx tsc --noEmit` sạch
- [ ] `npm run build` thành công
- [ ] Không có secret nào trong git history
- [ ] Không có biến `NEXT_PUBLIC_*` nào chứa dữ liệu admin
- [ ] Deploy Vercel chạy được
- [ ] Firestore rules đã deploy
- [ ] 10/10 mục ở Task 12 pass trên iPhone thật
- [ ] Email ngoài allowlist bị chặn
- [ ] `logi.ts`, `balance.ts`, `gemini-parse.ts` đã nằm đúng chỗ và import được

---

## Báo cáo cho người dùng khi xong

Agent trả về:
1. URL Vercel
2. Cây thư mục thực tế
3. Danh sách env var đã cấu hình (**chỉ tên, không giá trị**)
4. Kết quả 10 mục kiểm thử
5. Vấn đề gặp phải và cách xử lý
6. Bất kỳ chỗ nào lệch so với plan này, kèm lý do

---

## Quy tắc cho agent

**Dừng và hỏi người dùng khi:**
- Thiếu credentials hoặc không rõ file thuộc loại A hay B
- Không rõ email nào cần allowlist
- Firebase project chưa bật Google sign-in provider
- Bất kỳ bước nào cần thao tác thủ công trên Firebase Console

**Không được:**
- Tự nghĩ ra giá trị credentials
- Commit secret
- Bỏ qua allowlist "cho tiện test"
- Cài thêm dependency ngoài danh sách mà không nêu lý do
- Làm sớm tính năng của Stage 2+
- Sửa `logi.ts` / `balance.ts` / `gemini-parse.ts` (trừ dòng import) — các con số
  target và công thức trong đó đã được kiểm chứng
