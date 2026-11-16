// ============================================================
// logi - Several activities from one utterance (voice batch). Pure file.
// One line per entry for the confirm card, and which entries can be saved as
// they are (the rest need the manual sheet).
// ============================================================

import type { ParsedCommand } from '@/lib/parse-sanitize';
import { planVoice, type PlanContext } from '@/lib/voice-plan';

const CATEGORY: Record<string, string> = { learn: 'Learn', work: 'Work', fitness: 'Fitness', leisure: 'Leisure' };

function hm(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
}

function vnDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

/** "yesterday" / "Mon 16" when not today, else nothing. */
function dayNote(ms: number, now: number): string {
  if (vnDay(ms) === vnDay(now)) return '';
  if (vnDay(ms) === vnDay(now - 86_400_000)) return ', yesterday';
  return `, ${new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short', day: 'numeric' })}`;
}

/** "Work · devops · 08:00-12:00", "Learn · from 19:00", "Bedtime 23:30, yesterday". */
export function describeEntry(cmd: ParsedCommand, now: number): string {
  if (cmd.intent === 'bedtime') {
    return cmd.bedtimeAt === null ? 'Bedtime' : `Bedtime ${hm(cmd.bedtimeAt)}${dayNote(cmd.bedtimeAt, now)}`;
  }
  if (cmd.intent === 'stop') return 'Stop the running activity';
  if (cmd.intent === 'edit') return 'Change the last entry';
  const parts = [cmd.category ? CATEGORY[cmd.category] : 'Activity'];
  if (cmd.label) parts.push(cmd.label);
  if (cmd.startAt !== null && cmd.endAt !== null) {
    parts.push(`${hm(cmd.startAt)}-${hm(cmd.endAt)}${dayNote(cmd.startAt, now)}`);
  } else if (cmd.startAt !== null) {
    parts.push(`${cmd.intent === 'schedule' ? 'at' : 'from'} ${hm(cmd.startAt)}${dayNote(cmd.startAt, now)}`);
  }
  return parts.join(' · ');
}

export interface BatchItem {
  cmd: ParsedCommand;
  /** Has every field it needs; the others are shown but left out. */
  ready: boolean;
}

/** Plans each entry like a single sentence; only complete ones are saved from the batch. */
export function planBatch(entries: ParsedCommand[], ctx: PlanContext): BatchItem[] {
  return entries.map((cmd) => {
    const plan = planVoice(cmd, ctx);
    const ready = plan.kind === 'commit' || (plan.kind === 'confirm' && plan.missing.length === 0);
    return { cmd: plan.cmd, ready };
  });
}
