import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { BG_DARK, BG_LIGHT, THEME_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "logi",
  description: "Personal time-audit app.",
  // iOS reads apple-touch-icon on Add to Home Screen; it ignores manifest icons.
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  // statusBarStyle must NOT be 'black-translucent'. In that mode iOS standalone
  // pushes the web view up to the very top (status bar over content) BUT
  // `100dvh` still returns the height minus the status bar. AppShell's `h-dvh`
  // frame then ends early by safe-area-inset-top (48pt on iPhone XR/11),
  // leaving a gap under the tab bar. 'default' makes dvh match the visible area.
  appleWebApp: { capable: true, title: "logi", statusBarStyle: "default" },
};

// maximumScale: 1 stops iOS Safari from zooming when an input gets focus.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BG_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: BG_DARK },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by THEME_SCRIPT before React hydrates.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* `overscroll-none`: stops iOS rubber-band bounce, which drags the fixed
          bars along. The real scroll area lives in AppShell.

          `suppressHydrationWarning`: browser extensions (WOT, Grammarly…) add
          attributes to <body> before React runs, so the dev overlay reports a
          fake hydration mismatch. Only silences this one tag - children are
          still checked as usual. */}
      <body className="flex min-h-dvh flex-col overscroll-none" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
