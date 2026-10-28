'use client';

import { useEffect } from 'react';

import { registerServiceWorker } from '@/lib/sw';

/** Registers the service worker for the whole app, the sign-in screen too. */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
