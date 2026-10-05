import type { NextConfig } from "next";

// Trang đăng nhập Google của Firebase nằm ở <project>.firebaseapp.com/__/auth/*.
// Proxy nó về cùng domain với app: Safari (nhất là app Add to Home Screen) chặn
// storage của domain bên thứ ba, nên signInWithRedirect qua firebaseapp.com
// quay về tay không và màn login treo mãi. Xem src/lib/firebase-client.ts.
const firebaseAuthHost = `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${firebaseAuthHost}/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
