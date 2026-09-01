// ------------------------------------------------------------
// logi - Xoá record sleep (AMENDMENT-remove-sleep mục 0)
//
// KHÔNG chạy nếu chưa chạy count-sleep.mjs và chưa xác nhận số khớp.
//
//   node --env-file=.env.local scripts/delete-sleep.mjs <đường-dẫn-file-export.json> --yes
//
// Script query thẳng Firestore, KHÔNG đi qua src/lib/activities.ts.
// Mục 4.2 sẽ thêm bộ lọc category !== 'sleep' vào tầng đọc; đi qua đó
// thì script sẽ không thấy record nào để xoá.
// ------------------------------------------------------------

import { readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const exportPath = process.argv[2];
const confirmed = process.argv.includes('--yes');

if (!exportPath || !confirmed) {
  console.error('Thiếu tham số. Dùng:');
  console.error('  node --env-file=.env.local scripts/delete-sleep.mjs <file-export.json> --yes');
  process.exit(1);
}

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

// Khớp với DB_ID ở src/lib/db-id.ts. Xem roadmap/PLAN-db-split.md.
const db = getFirestore(app, 'logi-db');

// --- Cổng an toàn: file backup phải có đủ record trước khi xoá ---------
const backup = JSON.parse(readFileSync(exportPath, 'utf8'));
const backupActs = Array.isArray(backup) ? backup : (backup.activities ?? []);
const backupSleep = backupActs.filter((a) => a.category === 'sleep');
const backupIds = new Set(backupSleep.map((a) => a.id));

const users = await db.collection('users').listDocuments();
const targets = [];

for (const user of users) {
  const snap = await user.collection('activities').where('category', '==', 'sleep').get();
  for (const doc of snap.docs) targets.push({ ref: doc.ref, id: doc.id, user: user.id });
}

console.log(`DB   : ${targets.length} record sleep`);
console.log(`File : ${backupSleep.length} record sleep`);

if (targets.length !== backupSleep.length) {
  console.log(`\n*** LỆCH ${Math.abs(targets.length - backupSleep.length)} record - DỪNG. ***`);
  console.log('Export lại bằng "All time" rồi chạy lại.');
  process.exit(1);
}

const missing = targets.filter((t) => !backupIds.has(t.id));
if (missing.length > 0) {
  console.log(`\n*** ${missing.length} record trong DB không khớp id nào trong file - DỪNG. ***`);
  process.exit(1);
}

// --- Xoá theo batch ---------------------------------------------------
let done = 0;
for (let i = 0; i < targets.length; i += 400) {
  const batch = db.batch();
  for (const t of targets.slice(i, i + 400)) batch.delete(t.ref);
  await batch.commit();
  done += Math.min(400, targets.length - i);
  console.log(`  đã xoá ${done}/${targets.length}`);
}

// --- Kiểm tra lại -----------------------------------------------------
let left = 0;
for (const user of users) {
  const snap = await user.collection('activities').where('category', '==', 'sleep').get();
  left += snap.size;
}

console.log(`\n=== Xong: xoá ${done} record. Còn lại trong DB: ${left} ===`);
process.exit(left === 0 ? 0 : 1);
