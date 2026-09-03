// ---------------------------------------------------------------------------
// logi - Gợi ý bù theo số ngày còn lại (Stage 7)
//
// `dailyTargetFor()` chia target tuần theo hình dạng baseline, không nhìn tuần
// đã đi tới đâu. Thứ Hai học 10h thì thứ Ba nó vẫn nói 3h - đúng kế hoạch cũ,
// nhưng vô ích: kế hoạch đó đã sai từ hôm qua rồi.
//
// Ở đây gợi ý = phần CÒN LẠI của tuần, chia cho các ngày CHƯA QUA, giữ nguyên
// tỉ lệ ngày thường / cuối tuần của baseline.
//
//     suggest(d) = remaining * shape[d] / (tổng shape các ngày từ d tới CN)
//
// Tính chất quan trọng: nếu hôm nay làm đúng số gợi ý thì ngày mai tính lại vẫn
// ra đúng con số mà hôm nay đã dự tính. Kế hoạch không tự trôi.
//
//     R' = R - R·s_d/S = R·(S-s_d)/S = R·S'/S
//     suggest(d+1) = R'·s_{d+1}/S' = R·s_{d+1}/S   ✓
//
// Rồi chặn trần ngày: nợ 30h Learn mà còn đúng thứ Sáu thì bảo học 30h là điên.
// Hàm thuần, không đụng React → test bằng `node --test`.
// ---------------------------------------------------------------------------
import { BASELINE_DAILY, BASELINE_WEEKLY, CATEGORIES, type Category } from '@/types/logi';

/**
 * Trần một ngày - gợi ý không bao giờ vượt số này.
 *
 * Không phải "chuẩn", là mức trần: chuẩn Learn ngày thường là 3h, trần 5h nghĩa
 * là được bù thêm 2h. Cuối tuần chuẩn đã 8h nên trần phải 10h, nếu để 5h thì
 * một ngày Bảy bình thường cũng bị chặn.
 *
 * Cuối tuần = Chủ nhật (0) và thứ Bảy (6).
 */
export const DAY_CAP: Record<Category, { weekday: number; weekend: number }> = {
  learn: { weekday: 5, weekend: 10 },
  work: { weekday: 10, weekend: 4 },
  fitness: { weekday: 3, weekend: 3 },
  leisure: { weekday: 2, weekend: 4 },
};

export function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6;
}

export function dayCap(c: Category, dow: number): number {
  return isWeekend(dow) ? DAY_CAP[c].weekend : DAY_CAP[c].weekday;
}

/**
 * Tuần logic chạy T2 → CN, còn `dow` là 0 = CN … 6 = T7 (khớp `Date.getDay()`).
 * Đổi sang vị trí trong tuần để biết còn mấy ngày: T2 = 0 … CN = 6.
 */
export function weekPos(dow: number): number {
  return (dow + 6) % 7;
}

/** Ngược lại `weekPos`. */
export function dowAt(pos: number): number {
  return (pos + 1) % 7;
}

export interface CatchUp {
  /** Giờ nên làm hôm đó. Đã chặn trần, đã làm tròn 0.1. */
  suggested: number;
  /** Chia theo baseline, không nhìn tuần đã đi tới đâu. Để so sánh. */
  standard: number;
  /** Giờ còn nợ của cả tuần, tính tới đầu ngày này. */
  remaining: number;
  /** Số ngày còn lại kể cả ngày này. */
  daysLeft: number;
  /** Xong target tuần rồi - phần còn lại là 0. */
  met: boolean;
  /** Trần đã cắt bớt: một ngày không nhét hết chỗ nợ được. */
  capped: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * @param weekly     target tuần đang áp dụng (`weekTarget.weekly`)
 * @param doneBefore giờ đã log ở các ngày TRƯỚC ngày này, trong cùng tuần logic.
 *   Không tính giờ của chính ngày đang xem - nếu tính thì mẫu số tụt dần trong
 *   lúc bạn đang đuổi theo nó, mỗi lần nhìn lại ra một đích khác.
 * @param dow        0 = CN … 6 = T7
 */
export function catchUp(
  weekly: Record<Category, number>,
  doneBefore: Record<Category, number>,
  dow: number
): Record<Category, CatchUp> {
  const pos = weekPos(dow);
  const daysLeft = 7 - pos;

  const out = {} as Record<Category, CatchUp>;

  for (const c of CATEGORIES) {
    const shape = BASELINE_DAILY[c];
    const base = BASELINE_WEEKLY[c];
    // Giữ bản chưa làm tròn để làm trần: làm tròn trước rồi so sánh thì 12.645
    // thành 12.6, và một kế hoạch đúng y nguyên lại bị gắn cờ "chạm trần".
    const stdRaw = base > 0 ? shape[dow] * (weekly[c] / base) : 0;
    const standard = r1(stdRaw);

    const remaining = Math.max(0, weekly[c] - (doneBefore[c] ?? 0));
    const met = weekly[c] > 0 && remaining <= 0;

    if (remaining <= 0) {
      out[c] = { suggested: 0, standard, remaining: 0, daysLeft, met, capped: false };
      continue;
    }

    // Tổng hình dạng của các ngày chưa qua.
    let sum = 0;
    for (let p = pos; p <= 6; p++) sum += shape[dowAt(p)];

    // shape[dow] === 0 là ngày nghỉ của category này - Fitness Chủ nhật, Work
    // cuối tuần. Nợ bao nhiêu cũng không đẩy vào ngày nghỉ: `raw` tự ra 0.
    // sum === 0 thì mọi ngày còn lại đều là ngày nghỉ, chia cho 0 nên chặn tay.
    // Lúc đó target tuần thành không với tới được - đó là sự thật, không phải
    // lỗi, và Analytics đã nói chuyện thiếu hụt rồi.
    const raw = sum > 0 ? remaining * (shape[dow] / sum) : 0;

    // Trần chỉ để chặn phần BÙ, không được cãi lại chính kế hoạch. Target Learn
    // 49h/tuần thì chuẩn thứ Bảy đã là 12.6h, cao hơn trần 10h - lấy trần 10h
    // là tuần nào đi đúng kế hoạch cũng bị báo "chạm trần" và không bao giờ với
    // tới target. Trần thật = trần cứng, hoặc chuẩn của ngày, cái nào cao hơn.
    const cap = Math.max(dayCap(c, dow), stdRaw);
    const suggested = Math.min(raw, cap);

    out[c] = {
      suggested: r1(suggested),
      standard,
      remaining: r1(remaining),
      daysLeft,
      met,
      // Chỉ báo khi vết cắt đáng kể (> 15 phút). Mỗi ngày làm tròn 0.1h nên cả
      // tuần trôi được vài phút; gắn cờ "chạm trần" vì mấy phút đó là báo động giả.
      capped: raw - suggested > 0.25,
    };
  }

  return out;
}
