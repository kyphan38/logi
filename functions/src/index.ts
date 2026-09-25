// ---------------------------------------------------------------------------
// logi functions - Push nhắc theo lịch (Stage 6 Task 2)
//
// Chạy 15 phút một lần. Mỗi lần: xem có ai bật push không, có đang trong cửa
// sổ nhắc không, đã nhắc loại đó hôm nay chưa. Chỉ khi cả ba đều đúng mới đọc
// activity - nếu không, một lần chạy chỉ tốn một read.
//
// 96 lần chạy/ngày × 1 read = ~100 read/ngày. Phần đọc activity chỉ xảy ra ở
// vài lần chạy quanh 06:15, 20:45 và 19:00 Chủ nhật.
//
// Nhắc trong app (Stage 4) vẫn chạy song song. Push hỏng thì vẫn còn đường đó.
// ---------------------------------------------------------------------------

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

import { countdownText, daysBetween, isMilestone, whenLabel } from './events';
import { dayStart, logicalDate, logicalWeek, logicalWeekday, markAt } from './time';

initializeApp();

// Database mặc định của project kyphan38-logi-app.
// Xem roadmap/PLAN-project-split-logi.md.
const db = getFirestore();

type ReminderType = 'morning' | 'evening' | 'weekly';

/**
 * Chỉ gửi trong vòng một tiếng sau mốc. Muộn hơn thì thông báo mất nghĩa:
 * "chưa học buổi sáng" hiện lúc 11 giờ trưa chỉ gây khó chịu.
 */
const WINDOW_MS = 60 * 60 * 1000;

interface Candidate {
  type: ReminderType;
  mark: number;
}

/** Ứng viên theo mốc giờ GIẢM DẦN - nhắc mới nhất thắng, giống `pickReminder()`. */
function candidates(now: number): Candidate[] {
  const today = logicalDate(now);
  const list: Candidate[] = [
    { type: 'evening', mark: markAt(today, 20, 45) },
    { type: 'morning', mark: markAt(today, 6, 15) },
  ];
  if (logicalWeekday(now) === 0) {
    list.push({ type: 'weekly', mark: markAt(today, 19) });
  }
  return list.sort((a, b) => b.mark - a.mark).filter((c) => now >= c.mark && now < c.mark + WINDOW_MS);
}

interface Row {
  category: string;
  status: string;
  startAt: number;
  endAt: number | null;
  durationMin: number | null;
}

async function activitiesOfDay(uid: string, date: string): Promise<Row[]> {
  const snap = await db
    .collection(`users/${uid}/activities`)
    .where('logicalDate', '==', date)
    .get();
  return snap.docs.map((d) => d.data() as Row);
}

async function hoursOfWeek(uid: string, week: string): Promise<number> {
  const snap = await db
    .collection(`users/${uid}/activities`)
    .where('logicalWeek', '==', week)
    .get();
  let min = 0;
  for (const d of snap.docs) {
    const r = d.data() as Row;
    if (r.status === 'scheduled' || r.status === 'abandoned') continue;
    min += r.durationMin ?? 0;
  }
  return min / 60;
}

/** Đã học chưa, tính từ mốc `from`. Giống hàm `learned()` trong reminders.ts. */
function learnedSince(day: Row[], from: number, now: number): boolean {
  return day.some(
    (a) => a.category === 'learn' && a.status !== 'scheduled' && (a.endAt ?? now) > from
  );
}

interface Message {
  title: string;
  body: string;
}

async function buildMessage(
  uid: string,
  type: ReminderType,
  now: number
): Promise<Message | null> {
  const today = logicalDate(now);

  if (type === 'weekly') {
    const h = await hoursOfWeek(uid, logicalWeek(now));
    return { title: 'Week wrap-up', body: `${Math.round(h * 10) / 10}h tracked this week.` };
  }

  const day = await activitiesOfDay(uid, today);
  const from = type === 'morning' ? dayStart(today) : markAt(today, 19);
  // Đã học rồi thì im. Nhắc việc vừa làm xong là cách nhanh nhất để người dùng
  // học cách bỏ qua mọi thông báo của app.
  if (learnedSince(day, from, now)) return null;

  return type === 'morning'
    ? { title: 'Morning study', body: 'Not logged yet.' }
    : { title: 'Evening study', body: 'Not logged yet.' };
}

export const pushReminders = onSchedule(
  {
    schedule: 'every 15 minutes',
    timeZone: 'Asia/Ho_Chi_Minh',
    region: 'asia-southeast1',
    retryCount: 0,
  },
  async () => {
    const now = Date.now();
    const due = candidates(now);
    if (due.length === 0) return;

    // Chỉ những máy đã bật push. Cần index collection-group cho `meta.token`
    // (đã khai trong firestore.indexes.json).
    const devices = await db.collectionGroup('meta').where('token', '>', '').get();

    for (const device of devices.docs) {
      if (device.id !== 'fcm') continue;
      const uid = device.ref.parent.parent?.id;
      const token = (device.data() as { token?: string }).token;
      if (!uid || !token) continue;

      const today = logicalDate(now);
      const logRef = db.doc(`users/${uid}/meta/pushLog`);
      const log = (await logRef.get()).data() ?? {};
      const sentToday = (log[today] ?? {}) as Record<string, number>;

      // Một loại nhắc, một lần một ngày logic. Cửa sổ một tiếng dài hơn chu kỳ
      // 15 phút, nên không có cờ này người dùng sẽ nhận bốn lần cùng một câu.
      const pick = due.find((c) => sentToday[c.type] == null);
      if (!pick) continue;

      const msg = await buildMessage(uid, pick.type, now);
      if (!msg) continue;

      try {
        await getMessaging().send({
          token,
          // CHỈ `data`, không `notification`: service worker tự hiện thông báo.
          // Gửi cả hai thì trình duyệt hiện một cái và SW hiện thêm cái nữa.
          data: { title: msg.title, body: msg.body, tag: pick.type, url: '/now' },
          webpush: { headers: { Urgency: 'high', TTL: '3600' } },
        });

        await logRef.set(
          { [today]: { ...sentToday, [pick.type]: now } },
          { merge: true }
        );
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        // Token web chết im lặng (gỡ app, xoá dữ liệu site). Xoá đi, người dùng
        // bật lại từ màn Settings khi cần.
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          await device.ref.set({ token: FieldValue.delete() }, { merge: true });
          logger.info('dropped dead token');
        } else {
          logger.error('push failed', code);
        }
      }
    }
  }
);

/**
 * Dọn nhật ký gửi push mỗi tuần. Không có nó thì `meta/pushLog` cứ dài mãi,
 * và một ngày nào đó vượt giới hạn 1MB của một document.
 */
export const trimPushLog = onSchedule(
  { schedule: 'every sunday 03:00', timeZone: 'Asia/Ho_Chi_Minh', region: 'asia-southeast1' },
  async () => {
    const keep = 14;
    const snap = await db.collectionGroup('meta').where('token', '>', '').get();
    for (const device of snap.docs) {
      const uid = device.ref.parent.parent?.id;
      if (!uid) continue;
      const ref = db.doc(`users/${uid}/meta/pushLog`);
      const data = (await ref.get()).data();
      if (!data) continue;
      const dates = Object.keys(data).sort();
      if (dates.length <= keep) continue;
      const drop: Record<string, unknown> = {};
      for (const d of dates.slice(0, dates.length - keep)) drop[d] = FieldValue.delete();
      await ref.update(drop);
    }
  }
);

// ---------------------------------------------------------------------------
// Stage 9 - Push nhắc SỰ KIỆN
//
// Tách hẳn khỏi `pushReminders`. Hai thứ khác nhau về bản chất: nhắc học là
// thói quen, tính theo giờ trong ngày; sự kiện là một mốc trên lịch, tính theo
// ngày. Gộp chung thì nhắc sự kiện sẽ nuốt mất nhắc học (hàm kia chỉ gửi MỘT
// cái mỗi lần chạy), hoặc ngược lại.
//
// Chạy MỘT lần mỗi ngày lúc 06:00. Không cần 15 phút/lần: mốc tính bằng ngày,
// chạy thêm 95 lần nữa cũng không đổi kết quả, chỉ tốn read.
// ---------------------------------------------------------------------------


interface EventRow {
  title?: string;
  date?: string;
  /** "11:30", hoặc vắng = cả ngày. Không đổi lịch gửi, chỉ vào câu thông báo. */
  time?: string | null;
  notified?: Record<string, number>;
}

/** Mỗi lần gửi tối đa 2 dòng. Dài hơn thì màn khoá cắt mất, đọc còn tệ hơn. */
const MAX_LINES = 2;

export const pushEvents = onSchedule(
  {
    schedule: 'every day 06:00',
    timeZone: 'Asia/Ho_Chi_Minh',
    region: 'asia-southeast1',
    retryCount: 0,
  },
  async () => {
    const now = Date.now();
    const today = logicalDate(now);
    const devices = await db.collectionGroup('meta').where('token', '>', '').get();

    for (const device of devices.docs) {
      if (device.id !== 'fcm') continue;
      const uid = device.ref.parent.parent?.id;
      const token = (device.data() as { token?: string }).token;
      if (!uid || !token) continue;

      const snap = await db
        .collection(`users/${uid}/events`)
        .where('archivedAt', '==', null)
        .get();

      // Mốc chỉ khớp ĐÚNG số ngày - không gửi bù. Bỏ lỡ một ngày thì mốc đó
      // trôi luôn: "In 7 days" gửi vào ngày còn 6 là thông báo sai.
      const due: { id: string; line: string; days: number }[] = [];
      for (const row of snap.docs) {
        const e = row.data() as EventRow;
        if (!e.title || !e.date) continue;
        const days = daysBetween(today, e.date);
        if (!isMilestone(days)) continue;
        if ((e.notified ?? {})[String(days)] != null) continue;
        due.push({ id: row.id, days, line: `${e.title} - ${countdownText(days)}` });
      }
      if (due.length === 0) continue;

      due.sort((a, b) => a.days - b.days);
      const first = due[0]!;
      const head = snap.docs.find((d) => d.id === first.id)!.data() as EventRow;

      const msg =
        due.length === 1
          ? {
              title: head.title!,
              body: `${countdownText(first.days)} - ${whenLabel(head.date!, head.time ?? null)}`,
            }
          : {
              title: `${due.length} reminders`,
              body:
                due.slice(0, MAX_LINES).map((d) => d.line).join(' · ') +
                (due.length > MAX_LINES ? ` and ${due.length - MAX_LINES} more` : ''),
            };

      try {
        await getMessaging().send({
          token,
          data: { title: msg.title, body: msg.body, tag: 'events', url: '/reminders' },
          webpush: { headers: { Urgency: 'high', TTL: '86400' } },
        });
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          await device.ref.set({ token: FieldValue.delete() }, { merge: true });
          logger.info('dropped dead token');
        } else {
          logger.error('event push failed', code);
        }
        // Gửi hỏng thì KHÔNG đánh dấu - để lần chạy ngày mai còn thử lại được
        // (nếu mốc đó vẫn chưa trôi qua).
        continue;
      }

      // Đánh dấu SAU khi gửi xong, và ghi lên chính doc sự kiện. Cờ nằm cạnh
      // dữ liệu nó nói về thì không bao giờ lệch, kể cả khi đổi ngày.
      for (const d of due) {
        await db.doc(`users/${uid}/events/${d.id}`).set(
          { notified: { [String(d.days)]: now } },
          { merge: true }
        );
      }
    }
  }
);
