# PLAN - Tách database Firestore (logi)

Ngày viết: 2026-09-01. Trạng thái: **chưa làm**.

Bản song song: `cogi/web/docs/PLAN-db-split.md`, `noda/PLAN-db-split.md`.

---

## 0. Vì sao

Ba app **cogi**, **logi**, **noda** dùng chung một Firebase project `kyphan38-apps`,
và dùng chung một database Firestore `(default)`.

Một database chỉ có **một** bộ rules. `firebase deploy --only firestore:rules` thay
toàn bộ bộ rules đó. Ngày 2026-08-26 logi deploy rules → rules của cogi bị xoá sạch
→ mọi lượt đọc của cogi trả về `permission-denied`. cogi hỏng cho tới hôm nay.

Cách chữa: mỗi app một database riêng. Mỗi database có bộ rules riêng, nên deploy
không đè nhau nữa.

| App  | Database mới |
|------|--------------|
| cogi | `cogi-db`    |
| logi | `logi-db`    |
| noda | `noda-db`    |

`(default)` giữ lại dữ liệu cũ, khoá deny-all ở bước cuối.

### Hai xung đột khác, cùng một gốc

1. **Functions**: logi và noda đều ghi `"codebase": "default"` trong `firebase.json`.
   Khi logi deploy functions, CLI thấy `analyzeShadowingPattern` của noda "có trên
   project nhưng không có trong code" và hỏi xoá. Bấm nhầm là mất function của noda.
   Sửa: mỗi repo một tên codebase riêng.
2. **Storage rules**: cogi và noda cùng deploy `storage.rules` cho một bucket. cogi
   đã chép rules của noda vào file của mình để chữa cháy. cogi không dùng Storage,
   nên cogi bỏ hẳn phần storage là xong.

### Giá phải trả

Firestore chỉ cho **một** database miễn phí mỗi project:
"Cloud Firestore allows exactly one free database per project"
(<https://firebase.google.com/docs/firestore/quotas>).

Ba database đặt tên = cả ba đều tính tiền, `(default)` rỗng thì suất miễn phí bỏ phí.
Với mức dùng hiện tại (logi ~3.000 lượt đọc/ngày, hai app kia ít hơn), ước tính
**dưới 1 USD/tháng**, phần lớn là lượt đọc (~0,03 USD/100k đọc). Project đã bật Blaze
nên không cần đổi gói. Con số "6% của free tier" trong README sẽ hết đúng.

---

## 1. Ba cái bẫy phải nhớ

1. `firebase.json` phải đổi `firestore` từ object sang **mảng** khi dùng database đặt
   tên. Viết `"database": "(default)"` **có ngoặc**; viết `"default"` sẽ lỗi 404.
2. Với dạng mảng, `firebase deploy --only firestore:rules` in "Deploy complete!"
   nhưng **không deploy gì cả**
   (<https://github.com/firebase/firebase-tools/issues/10447>).
   Từ nay luôn dùng `firebase deploy --only firestore`.
3. Database mới phải nằm **cùng region** với `(default)`. Region không đổi được sau
   khi tạo. Xem region hiện tại ở Console → Firestore → Databases.

Ghi chú thêm: đổi database id nghĩa là cache offline trên máy (IndexedDB) thành rỗng.
Trước khi cắt chuyển, mở app khi có mạng để mọi ghi offline được đẩy lên hết.

---

## 2. Thứ tự giữa ba app

Ba app không phụ thuộc nhau. Ai làm trước cũng được, vì chuyển sang database mới
**không đụng vào `(default)`**.

Đề xuất: **cogi trước** (đang hỏng), rồi logi, rồi noda. Bước 6 (khoá `(default)`)
chỉ làm khi cả ba đã xong.

---

## 3. Các bước cho logi

### Bước 1 - Tạo database (làm trong Console)

Console → Firestore → Databases → Create database.
- Database ID: `logi-db`
- Region: giống hệt `(default)`
- Rules: chọn production/locked cũng được, bước 2 sẽ ghi đè.

### Bước 2 - Trỏ rules và indexes sang logi-db

`firebase.json`:

```json
{
  "firestore": [
    {
      "database": "logi-db",
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    }
  ],
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

Nội dung `firestore.rules` giữ nguyên, không sửa một dòng nào.

```bash
firebase deploy --only firestore
```

Chạy trước khi chép dữ liệu, để index có thời gian build.

Kiểm tra: Console → Firestore → chọn `logi-db` → tab Rules phải thấy `validActivity`.
Nếu tab Rules vẫn trống, gần như chắc là dính bẫy số 2 ở trên.

### Bước 3 - Chép dữ liệu

Dữ liệu của logi nằm ở `users/{uid}/` với bốn collection:
`activities`, `weekTargets`, `meta`, `insights`.

**Quan trọng**: `users/{uid}/` trong `(default)` còn chứa dữ liệu của cogi và noda
(`exercises`, `lessons`, `decisions`...) vì ba app dùng chung một UID. Script chỉ
được chép đúng bốn collection trên. Tuyệt đối không chép đệ quy toàn bộ `users/{uid}`.

Tạo `scripts/copy-to-logi-db.mjs`:

```js
// ---------------------------------------------------------------------------
// logi - Chép dữ liệu từ (default) sang logi-db.
// Mặc định chạy khô (dry run). Thêm --commit mới ghi thật.
// Chạy lại nhiều lần được: ghi theo đúng doc id, lần sau đè lần trước.
//
//   node --env-file=.env.local scripts/copy-to-logi-db.mjs
//   node --env-file=.env.local scripts/copy-to-logi-db.mjs --commit
// ---------------------------------------------------------------------------
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TARGET_DB = 'logi-db';
const COLLECTIONS = ['activities', 'weekTargets', 'meta', 'insights'];
const COMMIT = process.argv.includes('--commit');

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
});

const src = getFirestore(app);              // (default)
const dst = getFirestore(app, TARGET_DB);   // logi-db

let written = 0;

async function copyDoc(fromRef, toRef) {
  const snap = await fromRef.get();
  if (snap.exists) {
    if (COMMIT) await toRef.set(snap.data());
    written += 1;
  }
}

async function copyCollection(fromCol, toCol) {
  const snap = await fromCol.get();
  console.log(`  ${fromCol.path}: ${snap.size} doc`);
  let batch = dst.batch();
  let n = 0;
  for (const doc of snap.docs) {
    if (COMMIT) {
      batch.set(toCol.doc(doc.id), doc.data());
      n += 1;
      if (n === 400) { await batch.commit(); batch = dst.batch(); n = 0; }
    }
    written += 1;
  }
  if (COMMIT && n > 0) await batch.commit();
}

const userRefs = await src.collection('users').listDocuments();
for (const userRef of userRefs) {
  console.log(`users/${userRef.id}`);
  await copyDoc(userRef, dst.collection('users').doc(userRef.id));
  for (const name of COLLECTIONS) {
    await copyCollection(
      userRef.collection(name),
      dst.collection('users').doc(userRef.id).collection(name),
    );
  }
}

console.log(COMMIT ? `Đã ghi ${written} doc.` : `Chạy khô: sẽ ghi ${written} doc.`);
process.exit(0);
```

Cách chạy:

```bash
# 1. Xuất backup từ chính app: Analytics → Export → All time → JSON. Cất file lại.
# 2. Mở app trên điện thoại khi có mạng, chờ sync xong.
node --env-file=.env.local scripts/copy-to-logi-db.mjs           # xem số
node --env-file=.env.local scripts/copy-to-logi-db.mjs --commit  # ghi thật
node --env-file=.env.local scripts/copy-to-logi-db.mjs           # chạy lại, so số
```

Số doc in ra ở lần cuối phải khớp với lần đầu.

### Bước 4 - Sửa code

Thêm `src/lib/db-id.ts`:

```ts
// Database id của logi trong project kyphan38-apps.
// cogi dùng 'cogi-db', noda dùng 'noda-db'. Xem roadmap/PLAN-db-split.md.
export const DB_ID = 'logi-db';
```

Bốn chỗ phải sửa:

| File | Sửa |
|------|-----|
| `src/lib/firebase-client.ts` | `initializeFirestore(app, {...})` → thêm tham số thứ ba `DB_ID`; mọi `getFirestore(app)` → `getFirestore(app, DB_ID)` |
| `src/lib/firebase-admin.ts` | `getFirestore(adminApp)` → `getFirestore(adminApp, DB_ID)` |
| `functions/src/index.ts` | `getFirestore()` → `getFirestore('logi-db')` (package riêng, không import được `src/`, ghi thẳng chuỗi kèm comment) |
| `scripts/count-sleep.mjs`, `scripts/delete-sleep.mjs` | `getFirestore(app)` → `getFirestore(app, 'logi-db')` |

Chữ ký hàm đã kiểm tra trong `node_modules`:
`initializeFirestore(app, settings, databaseId?)`, `getFirestore(app, databaseId)`
(web), `getFirestore(app, databaseId)` (admin).

Sót một chỗ thì chỗ đó vẫn đọc `(default)`, và sẽ bị `permission-denied` sau bước 6.

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

### Bước 5 - Deploy và kiểm tra

```bash
firebase deploy --only functions   # codebase mới tên 'logi'
git push                           # Vercel tự deploy
```

Lưu ý khi deploy functions lần đầu sau khi đổi tên codebase: nếu CLI hỏi xoá
`pushReminders` / `trimPushLog`, **trả lời no**, rồi xem `firebase functions:list`.
Đổi tên codebase chỉ đổi nhãn, không được xoá function.

Kiểm tra trên máy: mở History thấy đủ record cũ; Targets thấy đúng giờ tuần này;
Analytics chạy; thêm một record rồi xoá; bật lại nút reminder trong Settings nếu
thông báo im (token FCM nằm ở `meta/fcm`, đã chép nhưng nên thử lại).

### Bước 6 - Khoá (default) (chỉ khi cả ba app đã xong)

Tạo `firestore.default.rules`:

```
rules_version = '2';
// (default) không còn app nào dùng. Dữ liệu cũ giữ lại để đối chiếu.
// cogi → cogi-db, logi → logi-db, noda → noda-db.
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

Thêm vào mảng `firestore` trong `firebase.json`:

```json
{ "database": "(default)", "rules": "firestore.default.rules" }
```

rồi `firebase deploy --only firestore`.

Xoá dữ liệu cũ trong `(default)` thì để sau vài tuần, khi chắc chắn cả ba app chạy ổn.

### Bước 7 - Cập nhật README

- Mục "Firestore reads (free tier: 50k/day)": không còn miễn phí, ghi ước tính tiền.
- Mục Deploy: đổi mọi `firebase deploy --only firestore:rules` thành
  `firebase deploy --only firestore`.
- Bảng Security review: thêm dòng "logi dùng database `logi-db`; deploy của app khác
  không đụng tới".
- Thêm một đoạn ngắn: một project, ba database, ai sở hữu cái nào.

---

## 4. Lỡ hỏng thì lui thế nào

Chưa tới bước 6 thì lui rất dễ: `git revert` phần sửa code rồi deploy lại. Dữ liệu
trong `(default)` vẫn còn nguyên, không có bước nào xoá nó. `logi-db` thừa ra thì
kệ, hoặc xoá trong Console.

Sau bước 6 thì phải deploy lại rules cũ cho `(default)` trước khi lui code.

---

## 5. Checklist

- [ ] Tạo `logi-db`, đúng region với `(default)`
- [ ] `firebase.json`: mảng firestore + codebase `logi`
- [ ] `firebase deploy --only firestore`, kiểm tra tab Rules của `logi-db`
- [ ] Xuất backup JSON từ app
- [ ] Chạy khô script chép, xem số
- [ ] Chép thật, chạy lại đối chiếu số
- [ ] Sửa 5 file code + thêm `db-id.ts`
- [ ] typecheck / lint / test / build
- [ ] Deploy functions (không xoá nhầm), push Vercel
- [ ] Thử trên điện thoại: History, Targets, thêm/xoá record, reminder
- [ ] (Sau khi cả ba app xong) khoá `(default)` deny-all
- [ ] Cập nhật README
