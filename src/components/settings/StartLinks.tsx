'use client';

import { useState } from 'react';

import { startLinks } from '@/lib/start-link';
import { CATEGORY_LABEL } from '@/types/logi';

/** G4: links that start a session at once, for Shortcuts or the Home Screen. */
export default function StartLinks() {
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin));
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (url: string) => {
    void navigator.clipboard?.writeText(url).then(() => setCopied(url));
  };

  return (
    <section className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface-1 p-4">
      <h2 className="text-sm font-medium text-ink">Start links</h2>
      <p className="text-[13px] text-ink-muted">Opens Now and starts at once. Add &label=gym for a name.</p>
      <ul className="flex flex-col gap-1.5">
        {startLinks(origin).map((l) => (
          <li key={l.category} className="flex items-center gap-3 text-[13px]">
            <span className="w-16 shrink-0 text-ink">{CATEGORY_LABEL[l.category]}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">{l.url}</span>
            <button type="button" onClick={() => copy(l.url)} className="shrink-0 text-ink-soft hover:text-ink">
              {copied === l.url ? 'Copied' : 'Copy'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
