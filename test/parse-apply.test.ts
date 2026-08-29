import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createOnce } from '@/lib/once';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import { applyVoice, type VoiceRepo } from '@/lib/voice-command';
import { planVoice } from '@/lib/voice-plan';
import type { Activity } from '@/types/logi';
import { act, at, H } from './_helpers.ts';

const NOW = at('2026-08-26', '20:00');
const UID = 'u1';

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

interface Call {
  fn: string;
  args: unknown[];
}

/** Repo giả: ghi lại lời gọi thay vì đụng Firestore. */
function spyRepo(before: Activity = act({ id: 'x1', startAt: NOW - H })) {
  const calls: Call[] = [];
  const log = (fn: string, args: unknown[]) => calls.push({ fn, args });
  const repo: VoiceRepo = {
    startActivity: async (uid, input) => {
      log('startActivity', [uid, input]);
      return 'new1';
    },
    createPastActivity: async (uid, input) => {
      log('createPastActivity', [uid, input]);
      return 'new2';
    },
    stopActivity: async (uid, id, endAt) => {
      log('stopActivity', [uid, id, endAt]);
    },
    updateActivity: async (uid, id, patch) => {
      log('updateActivity', [uid, id, patch]);
    },
    deleteActivity: async (uid, id) => {
      log('deleteActivity', [uid, id]);
    },
    getActivity: async (uid, id) => {
      log('getActivity', [uid, id]);
      return before;
    },
  };
  const names = () => calls.map((c) => c.fn);
  const first = (fn: string) => calls.find((c) => c.fn === fn);
  return { repo, calls, names, first };
}

describe('applyVoice - mỗi intent gọi đúng hàm', () => {
  it('start → startActivity, kèm nguồn "voice"', async () => {
    const s = spyRepo();
    const w = await applyVoice(UID, cmd({ intent: 'start', label: 'devops' }), s.repo);

    assert.deepEqual(s.names(), ['startActivity']);
    assert.deepEqual(s.first('startActivity')?.args, [
      UID,
      {
        category: 'work',
        label: 'devops',
        startAt: undefined,
        source: 'voice',
        confidence: 0.95,
        rawText: 'test',
      },
    ]);
    assert.equal(w.activityId, 'new1');
    assert.match(w.message, /Started Work/);
  });

  it('schedule → startActivity với status "scheduled"', async () => {
    const s = spyRepo();
    const start = NOW + 4 * H;
    await applyVoice(UID, cmd({ intent: 'schedule', category: 'fitness', startAt: start }), s.repo);

    const args = s.first('startActivity')?.args as [string, Record<string, unknown>];
    assert.deepEqual(s.names(), ['startActivity']);
    assert.equal(args[1].status, 'scheduled');
    assert.equal(args[1].startAt, start);
  });

  it('log_past → createPastActivity với cả startAt và endAt', async () => {
    const s = spyRepo();
    await applyVoice(
      UID,
      cmd({ intent: 'log_past', startAt: NOW - 3 * H, endAt: NOW - H }),
      s.repo,
    );

    const args = s.first('createPastActivity')?.args as [string, Record<string, unknown>];
    assert.deepEqual(s.names(), ['createPastActivity']);
    assert.equal(args[1].startAt, NOW - 3 * H);
    assert.equal(args[1].endAt, NOW - H);
  });

  it('stop → stopActivity đúng id đang chạy', async () => {
    const s = spyRepo();
    await applyVoice(
      UID,
      cmd({ intent: 'stop', category: null, targetActivityId: 'x1', endAt: NOW }),
      s.repo,
    );

    assert.deepEqual(s.names(), ['stopActivity']);
    assert.deepEqual(s.first('stopActivity')?.args, [UID, 'x1', NOW]);
  });

  it('stop không nói giờ → để activities.ts tự lấy now', async () => {
    const s = spyRepo();
    await applyVoice(UID, cmd({ intent: 'stop', category: null, targetActivityId: 'x1' }), s.repo);
    assert.deepEqual(s.first('stopActivity')?.args, [UID, 'x1', undefined]);
  });

  it('edit → đọc bản cũ trước, rồi chỉ patch field có trong câu nói', async () => {
    const s = spyRepo();
    await applyVoice(
      UID,
      cmd({ intent: 'edit', category: 'learn', targetActivityId: 'x1', confidence: 0.9 }),
      s.repo,
    );

    assert.deepEqual(s.names(), ['getActivity', 'updateActivity']);
    assert.deepEqual(s.first('updateActivity')?.args, [
      UID,
      'x1',
      { source: 'voice', confidence: 0.9, rawText: 'test', category: 'learn' },
    ]);
  });

  it('intent không ghi được → ném lỗi, không đụng repo', async () => {
    const s = spyRepo();
    await assert.rejects(() => applyVoice(UID, cmd({ intent: 'clarify' }), s.repo), /Cannot apply/);
    assert.deepEqual(s.names(), []);
  });
});

describe('applyVoice - Undo trả lại nguyên trạng', () => {
  it('undo của start / log_past là xoá record vừa tạo', async () => {
    const s = spyRepo();
    const w = await applyVoice(UID, cmd({ intent: 'start' }), s.repo);
    await w.undo();
    assert.deepEqual(s.first('deleteActivity')?.args, [UID, 'new1']);
  });

  it('undo của stop là mở lại session', async () => {
    const s = spyRepo();
    const w = await applyVoice(
      UID,
      cmd({ intent: 'stop', category: null, targetActivityId: 'x1' }),
      s.repo,
    );
    await w.undo();
    assert.deepEqual(s.first('updateActivity')?.args, [
      UID,
      'x1',
      { endAt: null, status: 'active' },
    ]);
  });

  it('undo của edit trả lại giá trị cũ đã đọc, không đoán', async () => {
    const before = act({ id: 'x1', category: 'work', label: 'devops', startAt: NOW - 2 * H });
    const s = spyRepo(before);
    const w = await applyVoice(
      UID,
      cmd({ intent: 'edit', category: 'learn', targetActivityId: 'x1' }),
      s.repo,
    );
    await w.undo();

    const undoArgs = s.calls.filter((c) => c.fn === 'updateActivity')[1].args as [
      string,
      string,
      Record<string, unknown>,
    ];
    assert.equal(undoArgs[2].category, 'work');
    assert.equal(undoArgs[2].label, 'devops');
    assert.equal(undoArgs[2].startAt, NOW - 2 * H);
    assert.equal(undoArgs[2].source, 'manual');
  });
});

describe('once - requestId trùng chỉ ghi một lần', () => {
  it('gọi lại cùng requestId thì bỏ qua', async () => {
    const s = spyRepo();
    const once = createOnce();
    const run = () => once.run('r1', () => applyVoice(UID, cmd({ intent: 'start' }), s.repo));

    const a = await run();
    const b = await run();

    assert.deepEqual(s.names(), ['startActivity']);
    assert.equal(a?.activityId, 'new1');
    assert.equal(b, null, 'lần hai không trả kết quả mới');
  });

  it('hai requestId khác nhau thì ghi cả hai', async () => {
    const s = spyRepo();
    const once = createOnce();
    await once.run('r1', () => applyVoice(UID, cmd({ intent: 'start' }), s.repo));
    await once.run('r2', () => applyVoice(UID, cmd({ intent: 'start' }), s.repo));
    assert.equal(s.names().length, 2);
  });

  it('ghi hỏng thì nhả id ra để thử lại', async () => {
    const once = createOnce();
    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n === 1) throw new Error('mạng chết');
      return 'ok';
    };

    await assert.rejects(() => once.run('r1', flaky));
    assert.equal(await once.run('r1', flaky), 'ok');
    assert.equal(n, 2);
  });

  it('hai lời gọi song song cùng id: chỉ một cái chạy', async () => {
    const s = spyRepo();
    const once = createOnce();
    const both = await Promise.all([
      once.run('r1', () => applyVoice(UID, cmd({ intent: 'start' }), s.repo)),
      once.run('r1', () => applyVoice(UID, cmd({ intent: 'start' }), s.repo)),
    ]);

    assert.deepEqual(s.names(), ['startActivity']);
    assert.equal(both.filter((x) => x !== null).length, 1);
  });
});

describe('ngưỡng auto-commit', () => {
  const ctx = { active: [] as Activity[] };

  it('confidence 0.9 → ghi luôn', () => {
    assert.equal(planVoice(cmd({ confidence: 0.9 }), ctx).kind, 'commit');
  });

  it('confidence 0.7 → hỏi Confirm', () => {
    const p = planVoice(cmd({ confidence: 0.7 }), ctx);
    assert.equal(p.kind, 'confirm');
  });

  it('confidence thấp nhưng thiếu field → vẫn là Confirm, không phải ghi bừa', () => {
    const p = planVoice(cmd({ confidence: 0.7, category: null }), ctx);
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['category']);
  });
});
