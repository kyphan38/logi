'use client';

// ---------------------------------------------------------------------------
// logi - The last safety net (Stage 6 Task 5)
//
// Only runs when the root layout itself breaks. This file replaces the whole
// document, so it must declare <html> and <body>, and has NO global styles -
// use inline styles, no Tailwind tokens here.
// ---------------------------------------------------------------------------

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          fontFamily: 'system-ui, sans-serif',
          colorScheme: 'light dark',
        }}
      >
        <div style={{ maxWidth: '24rem' }}>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 .5rem' }}>
            logi could not start
          </h1>
          <p style={{ fontSize: '.875rem', opacity: 0.7, margin: '0 0 1rem' }}>
            Your data is safe on the server. Try again.
            {error.digest ? ` (${error.digest})` : ''}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              border: '1px solid currentColor',
              borderRadius: '.25rem',
              background: 'transparent',
              color: 'inherit',
              padding: '.5rem 1rem',
              fontSize: '.875rem',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
