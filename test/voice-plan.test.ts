import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planVoice } from '@/lib/voice-plan';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import { act, at } from './_helpers.ts';

const NOW = at('2026-08-26', '20:00');

function cmd(o: Partial<ParsedCommand>): ParsedCommand {
  return {
    intent: 'start',
    category: 'work',
    label: null,
    startAt: null,
    endAt: null,
    confidence: 0.95,
    clarifyQuestion: null,
    clarifyOptions: null,
    targetActivityId: null,
    transcript: 'test',
    ...o,
  };
}

describe('planVoice - nhánh không ghi', () => {
  it('unknown → nhập tay', () => {
    assert.equal(planVoice(cmd({ intent: 'unknown' }), { active: [] }).kind, 'manual');
  });

  it('clarify → hỏi lại, kể cả khi confidence cao', () => {
    assert.equal(planVoice(cmd({ intent: 'clarify', confidence: 1 }), { active: [] }).kind, 'clarify');
  });
});

describe('planVoice - ngưỡng tự ghi', () => {
  it('0.95 + đủ field → ghi luôn', () => {
    assert.equal(planVoice(cmd({}), { active: [] }).kind, 'commit');
  });

  it('đúng 0.85 → vẫn ghi luôn (ngưỡng tính cả biên)', () => {
    assert.equal(planVoice(cmd({ confidence: 0.85 }), { active: [] }).kind, 'commit');
  });

  it('0.84 → bắt xác nhận, nhưng không thiếu field', () => {
    const p = planVoice(cmd({ confidence: 0.84 }), { active: [] });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, []);
  });
});

describe('planVoice - field bắt buộc', () => {
  it('start thiếu category → confirm + báo đúng field', () => {
    const p = planVoice(cmd({ category: null }), { active: [] });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['category']);
  });

  it('start không có giờ vẫn ghi được - mặc định là bây giờ', () => {
    assert.equal(planVoice(cmd({ startAt: null }), { active: [] }).kind, 'commit');
  });

  it('schedule thiếu giờ → confirm', () => {
    const p = planVoice(cmd({ intent: 'schedule', startAt: null }), { active: [] });
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['startAt']);
  });

  it('log_past thiếu cả hai mốc giờ → báo cả hai', () => {
    const p = planVoice(cmd({ intent: 'log_past' }), { active: [] });
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['startAt', 'endAt']);
  });

  it('log_past đủ mốc giờ → ghi luôn', () => {
    const p = planVoice(
      cmd({ intent: 'log_past', startAt: NOW - 3_600_000, endAt: NOW }), { active: [] });
    assert.equal(p.kind, 'commit');
  });

  it('confidence cao vẫn thua field thiếu - thiếu là phải hỏi', () => {
    const p = planVoice(cmd({ category: null, confidence: 1 }), { active: [] });
    assert.equal(p.kind, 'confirm');
  });
});

describe('planVoice - chọn session cho stop/edit', () => {
  const one = [act({ id: 'x1', startAt: NOW - 3_600_000 })];
  const two = [
    act({ id: 'x1', category: 'work', startAt: NOW - 3_600_000 }),
    act({ id: 'x2', category: 'learn', startAt: NOW - 1_800_000 }),
  ];

  it('đúng một session đang chạy → tự chọn, khỏi hỏi', () => {
    const p = planVoice(cmd({ intent: 'stop', category: null }), { active: one });
    assert.equal(p.kind, 'commit');
    assert.equal(p.cmd.targetActivityId, 'x1');
  });

  it('hai session đang chạy → phải hỏi', () => {
    const p = planVoice(cmd({ intent: 'stop', category: null }), { active: two });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['target']);
  });

  it('không có session nào → phải hỏi', () => {
    assert.equal(planVoice(cmd({ intent: 'stop', category: null }), { active: [] }).kind, 'confirm');
  });

  it('Gemini đã chỉ đúng id thì giữ nguyên, không ghi đè', () => {
    const p = planVoice(cmd({ intent: 'stop', targetActivityId: 'x2', category: null }), { active: two });
    assert.equal(p.kind, 'commit');
    assert.equal(p.cmd.targetActivityId, 'x2');
  });

  it('stop không cần category - "I am done" là đủ', () => {
    const p = planVoice(cmd({ intent: 'stop', category: null }), { active: one });
    assert.equal(p.kind, 'commit');
  });

  it('edit cũng tự chọn khi chỉ có một session', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn' }), { active: one });
    assert.equal(p.kind, 'commit');
    assert.equal(p.cmd.targetActivityId, 'x1');
  });

  it('không sửa lệnh gốc tại chỗ', () => {
    const original = cmd({ intent: 'stop', category: null });
    planVoice(original, { active: one });
    assert.equal(original.targetActivityId, null);
  });
});

describe('planVoice - chỉ hỏi lại một lần (Task 5)', () => {
  it('clarify lần đầu → hỏi', () => {
    const p = planVoice(cmd({ intent: 'clarify' }), { active: [] });
    assert.equal(p.kind, 'clarify');
  });

  it('clarify lần hai → mở sheet nhập tay, không hỏi vòng hai', () => {
    const p = planVoice(cmd({ intent: 'clarify' }), { active: [], asked: true });
    assert.equal(p.kind, 'manual');
  });

  it('trả lời xong mà lệnh đã đủ field → vẫn ghi bình thường', () => {
    const p = planVoice(cmd({}), { active: [], asked: true });
    assert.equal(p.kind, 'commit');
  });

  it('unknown lần hai vẫn là nhập tay', () => {
    const p = planVoice(cmd({ intent: 'unknown' }), { active: [], asked: true });
    assert.equal(p.kind, 'manual');
  });
});

describe('planVoice - sửa bằng giọng nói record vừa ghi (Task 5)', () => {
  const one = [act({ id: 'x1', startAt: NOW - 3_600_000 })];

  it('edit không có session nào đang chạy → sửa record vừa ghi', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn' }), {
      active: [],
      lastCreatedId: 'past1',
    });
    assert.equal(p.kind, 'commit');
    assert.equal(p.cmd.targetActivityId, 'past1');
  });

  it('record vừa ghi thắng session đang chạy - "no, that was learning" nói về nó', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn' }), {
      active: one,
      lastCreatedId: 'past1',
    });
    assert.equal(p.cmd.targetActivityId, 'past1');
  });

  it('Gemini đã chỉ id thì record vừa ghi không được ghi đè', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn', targetActivityId: 'x9' }), {
      active: one,
      lastCreatedId: 'past1',
    });
    assert.equal(p.cmd.targetActivityId, 'x9');
  });

  it('stop KHÔNG lấy record vừa ghi - nó có thể đã dừng rồi', () => {
    const p = planVoice(cmd({ intent: 'stop', category: null }), {
      active: [],
      lastCreatedId: 'past1',
    });
    assert.equal(p.kind, 'confirm');
  });

  it('hết hạn 5 phút (trang truyền null) → quay lại hỏi', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn' }), {
      active: [],
      lastCreatedId: null,
    });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['target']);
  });
});
