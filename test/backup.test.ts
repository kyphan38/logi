import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  exportNudge,
  parseBackup,
  planRestore,
  previewBackup,
  type BackupFile,
} from '@/lib/backup';
import { toJson } from '@/lib/export';
import { PRESETS } from '@/lib/balance';
import type { Range } from '@/lib/range';
import { act, at } from './_helpers.ts';

const D = '2026-08-25';
const full = (from: string, to: string): Range => ({
  from,
  to,
  kind: 'custom',
  isPartial: false,
});

// 2026-09-06 là Chủ nhật đầu tiên của tháng 9.
const FIRST_SUN = at('2026-09-06', '10:00');
const MID_MONTH = at('2026-09-16', '10:00');

// ------------------------------------------------------------
// Nhắc export
// ------------------------------------------------------------

test('không có dữ liệu → không nhắc', () => {
  const n = exportNudge({ lastExport: null, firstRecord: null, now: FIRST_SUN });
  assert.equal(n.show, false);
});

test('chưa export bao giờ, dữ liệu > 30 ngày → nhắc ngay, không đợi Chủ nhật', () => {
  const n = exportNudge({ lastExport: null, firstRecord: '2026-06-01', now: MID_MONTH });
  assert.equal(n.show, true);
  assert.match(n.text, /Never exported/);
});

test('chưa export nhưng mới dùng 10 ngày → chưa nhắc', () => {
  const n = exportNudge({ lastExport: null, firstRecord: '2026-09-08', now: MID_MONTH });
  assert.equal(n.show, false);
});

test('Chủ nhật đầu tháng → nhắc kèm số ngày', () => {
  const n = exportNudge({
    lastExport: at('2026-07-21', '10:00'),
    firstRecord: '2026-01-01',
    now: FIRST_SUN,
  });
  assert.equal(n.show, true);
  assert.equal(n.daysAgo, 47);
  assert.match(n.text, /Last export: 47 days ago/);
});

test('giữa tháng thì im lặng', () => {
  const n = exportNudge({
    lastExport: at('2026-07-21', '10:00'),
    firstRecord: '2026-01-01',
    now: MID_MONTH,
  });
  assert.equal(n.show, false);
});

test('Chủ nhật thứ hai của tháng không tính', () => {
  const n = exportNudge({
    lastExport: at('2026-07-21', '10:00'),
    firstRecord: '2026-01-01',
    now: at('2026-09-13', '10:00'),
  });
  assert.equal(n.show, false);
});

test('một ngày thì viết "day", không phải "days"', () => {
  const n = exportNudge({
    lastExport: at('2026-09-05', '10:00'),
    firstRecord: '2026-01-01',
    now: FIRST_SUN,
  });
  assert.match(n.text, /1 day ago/);
});

// ------------------------------------------------------------
// Đọc file
// ------------------------------------------------------------

const sample = () => {
  const acts = [
    act({ id: 'a', startAt: at(D, '08:00'), endAt: at(D, '09:00'), category: 'work' }),
    act({ id: 'b', startAt: at(D, '10:00'), endAt: at(D, '11:00'), category: 'learn' }),
  ];
  const targets = new Map([['2026-W35', PRESETS.normal.weekly]]);
  return toJson(acts, full(D, D), targets, at(D, '12:00'));
};

test('đọc lại đúng file mà chính app xuất ra', () => {
  const { file, error } = parseBackup(sample());
  assert.equal(error, null);
  assert.equal(file!.activities.length, 2);
  assert.equal(file!.weekTargets.length, 1);
});

test('không phải JSON → báo lỗi, không ném', () => {
  const { file, error } = parseBackup('id,category,label\n1,work,x');
  assert.equal(file, null);
  assert.match(error!, /valid JSON/);
});

test('JSON hợp lệ nhưng không phải backup → từ chối', () => {
  const { file, error } = parseBackup('{"hello":1}');
  assert.equal(file, null);
  assert.match(error!, /No activities/);
});

test('record thiếu id bị loại, không được ghi vào DB', () => {
  const bad = JSON.stringify({
    activities: [{ category: 'work', startAt: 1, logicalDate: D }],
  });
  assert.equal(parseBackup(bad).file, null);
});

test('record hỏng bị loại nhưng record tốt vẫn nhận', () => {
  const mixed = JSON.stringify({
    activities: [{ nonsense: true }, { id: 'x', category: 'work', startAt: 1, logicalDate: D }],
  });
  const { file } = parseBackup(mixed);
  assert.equal(file!.activities.length, 1);
});

test('file mảng rỗng → từ chối', () => {
  assert.equal(parseBackup('{"activities":[]}').file, null);
});

test('sổ nợ đi kèm file all-time và đọc lại được', () => {
  const acts = [act({ id: 'a', startAt: at(D, '08:00'), endAt: at(D, '09:00') })];
  const text = toJson(acts, full(D, D), new Map(), at(D, '12:00'), { learn: 6 });
  const { file } = parseBackup(text);
  assert.deepEqual(file!.debt, { learn: 6 });
});

test('file không có debt vẫn đọc được - bản export cũ', () => {
  const { file } = parseBackup(sample());
  assert.equal(file!.debt, undefined);
});

// ------------------------------------------------------------
// Preview
// ------------------------------------------------------------

test('preview đếm đúng record, tuần và khoảng ngày', () => {
  const { file } = parseBackup(sample());
  const p = previewBackup(file!);
  assert.equal(p.records, 2);
  assert.equal(p.weeks, 1);
  assert.equal(p.from, D);
  assert.equal(p.to, D);
  assert.equal(p.targets, 1);
});

// ------------------------------------------------------------
// Kế hoạch khôi phục - CHỈ THÊM
// ------------------------------------------------------------

const file2 = (): BackupFile => parseBackup(sample()).file!;

test('database rỗng → thêm tất cả', () => {
  const plan = planRestore(file2(), new Set());
  assert.equal(plan.add.length, 2);
  assert.equal(plan.skip, 0);
});

test('record đã tồn tại → bỏ qua, KHÔNG ghi đè', () => {
  const plan = planRestore(file2(), new Set(['a']));
  assert.deepEqual(plan.add.map((x) => x.id), ['b']);
  assert.equal(plan.skip, 1);
});

test('import lại lần hai → không tạo bản trùng', () => {
  const f = file2();
  const first = planRestore(f, new Set());
  const ids = new Set(first.add.map((a) => a.id));
  const second = planRestore(f, ids);
  assert.equal(second.add.length, 0);
  assert.equal(second.skip, 2);
});

test('id trùng ngay trong file cũng chỉ thêm một lần', () => {
  const f = file2();
  f.activities = [...f.activities, f.activities[0]];
  const plan = planRestore(f, new Set());
  assert.equal(plan.add.length, 2);
  assert.equal(plan.skip, 1);
});

test('kế hoạch không bao giờ chứa lệnh xoá', () => {
  const plan = planRestore(file2(), new Set(['a', 'b', 'zzz']));
  assert.equal(plan.add.length, 0);
  assert.ok(!('remove' in plan));
});
