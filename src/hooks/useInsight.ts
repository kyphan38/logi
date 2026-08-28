'use client';

// ---------------------------------------------------------------------------
// logi - Chạy AI insight cho một khoảng (Stage 7 Task 5 + 6)
//
// Thứ tự bắt buộc:
//   1. Tính chỉ số bằng code (`computeSignals`)
//   2. Cổng chặn (`canAnalyze`) - không đạt thì KHÔNG gọi API
//   3. Có bản cache cùng `digestHash` → dùng lại, cũng không gọi API
//   4. Còn lại mới gọi `/api/insight`, kết quả trả về đã sanitize
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { listByRange } from '@/lib/activities';
import { buildDigest, canAnalyze, digestHash, type Digest, type Gate } from '@/lib/digest';
import type { InsightResult } from '@/lib/insight-sanitize';
import { getInsight, saveInsight } from '@/lib/insights';
import { expectedForRange } from '@/lib/range-target';
import type { Range } from '@/lib/range';
import { computeSignals, previousRange, type Signals } from '@/lib/signals';
import type { Activity, Category } from '@/types/logi';

export type InsightState = 'idle' | 'loading' | 'ready' | 'error';

export interface UseInsight {
  state: InsightState;
  /** Cổng chặn tính từ dữ liệu hiện có - biết trước khi bấm. */
  gate: Gate;
  signals: Signals;
  result: InsightResult | null;
  /** Digest đã dùng, để tra số gốc khi tap vào `metric`. */
  digest: Digest | null;
  generatedAt: number | null;
  fromCache: boolean;
  error: string | null;
  run: (force?: boolean) => void;
}

export interface InsightInput {
  activities: Activity[];
  range: Range;
  weekTargets: Map<string, Record<Category, number>>;
  now: number;
  /** Weekly Review mở ra là chạy luôn; màn Analytics đợi người dùng bấm. */
  auto?: boolean;
}

export function useInsight(input: InsightInput): UseInsight {
  const { activities, range, weekTargets, now, auto = false } = input;
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [state, setState] = useState<InsightState>('idle');
  const [result, setResult] = useState<InsightResult | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `now` nhích mỗi phút; nếu để nó vào deps thì digest đổi liên tục và cache
  // không bao giờ trúng. Chốt lại một mốc theo khoảng đang xem.
  const [stamp, setStamp] = useState(now);
  const key = `${uid}|${range.from}|${range.to}`;
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setStamp(now);
    setState('idle');
    setResult(null);
    setDigest(null);
    setGeneratedAt(null);
    setFromCache(false);
    setError(null);
  }

  // Chỉ số của kỳ này. Chưa có kỳ trước - phần so sánh chỉ thêm vào lúc chạy.
  const signals = useMemo(
    () =>
      computeSignals(
        activities,
        range,
        expectedForRange(range, weekTargets, stamp),
        weekTargets,
        undefined,
        stamp
      ),
    [activities, range, weekTargets, stamp]
  );

  const gate = useMemo(() => canAnalyze(signals), [signals]);

  // Mỗi lần chạy có số riêng: đổi khoảng giữa chừng thì kết quả cũ bị bỏ.
  const runId = useRef(0);
  const busy = useRef(false);

  const run = useCallback(
    (force = false) => {
      if (!uid || busy.current) return;
      if (!canAnalyze(signals).ok) return;

      const id = ++runId.current;
      busy.current = true;
      setState('loading');
      setError(null);

      void (async () => {
        try {
          const at = stamp;
          const prev = previousRange(range);
          // Kỳ trước đã đóng, đọc một lần là đủ. Lỗi mạng ở đây không nên
          // giết cả lần phân tích - thiếu so sánh vẫn còn 6 nhóm chỉ số.
          let prevActivities: Activity[] = [];
          try {
            prevActivities = await listByRange(uid, prev);
          } catch {
            prevActivities = [];
          }

          const full = computeSignals(
            activities,
            range,
            expectedForRange(range, weekTargets, at),
            weekTargets,
            prevActivities.length
              ? { activities: prevActivities, expected: expectedForRange(prev, weekTargets, at) }
              : undefined,
            at
          );
          const d = buildDigest(full);
          const hash = digestHash(d);

          if (!force) {
            const cached = await getInsight(uid, range.from, range.to).catch(() => null);
            if (cached && cached.digestHash === hash) {
              if (id !== runId.current) return;
              setDigest(d);
              setResult(cached.result);
              setGeneratedAt(cached.createdAt);
              setFromCache(true);
              setState('ready');
              return;
            }
          }

          const res = await fetch('/api/insight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: range.from, to: range.to, digest: d, digestHash: hash }),
          });
          const payload = (await res.json()) as InsightResult & {
            error?: string;
            generatedAt?: number;
          };
          if (!res.ok) throw new Error(payload.error ?? 'Could not analyse right now.');
          if (id !== runId.current) return;

          const clean: InsightResult = {
            observations: payload.observations ?? [],
            suggestion: payload.suggestion ?? null,
            positive: payload.positive ?? null,
            note: payload.note ?? null,
          };
          const madeAt = payload.generatedAt ?? Date.now();

          setDigest(d);
          setResult(clean);
          setGeneratedAt(madeAt);
          setFromCache(false);
          setState('ready');

          // Lưu hỏng thì lần sau chạy lại, không phải lỗi người dùng cần thấy.
          void saveInsight(uid, { from: range.from, to: range.to, digestHash: hash, result: clean }, madeAt).catch(
            () => {}
          );
        } catch (e) {
          if (id !== runId.current) return;
          setError(e instanceof Error ? e.message : 'Could not analyse right now.');
          setState('error');
        } finally {
          busy.current = false;
        }
      })();
    },
    [uid, activities, range, weekTargets, signals, stamp]
  );

  // Tự chạy (Weekly Review). Chỉ một lần cho mỗi khoảng.
  const autoDone = useRef('');
  useEffect(() => {
    if (!auto || !uid || state !== 'idle' || !gate.ok) return;
    if (autoDone.current === key) return;
    autoDone.current = key;
    run();
  }, [auto, uid, state, gate.ok, key, run]);

  return { state, gate, signals, result, digest, generatedAt, fromCache, error, run };
}
