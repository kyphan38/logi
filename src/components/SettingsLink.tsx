import Link from 'next/link';

/**
 * Word at the right end of each main page's top row, the same corner as
 * the other apps. It sits in a row that is already there, so no height is lost.
 */
export default function SettingsLink() {
  return (
    <Link href="/settings" className="shrink-0 text-[13px] text-ink-muted hover:text-ink active:text-ink">
      Settings
    </Link>
  );
}
