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
    bedtimeAt: null,
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

/** Fake repo: records calls instead of touching Firestore. */
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
    setBedtime: async (uid, at) => {
      log('setBedtime', [uid, at]);
      return '2026-08-26';
    },
    clearBedtime: async (uid, date) => {
      log('clearBedtime', [uid, date]);
    },
  };
  const names = () => calls.map((c) => c.fn);
  const first = (fn: string) => calls.find((c) => c.fn === fn);
  return { repo, calls, names, first };
}

describe('applyVoice - each intent calls the right function', () => {
  it('start → startActivity, with source "voice"', async () => {
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

  it('schedule → startActivity with status "scheduled"', async () => {
    const s = spyRepo();
    const start = NOW + 4 * H;
    await applyVoice(UID, cmd({ intent: 'schedule', category: 'fitness', startAt: start }), s.repo);

    const args = s.first('startActivity')?.args as [string, Record<string, unknown>];
    assert.deepEqual(s.names(), ['startActivity']);
    assert.equal(args[1].status, 'scheduled');
    assert.equal(args[1].startAt, start);
  });

  it('log_past → createPastActivity with both startAt and endAt', async () => {
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

  it('stop → stopActivity on the running id', async () => {
    const s = spyRepo();
    await applyVoice(
      UID,
      cmd({ intent: 'stop', category: null, targetActivityId: 'x1', endAt: NOW }),
      s.repo,
    );

    assert.deepEqual(s.names(), ['stopActivity']);
    assert.deepEqual(s.first('stopActivity')?.args, [UID, 'x1', NOW]);
  });

  it('stop with no time → activities.ts uses now', async () => {
    const s = spyRepo();
    await applyVoice(UID, cmd({ intent: 'stop', category: null, targetActivityId: 'x1' }), s.repo);
    assert.deepEqual(s.first('stopActivity')?.args, [UID, 'x1', undefined]);
  });

  it('edit → reads the old record first, then patches only the spoken fields', async () => {
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

  it('an intent that cannot be written → throws, does not touch the repo', async () => {
    const s = spyRepo();
    await assert.rejects(() => applyVoice(UID, cmd({ intent: 'clarify' }), s.repo), /Cannot apply/);
    assert.deepEqual(s.names(), []);
  });
});

describe('applyVoice - Undo restores the original state', () => {
  it('undo of start / log_past deletes the new record', async () => {
    const s = spyRepo();
    const w = await applyVoice(UID, cmd({ intent: 'start' }), s.repo);
    await w.undo();
    assert.deepEqual(s.first('deleteActivity')?.args, [UID, 'new1']);
  });

  it('undo of stop reopens the session', async () => {
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

  it('undo of edit restores the old values it read, no guessing', async () => {
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

describe('once - a repeated requestId writes only once', () => {
  it('calling again with the same requestId is skipped', async () => {
    const s = spyRepo();
    const once = createOnce();
    const run = () => once.run('r1', () => applyVoice(UID, cmd({ intent: 'start' }), s.repo));

    const a = await run();
    const b = await run();

    assert.deepEqual(s.names(), ['startActivity']);
    assert.equal(a?.activityId, 'new1');
    assert.equal(b, null, 'second call returns no new result');
  });

  it('two different requestIds both write', async () => {
    const s = spyRepo();
    const once = createOnce();
    await once.run('r1', () => applyVoice(UID, cmd({ intent: 'start' }), s.repo));
    await once.run('r2', () => applyVoice(UID, cmd({ intent: 'start' }), s.repo));
    assert.equal(s.names().length, 2);
  });

  it('a failed write releases the id for retry', async () => {
    const once = createOnce();
    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n === 1) throw new Error('network down');
      return 'ok';
    };

    await assert.rejects(() => once.run('r1', flaky));
    assert.equal(await once.run('r1', flaky), 'ok');
    assert.equal(n, 2);
  });

  it('two parallel calls with the same id: only one runs', async () => {
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

describe('auto-commit threshold', () => {
  const ctx = { active: [] as Activity[] };

  it('confidence 0.9 → write right away', () => {
    assert.equal(planVoice(cmd({ confidence: 0.9 }), ctx).kind, 'commit');
  });

  it('confidence 0.7 → ask Confirm', () => {
    const p = planVoice(cmd({ confidence: 0.7 }), ctx);
    assert.equal(p.kind, 'confirm');
  });

  it('low confidence and a missing field → still Confirm, no blind write', () => {
    const p = planVoice(cmd({ confidence: 0.7, category: null }), ctx);
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['category']);
  });
});

describe('bedtime - a bedtime mark, NOT an activity', () => {
  const BED = at('2026-08-26', '23:12');

  it('bedtime with a full time → commit, calls setBedtime, not startActivity', async () => {
    const s = spyRepo();
    const p = planVoice(cmd({ intent: 'bedtime', category: null, bedtimeAt: BED }), {
      active: [],
    });
    assert.equal(p.kind, 'commit');

    const w = await applyVoice(
      UID,
      cmd({ intent: 'bedtime', category: null, bedtimeAt: BED }),
      s.repo,
    );
    assert.deepEqual(s.names(), ['setBedtime']);
    assert.deepEqual(s.first('setBedtime')?.args, [UID, BED]);
    assert.match(w.message, /Bedtime/);
    assert.equal(w.activityId, '', 'no activity, so nothing to edit next');
  });

  it('bedtime without a time → confirm, names Bedtime', () => {
    const p = planVoice(cmd({ intent: 'bedtime', category: null, bedtimeAt: null }), {
      active: [],
    });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['bedtimeAt']);
  });

  it('undo of bedtime removes the mark, deletes no activity', async () => {
    const s = spyRepo();
    const w = await applyVoice(
      UID,
      cmd({ intent: 'bedtime', category: null, bedtimeAt: BED }),
      s.repo,
    );
    await w.undo();
    assert.deepEqual(s.first('clearBedtime')?.args, [UID, '2026-08-26']);
    assert.ok(!s.names().includes('deleteActivity'));
  });

  it('model gives up on a bedtime phrase → points to the button, does NOT open the activity sheet', () => {
    const p = planVoice(
      cmd({ intent: 'unknown', transcript: 'I went to bed at eleven thirty' }),
      { active: [] },
    );
    assert.equal(p.kind, 'retired');
    assert.match(p.kind === 'retired' ? p.message : '', /bedtime button/);
  });
});
