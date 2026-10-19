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
    bedtimeAt: null,
    confidence: 0.95,
    clarifyQuestion: null,
    clarifyOptions: null,
    targetActivityId: null,
    transcript: 'test',
    ...o,
  };
}

describe('planVoice - no-write branches', () => {
  it('unknown → manual entry', () => {
    assert.equal(planVoice(cmd({ intent: 'unknown' }), { active: [] }).kind, 'manual');
  });

  it('clarify → ask again, even with high confidence', () => {
    assert.equal(planVoice(cmd({ intent: 'clarify', confidence: 1 }), { active: [] }).kind, 'clarify');
  });
});

describe('planVoice - auto-commit threshold', () => {
  it('0.95 + all fields → commit right away', () => {
    assert.equal(planVoice(cmd({}), { active: [] }).kind, 'commit');
  });

  it('exactly 0.85 → still commits (threshold is inclusive)', () => {
    assert.equal(planVoice(cmd({ confidence: 0.85 }), { active: [] }).kind, 'commit');
  });

  it('0.84 → confirm, but no missing fields', () => {
    const p = planVoice(cmd({ confidence: 0.84 }), { active: [] });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, []);
  });
});

describe('planVoice - required fields', () => {
  it('start without category → confirm + names the right field', () => {
    const p = planVoice(cmd({ category: null }), { active: [] });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['category']);
  });

  it('start without a time still commits - defaults to now', () => {
    assert.equal(planVoice(cmd({ startAt: null }), { active: [] }).kind, 'commit');
  });

  it('schedule without a time → confirm', () => {
    const p = planVoice(cmd({ intent: 'schedule', startAt: null }), { active: [] });
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['startAt']);
  });

  it('log_past missing both times → reports both', () => {
    const p = planVoice(cmd({ intent: 'log_past' }), { active: [] });
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['startAt', 'endAt']);
  });

  // Writing to the PAST never auto-saves, see the note in voice-plan.ts.
  // "I read for two hours last night": the model must guess the times, and a
  // silent commit of a guess puts a fake record in history.
  it('log_past with both times + full confidence → still Confirm', () => {
    const p = planVoice(
      cmd({ intent: 'log_past', startAt: NOW - 7_200_000, endAt: NOW, confidence: 1 }),
      { active: [] },
    );
    assert.equal(p.kind, 'confirm');
    // The card opens with the times filled in, no retyping.
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, []);
    assert.equal(p.cmd.startAt, NOW - 7_200_000);
  });

  // Explicit times also go through Confirm, but it costs only one tap.
  it('log_past saying "8 AM to 11 AM" → confirm, not manual', () => {
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

  it('high confidence still loses to a missing field - missing means ask', () => {
    const p = planVoice(cmd({ category: null, confidence: 1 }), { active: [] });
    assert.equal(p.kind, 'confirm');
  });
});

describe('planVoice - picking the session for stop/edit', () => {
  const one = [act({ id: 'x1', startAt: NOW - 3_600_000 })];
  const two = [
    act({ id: 'x1', category: 'work', startAt: NOW - 3_600_000 }),
    act({ id: 'x2', category: 'learn', startAt: NOW - 1_800_000 }),
  ];

  it('exactly one running session → picked automatically, no question', () => {
    const p = planVoice(cmd({ intent: 'stop', category: null }), { active: one });
    assert.equal(p.kind, 'commit');
    assert.equal(p.cmd.targetActivityId, 'x1');
  });

  it('two running sessions → must ask', () => {
    const p = planVoice(cmd({ intent: 'stop', category: null }), { active: two });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['target']);
  });

  it('no session → must ask', () => {
    assert.equal(planVoice(cmd({ intent: 'stop', category: null }), { active: [] }).kind, 'confirm');
  });

  it('an id given by Gemini is kept, not overwritten', () => {
    const p = planVoice(cmd({ intent: 'stop', targetActivityId: 'x2', category: null }), { active: two });
    assert.equal(p.kind, 'commit');
    assert.equal(p.cmd.targetActivityId, 'x2');
  });

  it('stop needs no category - "I am done" is enough', () => {
    const p = planVoice(cmd({ intent: 'stop', category: null }), { active: one });
    assert.equal(p.kind, 'commit');
  });

  it('edit also auto-picks when there is only one session', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn' }), { active: one });
    assert.equal(p.kind, 'commit');
    assert.equal(p.cmd.targetActivityId, 'x1');
  });

  it('does not mutate the original command', () => {
    const original = cmd({ intent: 'stop', category: null });
    planVoice(original, { active: one });
    assert.equal(original.targetActivityId, null);
  });
});

describe('planVoice - asks again only once', () => {
  it('first clarify → ask', () => {
    const p = planVoice(cmd({ intent: 'clarify' }), { active: [] });
    assert.equal(p.kind, 'clarify');
  });

  it('second clarify → open the manual sheet, no second round', () => {
    const p = planVoice(cmd({ intent: 'clarify' }), { active: [], asked: true });
    assert.equal(p.kind, 'manual');
  });

  it('answer gives a complete command → commits as usual', () => {
    const p = planVoice(cmd({}), { active: [], asked: true });
    assert.equal(p.kind, 'commit');
  });

  it('second unknown is still manual entry', () => {
    const p = planVoice(cmd({ intent: 'unknown' }), { active: [], asked: true });
    assert.equal(p.kind, 'manual');
  });
});

describe('planVoice - voice edit of the record just saved', () => {
  const one = [act({ id: 'x1', startAt: NOW - 3_600_000 })];

  it('edit with no running session → edits the record just saved', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn' }), {
      active: [],
      lastCreatedId: 'past1',
    });
    assert.equal(p.kind, 'commit');
    assert.equal(p.cmd.targetActivityId, 'past1');
  });

  it('the record just saved beats a running session - "no, that was learning" is about it', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn' }), {
      active: one,
      lastCreatedId: 'past1',
    });
    assert.equal(p.cmd.targetActivityId, 'past1');
  });

  it('an id given by Gemini is not overwritten by the record just saved', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn', targetActivityId: 'x9' }), {
      active: one,
      lastCreatedId: 'past1',
    });
    assert.equal(p.cmd.targetActivityId, 'x9');
  });

  it('stop does NOT take the record just saved - it may be stopped already', () => {
    const p = planVoice(cmd({ intent: 'stop', category: null }), {
      active: [],
      lastCreatedId: 'past1',
    });
    assert.equal(p.kind, 'confirm');
  });

  it('after 5 minutes (page passes null) → back to asking', () => {
    const p = planVoice(cmd({ intent: 'edit', category: 'learn' }), {
      active: [],
      lastCreatedId: null,
    });
    assert.equal(p.kind, 'confirm');
    assert.deepEqual(p.kind === 'confirm' ? p.missing : null, ['target']);
  });
});

// ---------------------------------------------------------------------------
// BACKDATED START - from the Gemini reply, through sanitize, to the decision
// and the write call. "I started 30 minutes ago and am still watching" must
// give a RUNNING session with a past startAt, not a closed block.
// ---------------------------------------------------------------------------

describe('backdated start', () => {
  const SAN = { now: NOW, knownIds: new Set<string>() };

  /** Gemini reply (ISO strings), before sanitize. */
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

  it('log_past without endAt → becomes start, and commits right away', () => {
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
    assert.equal(p.kind, 'commit'); // no longer asks for an end time
    assert.equal(p.cmd.startAt, NOW - 30 * 60_000);
  });

  it('start with endAt → endAt dropped, still a running session', () => {
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

  it('start with a past startAt → startActivity gets that exact time, endAt null', async () => {
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
    // No status passed → activities.ts defaults to 'active', endAt null.
    assert.equal(call.input.status, undefined);
  });
});
