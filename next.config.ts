import type { NextConfig } from "next";

// Firebase's Google sign-in page lives at <project>.firebaseapp.com/__/auth/*.
// Proxy it to the app's own domain: Safari (especially Add to Home Screen apps)
// blocks third-party storage, so signInWithRedirect via firebaseapp.com comes
// back empty and login hangs. See src/lib/firebase-client.ts.
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
