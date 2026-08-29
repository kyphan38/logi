import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "logi",
  description: "Personal time-audit app.",
  // iOS đọc apple-touch-icon khi Add to Home Screen; nó không đọc manifest icons.
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "logi", statusBarStyle: "black-translucent" },
};

// maximumScale: 1 chặn iOS Safari tự zoom khi focus vào input.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* `overscroll-none`: chặn kiểu nảy cao su của iOS, vì nó kéo cả
          thanh cố định trôi theo. Chỗ cuộn thật nằm trong AppShell. */}
      <body className="flex min-h-dvh flex-col overscroll-none">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
