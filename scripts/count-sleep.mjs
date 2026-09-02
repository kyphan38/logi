// ---------------------------------------------------------------------------
// logi - ĐẾM record sleep (AMENDMENT-remove-sleep mục 0, bước 3)
//
// Script này CHỈ ĐỌC. Không có một lệnh ghi hay xoá nào trong file.
// Việc xoá nằm ở scripts/delete-sleep.mjs, chỉ được viết và chạy SAU khi
// người dùng xác nhận con số mà script này in ra.
//
// Chạy:
//   node --env-file=.env.local scripts/count-sleep.mjs <đường-dẫn-file-export.json>
//
// File export nằm ngoài project. Script đếm record sleep trong file đó và so
// với số trong DB. Lệch nghĩa là bản backup thiếu - KHÔNG được xoá.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const exportPath = process.argv[2];
if (!exportPath) {
  console.error('Thiếu đường dẫn file export. Ví dụ:');
  console.error('  node --env-file=.env.local scripts/count-sleep.mjs ~/Downloads/logi-....json');
  process.exit(1);
}

// Đọc file export TRƯỚC khi gọi mạng - sai đường dẫn thì hỏng ngay, khỏi chờ.
const backup = JSON.parse(readFileSync(exportPath, 'utf8'));
const backupActs = Array.isArray(backup) ? backup : (backup.activities ?? []);
const backupSleep = backupActs.filter((a) => a.category === 'sleep');

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem .env.local)`);
  return v;
};

const app = initializeApp({
  credential: cert({
    projectId: need('FIREBASE_ADMIN_PROJECT_ID'),
    clientEmail: need('FIREBASE_ADMIN_CLIENT_EMAIL'),
    privateKey: need('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
  }),
  projectId: need('FIREBASE_ADMIN_PROJECT_ID'),
});

// Database mặc định của project kyphan38-logi-app.
// Xem roadmap/PLAN-project-split-logi.md.
const db = getFirestore(app);

const fmt = (ts) =>
  ts == null
    ? '-'
    : new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

const users = await db.collection('users').listDocuments();
if (users.length === 0) console.log('Không thấy user nào.');

let grandTotal = 0;
const sleepIds = [];

for (const user of users) {
  const activities = user.collection('activities');

  // Đếm tổng để có mẫu số - biết 812 record sleep trên tổng 3140 khác hẳn
  // với 812 trên tổng 812.
  const all = await activities.count().get();

  // Điều kiện DUY NHẤT, đúng như plan yêu cầu: category === 'sleep'.
  const snap = await activities.where('category', '==', 'sleep').get();

  const rows = snap.docs.map((d) => d.data());
  const starts = rows.map((r) => r.startAt).filter((v) => typeof v === 'number');

  // Mục 4.3: session sleep đang chạy phải xoá cùng lô, nên đếm riêng.
  const byStatus = {};
  for (const r of rows) {
    const k = r.status ?? '(không có status)';
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }

  const dates = [...new Set(rows.map((r) => r.logicalDate).filter(Boolean))].sort();

  grandTotal += rows.length;
  for (const d of snap.docs) sleepIds.push(d.id);

  console.log(`\nUser ${user.id}`);
  console.log(`  Tổng activity           : ${all.data().count}`);
  console.log(`  Record category='sleep' : ${rows.length}`);
  console.log(`  startAt sớm nhất        : ${fmt(starts.length ? Math.min(...starts) : null)}`);
  console.log(`  startAt muộn nhất       : ${fmt(starts.length ? Math.max(...starts) : null)}`);
  console.log(`  logicalDate             : ${dates[0] ?? '-'} → ${dates.at(-1) ?? '-'}`);
  console.log(`  Theo status             : ${JSON.stringify(byStatus)}`);
}

// ---------------------------------------------------------------------------
// Cổng an toàn: file backup phải chứa đủ số record sắp bị xoá.
// ---------------------------------------------------------------------------
console.log(`\nFile export: ${exportPath}`);
console.log(`  Khoảng thời gian    : ${backup.range?.from ?? '?'} → ${backup.range?.to ?? '?'}`);
console.log(`  Tổng record trong file: ${backupActs.length}`);
console.log(`  Record sleep trong file: ${backupSleep.length}`);

console.log(`\n=== ĐỐI CHIẾU ===`);
console.log(`  DB   : ${grandTotal} record sleep`);
console.log(`  File : ${backupSleep.length} record sleep`);

// Sau khi xoá xong, DB = 0 mà file vẫn còn record. Đó là kết quả MONG MUỐN,
// không phải lệch. Cổng an toàn bên dưới chỉ dành cho lúc TRƯỚC khi xoá.
if (grandTotal === 0) {
  console.log(`\n=== ĐÃ XOÁ XONG ===`);
  console.log(`DB không còn record sleep. File export giữ ${backupSleep.length} record làm lịch sử.`);
  process.exit(0);
}

if (backupSleep.length !== grandTotal) {
  console.log(`\n*** LỆCH ${Math.abs(grandTotal - backupSleep.length)} record - DỪNG. ***`);
  console.log(`Bản export không đủ. Xuất lại bằng "All time" rồi chạy lại script này.`);
  process.exit(1);
}

// Trùng số vẫn chưa đủ - phải trùng đúng từng id.
const dbIds = new Set(sleepIds);
const missing = backupSleep.filter((a) => !dbIds.has(a.id));
if (missing.length > 0) {
  console.log(`\n*** ${missing.length} record trong file không khớp id nào trong DB - DỪNG. ***`);
  process.exit(1);
}

console.log(`\nKhớp. ${grandTotal} record sleep đã có bản sao an toàn trong file export.`);
console.log(`=== Chưa xoá gì cả. Chờ bạn đồng ý. ===`);
process.exit(0);
