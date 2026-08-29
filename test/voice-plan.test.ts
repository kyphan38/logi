import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { planVoice } from '@/lib/voice-plan';
import { sanitizeParse, type ParsedCommand } from '@/lib/parse-sanitize';
import { applyVoice, type VoiceRepo } from '@/lib/voice-command';
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

  // Ghi vào QUÁ KHỨ thì không bao giờ tự lưu - xem ghi chú trong voice-plan.ts.
  // "I read for two hours last night": model buộc phải đoán giờ, đoán xong mà
  // commit im lặng thì lịch sử có record giả.
  it('log_past đủ mốc giờ + confidence tuyệt đối → vẫn phải Confirm', () => {
    const p = planVoice(
      cmd({ intent: 'log_past', startAt: NOW - 7_200_000, endAt: NOW, confidence: 1 }),
      { active: [] },
    );
    assert.equal(p.kind, 'confirm');
    // Card mở ra với giờ đã điền sẵn - không bắt gõ lại từ đầu.
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, []);
    assert.equal(p.cmd.startAt, NOW - 7_200_000);
  });

  // Câu nói rõ giờ cũng đi qua Confirm, nhưng chỉ tốn một cú chạm.
  it('log_past nói rõ "8 AM to 11 AM" → confirm chứ không phải manual', () => {
    const p = planVoice(
      cmd({
        intent: 'log_past',
        category: 'work',
        startAt: at('2026-08-26', '08:00'),
        endAt: at('2026-08-26', '11:00'),
      }),
      { active: [] },
    );
    assert.equal(p.kind, 'confirm');
    assert.equal(p.cmd.category, 'work');
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

// ---------------------------------------------------------------------------
// BẮT ĐẦU HỒI TỐ - từ câu Gemini trả về, qua sanitize, tới quyết định và
// lời gọi ghi. "Tôi bắt đầu 30 phút trước và vẫn đang xem" phải ra một
// session ĐANG CHẠY với startAt trong quá khứ, không phải một khối đã đóng.
// ---------------------------------------------------------------------------

describe('bắt đầu hồi tố', () => {
  const SAN = { now: NOW, knownIds: new Set<string>() };

  /** Câu Gemini trả về (ISO string), trước khi sanitize. */
  function raw(o: Record<string, unknown>) {
    return {
      category: 'leisure',
      label: 'YouTube',
      confidence: 0.9,
      clarifyQuestion: null,
      clarifyOptions: null,
      targetActivityId: null,
      transcript: 'test',
      ...o,
    } as never;
  }

  it('log_past thiếu endAt → thành start, và ghi được luôn', () => {
    const c = sanitizeParse(
      raw({
        intent: 'log_past',
        startAt: new Date(NOW - 30 * 60_000).toISOString(),
        endAt: null,
        transcript: "I started watching YouTube 30 minutes ago and haven't finished yet",
      }),
      SAN,
    );
    assert.equal(c.intent, 'start');

    const p = planVoice(c, { active: [] });
    assert.equal(p.kind, 'commit'); // không hỏi giờ kết thúc nữa
    assert.equal(p.cmd.startAt, NOW - 30 * 60_000);
  });

  it('start kèm endAt → bỏ endAt, vẫn là session đang chạy', () => {
    const c = sanitizeParse(
      raw({
        intent: 'start',
        startAt: new Date(NOW - 30 * 60_000).toISOString(),
        endAt: new Date(NOW).toISOString(),
        transcript: 'I am watching YouTube, started 30 minutes ago, until now still watching',
      }),
      SAN,
    );
    assert.equal(c.intent, 'start');
    assert.equal(c.endAt, null);
    assert.equal(planVoice(c, { active: [] }).kind, 'commit');
  });

  it('start có startAt quá khứ → startActivity nhận đúng giờ đó, endAt null', async () => {
    const c = cmd({
      intent: 'start',
      category: 'leisure',
      label: 'YouTube',
      startAt: NOW - 30 * 60_000,
    });

    let seen: { uid: string; input: Record<string, unknown> } | null = null;
    const repo = {
      startActivity: async (uid: string, input: Record<string, unknown>) => {
        seen = { uid, input };
        return 'new1';
      },
    } as unknown as VoiceRepo;

    await applyVoice('u1', planVoice(c, { active: [] }).cmd, repo);

    const call = seen as unknown as { uid: string; input: Record<string, unknown> };
    assert.equal(call.uid, 'u1');
    assert.equal(call.input.startAt, NOW - 30 * 60_000);
    assert.equal(call.input.category, 'leisure');
    // Không truyền status → activities.ts mặc định 'active', endAt null.
    assert.equal(call.input.status, undefined);
  });
});
