/**
 * A one-stroke moon for the bedtime button. NOT the 🌙 emoji: browsers draw
 * emoji with their own palette (yellow), ignoring the surrounding text color (DESIGN.md).
 */
export default function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="inline-block h-3 w-3 align-[-1px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </svg>
  );
}
