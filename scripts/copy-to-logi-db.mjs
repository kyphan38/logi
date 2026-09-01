// ---------------------------------------------------------------------------
// logi - Chép dữ liệu từ (default) sang logi-db.
//
// Mặc định chỉ đếm (dry run), không ghi gì. Thêm --commit mới ghi thật.
// Chạy lại nhiều lần được: mỗi doc được ghi đè theo đúng id.
//
//   node --env-file=.env.local scripts/copy-to-logi-db.mjs
//   node --env-file=.env.local scripts/copy-to-logi-db.mjs --commit
//
// Xem roadmap/PLAN-db-split.md.
// ---------------------------------------------------------------------------

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TARGET_DB = 'logi-db';
const COLLECTIONS = ['activities', 'weekTargets', 'meta', 'insights'];
const COMMIT = process.argv.includes('--commit');

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

const src = getFirestore(app); // (default)
const dst = getFirestore(app, TARGET_DB); // logi-db

let written = 0;

async function copyDoc(fromRef, toRef) {
  const snap = await fromRef.get();
  if (!snap.exists) return;
  if (COMMIT) await toRef.set(snap.data());
  written += 1;
}

async function copyCollection(fromCol, toCol) {
  const snap = await fromCol.get();
  if (snap.size > 0) console.log(`  ${fromCol.path}: ${snap.size} doc`);

  let batch = dst.batch();
  let n = 0;
  for (const doc of snap.docs) {
    if (COMMIT) {
      batch.set(toCol.doc(doc.id), doc.data());
      n += 1;
      if (n === 400) {
        await batch.commit();
        batch = dst.batch();
        n = 0;
      }
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
