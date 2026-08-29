import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isRealTap, pressDistance, type Press } from '@/lib/tap-guard';

const T = 1_000_000;

function press(over: Partial<Press> = {}): Press {
  return {
    downX: 100,
    downY: 200,
    downAt: T,
    upX: 100,
    upY: 200,
    upAt: T + 120,
    lastScrollAt: null,
    ...over,
  };
}

test('chạm thật: di chuyển 4px, 200ms → kích hoạt', () => {
  const p = press({ upX: 103, upY: 202.6, upAt: T + 200 });
  assert.ok(pressDistance(p) < 5);
  assert.equal(isRealTap(p), true);
});

test('vuốt: di chuyển 25px → không kích hoạt', () => {
  assert.equal(isRealTap(press({ upY: 225 })), false);
});

test('vuốt chéo cũng là vuốt: 12px ngang + 12px dọc', () => {
  assert.equal(isRealTap(press({ upX: 112, upY: 212 })), false);
});

test('giữ lâu: 700ms → không kích hoạt', () => {
  assert.equal(isRealTap(press({ upAt: T + 700 })), false);
});

test('trong 300ms sau scroll → không kích hoạt', () => {
  assert.equal(isRealTap(press({ lastScrollAt: T + 20 })), false);
});

test('quá 300ms sau scroll → kích hoạt lại bình thường', () => {
  assert.equal(isRealTap(press({ upAt: T + 400, lastScrollAt: T })), true);
});

test('chưa cuộn lần nào thì lớp thứ ba không chặn gì', () => {
  assert.equal(isRealTap(press({ lastScrollAt: null })), true);
});
