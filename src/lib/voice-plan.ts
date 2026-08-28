// ============================================================
// logi - Từ ParsedCommand quyết định làm gì (chưa ghi gì cả).
// Tách riêng khỏi voice-command.ts vì file này KHÔNG import firebase,
// nhờ vậy `node --test` chạy thẳng được.
// ============================================================

import { AUTO_COMMIT_THRESHOLD } from '@/lib/gemini-parse';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import type { Activity } from '@/types/logi';

export type MissingField = 'category' | 'startAt' | 'endAt' | 'target';

export type VoicePlan =
  /** Đủ tin và đủ field → ghi luôn, kèm toast Undo. */
  | { kind: 'commit'; cmd: ParsedCommand }
  /** Chưa chắc hoặc thiếu field → bắt bấm Confirm. */
  | { kind: 'confirm'; cmd: ParsedCommand; missing: MissingField[] }
  /** Máy hỏi lại (Task 5). Chỉ được phép xảy ra một lần. */
  | { kind: 'clarify'; cmd: ParsedCommand }
  /** Không hiểu gì → mở sheet nhập tay. Luôn phải có đường lui. */
  | { kind: 'manual'; cmd: ParsedCommand };

/** Field bắt buộc theo từng loại câu. */
function requiredOf(cmd: ParsedCommand): MissingField[] {
  switch (cmd.intent) {
    case 'start':
      return ['category']; // không nói giờ thì mặc định là bây giờ
    case 'schedule':
      return ['category', 'startAt'];
    case 'log_past':
      return ['category', 'startAt', 'endAt'];
    case 'stop':
    case 'edit':
      return ['target'];
    default:
      return [];
  }
}

function missingOf(cmd: ParsedCommand): MissingField[] {
  return requiredOf(cmd).filter((f) => {
    if (f === 'category') return cmd.category === null;
    if (f === 'startAt') return cmd.startAt === null;
    if (f === 'endAt') return cmd.endAt === null;
    return cmd.targetActivityId === null;
  });
}

export interface PlanContext {
  /** Session đang chạy, để đoán target cho "stop" / "edit". */
  active: Pick<Activity, 'id'>[];
  /** Record vừa ghi xong (còn hạn) - "no, that was learning" sửa cái này. */
  lastCreatedId?: string | null;
  /** Đã hỏi lại một lần rồi. Hỏi vòng hai là người dùng bỏ dùng voice. */
  asked?: boolean;
}

export function planVoice(cmd: ParsedCommand, ctx: PlanContext): VoicePlan {
  if (cmd.intent === 'unknown') return { kind: 'manual', cmd };
  if (cmd.intent === 'clarify') {
    // Hỏi lần hai thì thôi, mở sheet nhập tay cho nhanh.
    return ctx.asked ? { kind: 'manual', cmd } : { kind: 'clarify', cmd };
  }

  let next = cmd;

  // Vừa ghi xong rồi nói tiếp "no, that was learning" → sửa record đó.
  if (next.intent === 'edit' && next.targetActivityId === null && ctx.lastCreatedId) {
    next = { ...next, targetActivityId: ctx.lastCreatedId };
  }

  // "Done" mà chỉ có đúng một session đang chạy → khỏi hỏi, chắc chắn là cái đó.
  if (
    (next.intent === 'stop' || next.intent === 'edit') &&
    next.targetActivityId === null &&
    ctx.active.length === 1
  ) {
    next = { ...next, targetActivityId: ctx.active[0].id };
  }

  const missing = missingOf(next);
  if (missing.length > 0) return { kind: 'confirm', cmd: next, missing };

  // Ghi vào QUÁ KHỨ thì luôn phải bấm Confirm, dù model có chắc tới đâu.
  //
  // "I read for two hours last night" nói ĐỘ DÀI chứ không nói GIỜ. Model vẫn
  // phải trả về startAt/endAt nên nó đoán - và đoán xong thì commit im lặng,
  // lịch sử có một record giờ giả mà người dùng không hề biết. Câu nói rõ giờ
  // ("from 8 AM to 11 AM") cũng đi qua đây, nhưng chỉ tốn một cú chạm: card đã
  // điền sẵn, sửa được trước khi lưu.
  //
  // start/stop/edit KHÔNG bị chặn - chúng sửa hiện tại, sai thì thấy ngay.
  if (next.intent === 'log_past') return { kind: 'confirm', cmd: next, missing: [] };

  if (next.confidence >= AUTO_COMMIT_THRESHOLD) return { kind: 'commit', cmd: next };
  return { kind: 'confirm', cmd: next, missing: [] };
}
