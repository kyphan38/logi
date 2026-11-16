// ============================================================
// logi - Adds words to parsed voice entries, from records the server read.
// targetText names the record a stop/edit/delete points at; overlap names
// saved records the new block runs into. Pure file, no Firestore.
// ============================================================

import type { ParsedCommand } from '@/lib/parse-sanitize';
import { CATEGORY_LABEL, type Activity } from '@/types/logi';

export type ContextRecord = Pick<Activity, 'id' | 'category' | 'label' | 'startAt' | 'endAt'>;

const TZ = 'Asia/Ho_Chi_Minh';

export function hm(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}

function vnDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** ", yesterday" / ", Mon 16" when not today, else nothing. */
export function dayNote(ms: number, now: number): string {
  if (vnDay(ms) === vnDay(now)) return '';
  if (vnDay(ms) === vnDay(now - 86_400_000)) return ', yesterday';
  return `, ${new Date(ms).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric' })}`;
}

/** "Work · devops · 08:00-12:00, yesterday" ("now" for a running one). */
export function describeRecord(r: ContextRecord, now: number): string {
  const parts = [CATEGORY_LABEL[r.category]];
  if (r.label) parts.push(r.label);
  parts.push(`${hm(r.startAt)}-${r.endAt === null ? 'now' : hm(r.endAt)}${dayNote(r.startAt, now)}`);
  return parts.join(' · ');
}

/** The time span the entry will occupy once saved, or null when it adds none. */
function spanOf(cmd: ParsedCommand, target: ContextRecord | undefined, now: number): [number, number] | null {
  if (cmd.intent === 'log_past' && cmd.startAt !== null && cmd.endAt !== null) return [cmd.startAt, cmd.endAt];
  if (cmd.intent === 'start' && cmd.startAt !== null) return [cmd.startAt, now];
  if (cmd.intent === 'edit' && target && (cmd.startAt !== null || cmd.endAt !== null)) {
    return [cmd.startAt ?? target.startAt, cmd.endAt ?? target.endAt ?? now];
  }
  return null;
}

/** "Work 08:00-12:00" or "Work 08:00-12:00 and 1 more". */
function overlapText(span: [number, number], records: ContextRecord[], skipId: string | null, now: number): string | null {
  const [s, e] = span;
  const hits = records.filter((r) => r.id !== skipId && r.startAt < e && (r.endAt ?? now) > s);
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.startAt - b.startAt);
  const first = hits[0];
  const text = `${CATEGORY_LABEL[first.category]} ${hm(first.startAt)}-${first.endAt === null ? 'now' : hm(first.endAt)}`;
  return hits.length > 1 ? `${text} and ${hits.length - 1} more` : text;
}

export function annotateEntries(entries: ParsedCommand[], records: ContextRecord[], now: number): ParsedCommand[] {
  // A record this utterance stops ends now, so a block starting now does not overlap it.
  const stopped = new Set(entries.filter((c) => c.intent === 'stop' && c.targetActivityId).map((c) => c.targetActivityId));
  const view = records.map((r) => (stopped.has(r.id) && r.endAt === null ? { ...r, endAt: now } : r));

  return entries.map((cmd) => {
    const target = cmd.targetActivityId ? records.find((r) => r.id === cmd.targetActivityId) : undefined;
    const span = spanOf(cmd, target, now);
    return {
      ...cmd,
      targetText: target ? describeRecord(target, now) : null,
      overlap: span ? overlapText(span, view, cmd.targetActivityId, now) : null,
    };
  });
}
