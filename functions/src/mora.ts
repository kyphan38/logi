// ---------------------------------------------------------------------------
// logi functions - Tell mora when a mora run is stopped in logi
//
// mora starts and stops its runs here through /api/ingest/mora/live; those
// stops carry `stoppedBy: 'mora'`. Any other end of a running mora record
// (Stop in logi, edit with an end time, delete) means "stop mora too".
// Pure: the root test suite imports it.
// ---------------------------------------------------------------------------

type ActivityLike = { status?: unknown; endAt?: unknown; source?: unknown; stoppedBy?: unknown } | undefined;

export interface MoraStop {
  runId: string;
  endAt: number;
}

export function moraStopFor(docId: string, before: ActivityLike, after: ActivityLike, now: number): MoraStop | null {
  if (!docId.startsWith('mora_') || !before) return null;
  const wasRunning = before.source === 'mora' && before.status === 'active' && before.endAt == null;
  if (!wasRunning) return null;
  const runId = docId.slice('mora_'.length);
  if (!after) return { runId, endAt: now };
  if (after.stoppedBy === 'mora') return null;
  if (typeof after.endAt === 'number') return { runId, endAt: after.endAt };
  if (after.status !== 'active') return { runId, endAt: now };
  return null;
}
