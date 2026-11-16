'use client';

import ActiveSessionCard from '@/components/ActiveSessionCard';
import { type Activity } from '@/types/logi';

/** Stopped cards only animate out; their buttons do nothing. */
const ignore = () => {};

/** Stopped sessions, shown only while they slide out. Nothing to tap. */
export default function StoppedCards({
  items,
  slot,
  compact,
  flip,
}: {
  items: Activity[];
  slot: Map<string, number>;
  compact: boolean;
  flip: (id: string) => (el: HTMLElement | null) => void;
}) {
  return items.map((a) => (
    <div
      key={a.id}
      ref={flip(a.id)}
      className="row-out"
      style={{ order: slot.get(a.id) }}
      aria-hidden="true"
    >
      <ActiveSessionCard activity={a} busy compact={compact} onStop={ignore} />
    </div>
  ));
}
