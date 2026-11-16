// ============================================================
// logi - Several activities from one utterance (voice batch). Pure file.
// One line per entry for the confirm card, and which entries can be saved as
// they are (the rest need the manual sheet).
// ============================================================

import type { ParsedCommand } from '@/lib/parse-sanitize';
import { dayNote, hm } from '@/lib/voice-context';
import { planVoice, type PlanContext } from '@/lib/voice-plan';

const CATEGORY: Record<string, string> = { learn: 'Learn', work: 'Work', fitness: 'Fitness', leisure: 'Leisure' };

/** "Work · devops · 08:00-12:00", "Learn · from 19:00", "Bedtime 23:30, yesterday". */
export function describeEntry(cmd: ParsedCommand, now: number): string {
  if (cmd.intent === 'bedtime') {
    return cmd.bedtimeAt === null ? 'Bedtime' : `Bedtime ${hm(cmd.bedtimeAt)}${dayNote(cmd.bedtimeAt, now)}`;
  }
  if (cmd.intent === 'stop') return cmd.targetText ? `Stop ${cmd.targetText}` : 'Stop the running activity';
  if (cmd.intent === 'edit') return cmd.targetText ? `Change ${cmd.targetText}` : 'Change the last entry';
  if (cmd.intent === 'delete') return cmd.targetText ? `Delete ${cmd.targetText}` : 'Delete the last entry';
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
