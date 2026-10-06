'use client';

// ============================================================
// logi - Recording for voice logging
//
// Audio is NEVER stored anywhere: the blob only lives in a local variable,
// is converted to base64, then set to null. No disk, no Storage, no logs.
// ============================================================

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { pickAudioMime } from '@/lib/gemini-parse';

/** Holding too long auto-stops - 30s of mp4 is ~400KB, plenty for one sentence. */
const MAX_MS = 30_000;
/** A mistap released at once → drop it, do not spend a Gemini call. */
const MIN_MS = 400;
/** How often `level` updates. 60fps renders too much with no visible difference. */
const LEVEL_MS = 60;

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'processing';

export interface Recording {
  base64: string;
  /** `;codecs=...` already stripped - Gemini only accepts the base mime. */
  mimeType: string;
  durationMs: number;
}

/** Base64 via FileReader: the string is `data:audio/mp4;base64,xxx`; take the part after the comma. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error ?? new Error('Could not read the recording.'));
    fr.onload = () => {
      const s = String(fr.result);
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : '');
    };
    fr.readAsDataURL(blob);
  });
}

/** Recording support is only known on the client - an external store keeps SSR consistent. */
const NO_CHANGE = () => () => {};
const readSupported = () =>
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';
/** The server guesses yes, so the mic button does not flicker before showing. */
const SUPPORTED_ON_SERVER = () => true;

function micError(e: unknown): string {
  const name = (e as DOMException | undefined)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access denied. Enable it in Settings → Safari → Microphone.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone found.';
  if (name === 'NotReadableError') return 'Microphone is busy. Close other apps using it.';
  return (e as Error | undefined)?.message || 'Could not start recording.';
}

export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const supported = useSyncExternalStore(NO_CHANGE, readSupported, SUPPORTED_ON_SERVER);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  /** Waiting for mic permission. Releasing now must cancel, not keep recording. */
  const startingRef = useRef(false);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  /** The caller is waiting on `stop()`. */
  const waiterRef = useRef<((r: Recording | null) => void) | null>(null);
  /** A recording finished by the 30s auto-stop, kept for the next `stop()`. */
  const pendingRef = useRef<Recording | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  /**
   * Turn the mic off. Without this the orange dot in the iOS status bar stays
   * on, and the next recording may get stuck.
   */
  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    if (capRef.current !== null) clearTimeout(capRef.current);
    capRef.current = null;
    stopMeter();
    releaseMic();
  }, [stopMeter, releaseMic]);

  // Leaving the page midway must still give the mic back to the system.
  useEffect(() => {
    return () => {
      const rec = recRef.current;
      recRef.current = null;
      chunksRef.current = [];
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      teardown();
    };
  }, [teardown]);

  const meter = useCallback((stream: MediaStream) => {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return; // cannot measure, never mind - recording still works

    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    // iOS opens AudioContext 'suspended' → the waveform freezes if this is forgotten.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);

    const buf = new Uint8Array(analyser.frequencyBinCount);
    let last = 0;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - last < LEVEL_MS) return;
      last = now;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) {
        const d = (v - 128) / 128;
        sum += d * d;
      }
      // RMS times 3, because normal speech is only around 0.1–0.3.
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const finish = useCallback(
    async (mimeType: string) => {
      const durationMs = Date.now() - startedAtRef.current;
      const chunks = chunksRef.current;
      chunksRef.current = [];
      recRef.current = null;

      teardown();
      setLevel(0);

      const deliver = (r: Recording | null) => {
        const waiter = waiterRef.current;
        waiterRef.current = null;
        if (waiter) waiter(r);
        else pendingRef.current = r; // auto-stopped at 30s - keep it for a later stop()
        if (aliveRef.current) setState('idle');
      };

      if (cancelledRef.current || chunks.length === 0 || durationMs < MIN_MS) {
        deliver(null);
        return;
      }

      let blob: Blob | null = new Blob(chunks, { type: mimeType });
      try {
        const base64 = await blobToBase64(blob);
        blob = null; // never keep the audio
        deliver({ base64, mimeType, durationMs });
      } catch (e) {
        blob = null;
        if (aliveRef.current) setError(micError(e));
        deliver(null);
      }
    },
    [teardown]
  );

  /**
   * MUST be called directly from the tap event. `getUserMedia` is at the very
   * top, with no `await` before it - Safari treats that as losing the user gesture.
   */
  const start = useCallback(async () => {
    if (recRef.current) return;
    setError(null);
    pendingRef.current = null;
    cancelledRef.current = false;

    if (!window.isSecureContext) {
      setError('Voice requires a secure connection.');
      return;
    }
    if (!readSupported()) {
      setError('Recording is not supported on this browser.');
      return;
    }

    setState('requesting');
    startingRef.current = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      startingRef.current = false;
      setError(micError(e));
      setState('idle');
      return;
    }
    startingRef.current = false;

    // Released too fast, or left the page, while asking for permission.
    if (!aliveRef.current || cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      if (aliveRef.current) setState('idle');
      return;
    }

    streamRef.current = stream;

    // iOS WebKit does not support audio/webm - pickAudioMime() returns audio/mp4 there.
    const picked = pickAudioMime();
    let rec: MediaRecorder;
    try {
      rec = picked ? new MediaRecorder(stream, { mimeType: picked }) : new MediaRecorder(stream);
    } catch (e) {
      releaseMic();
      setError(micError(e));
      setState('idle');
      return;
    }

    // The browser may add `;codecs=opus`; Gemini only accepts the base mime.
    const mimeType = (rec.mimeType || picked || 'audio/mp4').split(';')[0];

    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onerror = () => {
      if (aliveRef.current) setError('Recording failed.');
      cancelledRef.current = true;
    };
    rec.onstop = () => void finish(mimeType);

    recRef.current = rec;
    startedAtRef.current = Date.now();
    rec.start();
    setState('recording');
    meter(stream);

    capRef.current = setTimeout(() => {
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop();
    }, MAX_MS);
  }, [finish, meter, releaseMic]);

  /** Returns null when: a mistap (< 400ms), cancelled, or never recorded. */
  const stop = useCallback((): Promise<Recording | null> => {
    const rec = recRef.current;
    if (!rec || rec.state === 'inactive') {
      // Tapped and released before the browser granted the mic → do not record.
      if (startingRef.current) cancelledRef.current = true;
      const done = pendingRef.current; // already auto-stopped at 30s
      pendingRef.current = null;
      return Promise.resolve(done);
    }
    setState('processing');
    return new Promise<Recording | null>((resolve) => {
      waiterRef.current = resolve;
      rec.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    pendingRef.current = null;
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop(); // onstop cleans up and returns null
    } else {
      recRef.current = null;
      chunksRef.current = [];
      teardown();
      setLevel(0);
      setState('idle');
    }
  }, [teardown]);

  return { state, start, stop, cancel, level, error, supported };
}
