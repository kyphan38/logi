import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeParse } from '@/lib/parse-sanitize';
import { at, H } from './_helpers.ts';

const NOW = at('2026-08-26', '12:00');
const IDS = new Set(['a1']);
const opts = { now: NOW, knownIds: IDS };

/** ParseResult tối thiểu, hợp lệ - mỗi test chỉ bẻ một chỗ. */
function base(over: Record<string, unknown> = {}) {
  return {
    intent: 'log_past',
    category: 'work',
    label: 'devops',
    startAt: new Date(NOW - 2 * H).toISOString(),
    endAt: new Date(NOW - H).toISOString(),
    confidence: 0.9,
    clarifyQuestion: null,
    clarifyOptions: null,
    targetActivityId: null,
    transcript: 'I worked on devops',
    ...over,
  } as never;
}

test('sanitize: câu hợp lệ đi qua, thời gian ra epoch ms', () => {
  const r = sanitizeParse(base(), opts);
  assert.equal(r.intent, 'log_past');
  assert.equal(r.category, 'work');
  assert.equal(r.startAt, NOW - 2 * H);
  assert.equal(r.endAt, NOW - H);
  assert.equal(r.confidence, 0.9);
});

test('sanitize: category lạ → null + clarify', () => {
  const r = sanitizeParse(base({ category: 'cooking' }), opts);
  assert.equal(r.category, null);
  assert.equal(r.intent, 'clarify');
  assert.ok(r.clarifyQuestion);
});

test('sanitize: category null vẫn ok (câu "stop")', () => {
  const r = sanitizeParse(base({ intent: 'stop', category: null }), opts);
  assert.equal(r.intent, 'stop');
  assert.equal(r.category, null);
});

test('sanitize: ngày rác → null', () => {
  const r = sanitizeParse(base({ startAt: 'yesterday morning', endAt: '' }), opts);
  assert.equal(r.startAt, null);
  assert.equal(r.endAt, null);
});

test('sanitize: lùi quá 7 ngày → clarify', () => {
  for (const days of [8, 10]) {
    const r = sanitizeParse(base({ startAt: new Date(NOW - days * 24 * H).toISOString() }), opts);
    assert.equal(r.intent, 'clarify', `${days} ngày trước phải hỏi lại`);
  }
});

test('sanitize: xa hơn 24h trong tương lai → clarify', () => {
  const r = sanitizeParse(
    base({ startAt: new Date(NOW + 30 * H).toISOString(), endAt: null }),
    opts,
  );
  assert.equal(r.intent, 'clarify');
});

test('sanitize: schedule trong 24h tới thì giữ nguyên', () => {
  const r = sanitizeParse(
    base({ intent: 'schedule', startAt: new Date(NOW + 4 * H).toISOString(), endAt: null }),
    opts,
  );
  assert.equal(r.intent, 'schedule');
});

test('sanitize: end <= start → bỏ end, không clarify', () => {
  const r = sanitizeParse(base({ endAt: new Date(NOW - 3 * H).toISOString() }), opts);
  assert.equal(r.endAt, null);
  assert.equal(r.intent, 'log_past');
});

test('sanitize: dài hơn 15h → clarify kèm câu hỏi', () => {
  const r = sanitizeParse(
    base({ startAt: new Date(NOW - 20 * H).toISOString(), endAt: new Date(NOW).toISOString() }),
    opts,
  );
  assert.equal(r.intent, 'clarify');
  assert.match(r.clarifyQuestion ?? '', /15 hours/);
});

test('sanitize: confidence ngoài [0,1] hoặc thiếu → 0', () => {
  assert.equal(sanitizeParse(base({ confidence: 1.5 }), opts).confidence, 0);
  assert.equal(sanitizeParse(base({ confidence: 7 }), opts).confidence, 0);
  assert.equal(sanitizeParse(base({ confidence: -1 }), opts).confidence, 0);
  assert.equal(sanitizeParse(base({ confidence: undefined }), opts).confidence, 0);
});

test('sanitize: targetActivityId lạ → null, id có thật thì giữ', () => {
  assert.equal(sanitizeParse(base({ targetActivityId: 'zzz' }), opts).targetActivityId, null);
  assert.equal(sanitizeParse(base({ targetActivityId: 'a1' }), opts).targetActivityId, 'a1');
});

test('sanitize: cắt transcript và label ở 200 ký tự', () => {
  const long = 'x'.repeat(500);
  const r = sanitizeParse(base({ transcript: long, label: long }), opts);
  assert.equal(r.transcript.length, 200);
  assert.equal(r.label?.length, 200);
});

test('sanitize: intent lạ → unknown', () => {
  assert.equal(sanitizeParse(base({ intent: 'delete_everything' }), opts).intent, 'unknown');
});

test('sanitize: body rỗng không làm crash', () => {
  const r = sanitizeParse(null, opts);
  assert.equal(r.intent, 'unknown');
  assert.equal(r.transcript, '');
  assert.equal(r.confidence, 0);
});
