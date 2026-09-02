// ---------------------------------------------------------------------------
// logi - Chép dữ liệu từ project cũ sang project mới.
//
//   Nguồn: kyphan38-apps / database 'logi-db'   (service account cũ)
//   Đích:  kyphan38-logi-app / database '(default)' (service account mới)
//
// UID đổi khi sang project mới, nên phải truyền --from-uid và --to-uid.
// Mặc định chỉ đếm (dry run), không ghi gì. Thêm --commit mới ghi thật.
// Chạy lại nhiều lần được: mỗi doc ghi đè theo đúng id.
//
//   node --env-file=.env.local scripts/copy-to-new-project.mjs \
//     --from-uid <UID_CU> --to-uid <UID_MOI>
//   node --env-file=.env.local scripts/copy-to-new-project.mjs \
//     --from-uid <UID_CU> --to-uid <UID_MOI> --commit
//
// Credential cũ: lấy từ biến OLD_FIREBASE_ADMIN_*, nếu không có thì đọc
// file backup /tmp/logi.env.bak (bước 2 của plan đã tạo).
//
// Xem roadmap/PLAN-project-split-logi.md.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SOURCE_DB = 'logi-db';
const COLLECTIONS = ['activities', 'weekTargets', 'meta', 'insights'];
const BATCH_SIZE = 400;
const OLD_ENV_BACKUP = process.env.OLD_ENV_FILE ?? '/tmp/logi.env.bak';

const COMMIT = process.argv.includes('--commit');

const flag = (name) => {
  const i = process.argv.indexOf(name);
  const v = i === -1 ? null : process.argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`Thiếu ${name} <uid>`);
  return v;
};

const FROM_UID = flag('--from-uid');
const TO_UID = flag('--to-uid');

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name} (xem .env.local)`);
  return v;
};

// --- Credential của project cũ ---------------------------------------------
function readOldEnv() {
  const keys = ['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY'];
  const fromEnv = {};
  for (const k of keys) {
    const v = process.env[`OLD_${k}`];
    if (v) fromEnv[k] = v;
  }
  if (keys.every((k) => fromEnv[k])) return fromEnv;

  let text;
  try {
    text = readFileSync(OLD_ENV_BACKUP, 'utf8');
  } catch {
    throw new Error(
      `Không đọc được ${OLD_ENV_BACKUP}. Đặt OLD_FIREBASE_ADMIN_* hoặc OLD_ENV_FILE.`,
    );
  }
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || !keys.includes(m[1])) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  for (const k of keys) if (!out[k]) throw new Error(`${OLD_ENV_BACKUP} thiếu ${k}`);
  return out;
}

const old = readOldEnv();

const srcApp = initializeApp(
  {
    credential: cert({
      projectId: old.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: old.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: old.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
    projectId: old.FIREBASE_ADMIN_PROJECT_ID,
  },
  'source',
);

const dstApp = initializeApp(
  {
    credential: cert({
      projectId: need('FIREBASE_ADMIN_PROJECT_ID'),
      clientEmail: need('FIREBASE_ADMIN_CLIENT_EMAIL'),
      privateKey: need('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
    }),
    projectId: need('FIREBASE_ADMIN_PROJECT_ID'),
  },
  'target',
);

if (old.FIREBASE_ADMIN_PROJECT_ID === process.env.FIREBASE_ADMIN_PROJECT_ID) {
  throw new Error('Project nguồn và đích trùng nhau. Kiểm tra lại .env.local.');
}

const src = getFirestore(srcApp, SOURCE_DB);
const dst = getFirestore(dstApp); // (default)

console.log(`Nguồn: ${old.FIREBASE_ADMIN_PROJECT_ID} / ${SOURCE_DB} / users/${FROM_UID}`);
console.log(`Đích:  ${process.env.FIREBASE_ADMIN_PROJECT_ID} / (default) / users/${TO_UID}`);
console.log(COMMIT ? 'Chế độ: GHI THẬT\n' : 'Chế độ: chạy khô (thêm --commit để ghi)\n');

const srcUser = src.collection('users').doc(FROM_UID);
const dstUser = dst.collection('users').doc(TO_UID);

let total = 0;

// Doc gốc users/{uid}
const userSnap = await srcUser.get();
if (userSnap.exists) {
  if (COMMIT) await dstUser.set(userSnap.data());
  total += 1;
  console.log(`  users/${FROM_UID} (doc gốc): 1 doc`);
} else {
  console.log(`  users/${FROM_UID} (doc gốc): không có, bỏ qua`);
}

// Bỏ field token trong meta/fcm: token cũ thuộc sender ID cũ, copy sang là rác.
const scrub = (name, id, data) => {
  if (name !== 'meta' || id !== 'fcm' || data.token === undefined) return data;
  const rest = { ...data };
  delete rest.token;
  console.log('    (đã bỏ field token trong meta/fcm)');
  return rest;
};

for (const name of COLLECTIONS) {
  const snap = await srcUser.collection(name).get();
  console.log(`  ${name}: ${snap.size} doc`);
  if (snap.size === 0) continue;

  let batch = dst.batch();
  let n = 0;
  for (const doc of snap.docs) {
    if (COMMIT) {
      batch.set(dstUser.collection(name).doc(doc.id), scrub(name, doc.id, doc.data()));
      n += 1;
      if (n === BATCH_SIZE) {
        await batch.commit();
        batch = dst.batch();
        n = 0;
      }
    } else {
      scrub(name, doc.id, doc.data());
    }
    total += 1;
  }
  if (COMMIT && n > 0) await batch.commit();
}

console.log(COMMIT ? `\nĐã ghi ${total} doc.` : `\nChạy khô: sẽ ghi ${total} doc.`);
process.exit(0);
