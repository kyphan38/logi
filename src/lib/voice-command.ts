// ============================================================
// logi - Thực thi ParsedCommand. Mọi đường ghi vẫn qua activities.ts.
// Phần quyết định (thuần logic) nằm ở voice-plan.ts.
// ============================================================

import {
  createPastActivity,
  deleteActivity,
  getActivity,
  startActivity,
  stopActivity,
  updateActivity,
} from '@/lib/activities';
import { clearBedtime, setBedtime } from '@/lib/bedtime-store';
import { formatBedtime } from '@/lib/bedtime';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import { CATEGORY_LABEL } from '@/types/logi';

export {
  planVoice,
  mentionsSleep,
  mentionsBedtime,
  SLEEP_RETIRED_MESSAGE,
  BEDTIME_FALLBACK_MESSAGE,
} from '@/lib/voice-plan';
export type { MissingField, VoicePlan } from '@/lib/voice-plan';

/**
 * Đúng những cửa ghi mà applyVoice được phép dùng. Bản thật là activities.ts;
 * test bơm bản giả để kiểm tra "intent nào gọi hàm nào" mà không đụng Firestore.
 */
export interface VoiceRepo {
  startActivity: typeof startActivity;
  createPastActivity: typeof createPastActivity;
  stopActivity: typeof stopActivity;
  updateActivity: typeof updateActivity;
  deleteActivity: typeof deleteActivity;
  getActivity: typeof getActivity;
  setBedtime: typeof setBedtime;
  clearBedtime: typeof clearBedtime;
}

const LIVE: VoiceRepo = {
  startActivity,
  createPastActivity,
  stopActivity,
  updateActivity,
  deleteActivity,
  getActivity,
  setBedtime,
  clearBedtime,
};

export interface VoiceWrite {
  message: string;
  /** Record vừa đụng tới. Giữ lại để câu nói kế tiếp sửa được nó. */
  activityId: string;
  /** Trả về nguyên trạng. Mỗi nhánh tự biết cách lùi của mình. */
  undo: () => Promise<void>;
}

/**
 * Ghi xuống Firestore. Mọi nhánh đều gọi hàm của activities.ts để `derive()`
 * và `validateTimes()` chạy đúng một lần, không có ngoại lệ.
 */
export async function applyVoice(
  uid: string,
  cmd: ParsedCommand,
  repo: VoiceRepo = LIVE,
): Promise<VoiceWrite> {
  const prov = {
    source: 'voice' as const,
    confidence: cmd.confidence,
    rawText: cmd.transcript || null,
  };
  const name = cmd.category ? CATEGORY_LABEL[cmd.category] : 'Session';

  switch (cmd.intent) {
    case 'start': {
      const id = await repo.startActivity(uid, {
        category: cmd.category!,
        label: cmd.label,
        startAt: cmd.startAt ?? undefined,
        ...prov,
      });
      return { activityId: id, message: `Started ${name}.`, undo: () => repo.deleteActivity(uid, id) };
    }

    case 'schedule': {
      const id = await repo.startActivity(uid, {
        category: cmd.category!,
        label: cmd.label,
        startAt: cmd.startAt!,
        status: 'scheduled',
        ...prov,
      });
      return { activityId: id, message: `${name} scheduled.`, undo: () => repo.deleteActivity(uid, id) };
    }

    case 'log_past': {
      const id = await repo.createPastActivity(uid, {
        category: cmd.category!,
        label: cmd.label,
        startAt: cmd.startAt!,
        endAt: cmd.endAt!,
        ...prov,
      });
      return { activityId: id, message: `Logged ${name}.`, undo: () => repo.deleteActivity(uid, id) };
    }

    case 'bedtime': {
      // Mốc đi ngủ, KHÔNG phải activity. Không category, không target, không
      // vào ngân sách 89h - chỉ một mốc trong dayLogs.
      const at = cmd.bedtimeAt!;
      const date = await repo.setBedtime(uid, at);
      return {
        // Bedtime không có activity nên không sửa tiếp bằng voice được.
        // Chuỗi rỗng để nơi gọi biết mà bỏ qua `lastCreated`.
        activityId: '',
        message: `Bedtime ${formatBedtime(at)} logged.`,
        undo: () => repo.clearBedtime(uid, date),
      };
    }

    case 'stop': {
      const id = cmd.targetActivityId!;
      await repo.stopActivity(uid, id, cmd.endAt ?? undefined);
      return {
        activityId: id,
        message: `Stopped ${name}.`,
        undo: () => repo.updateActivity(uid, id, { endAt: null, status: 'active' }),
      };
    }

    case 'edit': {
      const id = cmd.targetActivityId!;
      // Đọc trước khi ghi để Undo trả lại đúng giá trị cũ, không phải đoán.
      const before = await repo.getActivity(uid, id);

      // Chỉ gửi field thật sự có trong câu nói, tránh xoá trắng dữ liệu cũ.
      const patch: Parameters<typeof repo.updateActivity>[2] = { ...prov };
      if (cmd.category !== null) patch.category = cmd.category;
      if (cmd.label !== null) patch.label = cmd.label;
      if (cmd.startAt !== null) patch.startAt = cmd.startAt;
      if (cmd.endAt !== null) patch.endAt = cmd.endAt;
      await repo.updateActivity(uid, id, patch);

      // "Yesterday I finished dinner at midnight" về đây chứ không về 'stop'.
      // Câu nói kết thúc một session đang chạy thì phải báo là đã dừng.
      const ended = before.endAt === null && cmd.endAt !== null;

      return {
        activityId: id,
        message: cmd.category
          ? `Changed to ${name}.`
          : ended
            ? `Stopped ${CATEGORY_LABEL[before.category]}.`
            : 'Updated.',
        undo: () =>
          repo.updateActivity(uid, id, {
            category: before.category,
            label: before.label,
            startAt: before.startAt,
            endAt: before.endAt,
            source: before.source,
            confidence: before.confidence,
            rawText: before.rawText,
          }),
      };
    }

    default:
      throw new Error(`Cannot apply intent "${cmd.intent}"`);
  }
}
