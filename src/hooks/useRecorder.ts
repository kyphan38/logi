'use client';

// ============================================================
// logi — Ghi âm cho voice logging
//
// Audio KHÔNG được lưu ở bất kỳ đâu: blob chỉ sống trong biến local,
// đổi sang base64 rồi gán null. Không disk, không Storage, không log.
// ============================================================

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { pickAudioMime } from '@/lib/gemini-parse';

/** Giữ nút quá lâu thì tự dừng — 30s mp4 ~400KB, thừa sức cho một câu nói. */
const MAX_MS = 30_000;
/** Chạm nhầm rồi nhả ra ngay → bỏ, đừng tốn một lượt gọi Gemini. */
const MIN_MS = 400;
/** Bao lâu cập nhật `level` một lần. 60fps thì render quá nhiều mà mắt không thấy khác. */
const LEVEL_MS = 60;

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'processing';

export interface Recording {
  base64: string;
  /** Đã cắt bỏ phần `;codecs=...` — Gemini chỉ nhận mime gốc. */
  mimeType: string;
  durationMs: number;
}

/** Base64 qua FileReader: chuỗi ra dạng `data:audio/mp4;base64,xxx`, lấy phần sau dấu phẩy. */
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

/** Khả năng ghi âm chỉ biết được ở client — dùng store ngoài để SSR không lệch. */
const NO_CHANGE = () => () => {};
const readSupported = () =>
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function';
/** Server đoán là có, nên nút mic không nhấp nháy rồi mới hiện. */
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
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  /** Người gọi đang chờ `stop()`. */
  const waiterRef = useRef<((r: Recording | null) => void) | null>(null);
  /** Bản ghi xong khi tự dừng ở 30s, giữ lại cho lần `stop()` kế tiếp. */
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
   * Tắt mic. Thiếu bước này thì chấm cam trên thanh trạng thái iOS không tắt,
   * và lần ghi sau dễ bị kẹt.
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

  // Rời trang giữa chừng vẫn phải trả mic lại cho hệ thống.
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
    if (!Ctx) return; // không đo được thì thôi, ghi âm vẫn chạy

    const ctx = new Ctx();
    audioCtxRef.current = ctx;
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
      // RMS nhân 3 vì giọng nói bình thường chỉ quanh 0.1–0.3.
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
        else pendingRef.current = r; // tự dừng ở 30s — giữ lại cho stop() sau
        if (aliveRef.current) setState('idle');
      };

      if (cancelledRef.current || chunks.length === 0 || durationMs < MIN_MS) {
        deliver(null);
        return;
      }

      let blob: Blob | null = new Blob(chunks, { type: mimeType });
      try {
        const base64 = await blobToBase64(blob);
        blob = null; // không giữ audio lại
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
   * PHẢI gọi thẳng từ sự kiện chạm. `getUserMedia` nằm ngay đầu hàm,
   * không có `await` nào trước nó — Safari coi đó là mất user gesture.
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
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(micError(e));
      setState('idle');
      return;
    }

    // Người dùng rời trang trong lúc đang xin quyền.
    if (!aliveRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;

    // iOS WebKit không hỗ trợ audio/webm — pickAudioMime() trả audio/mp4 ở đó.
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

    // Trình duyệt có thể thêm `;codecs=opus`; Gemini chỉ nhận mime gốc.
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

  /** Trả null khi: bấm nhầm (< 400ms), đã cancel, hoặc chưa hề ghi. */
  const stop = useCallback((): Promise<Recording | null> => {
    const rec = recRef.current;
    if (!rec || rec.state === 'inactive') {
      const done = pendingRef.current; // đã tự dừng ở mốc 30s
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
      rec.stop(); // onstop dọn nốt và trả null
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
