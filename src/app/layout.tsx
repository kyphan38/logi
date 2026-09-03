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
  // statusBarStyle KHÔNG dùng 'black-translucent'. Ở chế độ đó iOS standalone
  // đẩy web view lên sát đỉnh màn hình (status bar đè lên nội dung) NHƯNG
  // `100dvh` vẫn trả về chiều cao đã trừ status bar. Khung `h-dvh` của AppShell
  // vì thế kết thúc sớm đúng bằng safe-area-inset-top (48pt trên iPhone XR/11),
  // để hở một khoảng trống dưới thanh tab. 'default' cho dvh khớp vùng hiển thị.
  appleWebApp: { capable: true, title: "logi", statusBarStyle: "default" },
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
          thanh cố định trôi theo. Chỗ cuộn thật nằm trong AppShell.

          `suppressHydrationWarning`: extension trình duyệt (WOT, Grammarly…)
          gắn thuộc tính vào <body> trước khi React chạy, làm dev overlay báo
          hydration mismatch giả. Chỉ tắt cảnh báo ở đúng thẻ này - phần con
          vẫn được kiểm tra bình thường. */}
      <body className="flex min-h-dvh flex-col overscroll-none" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
