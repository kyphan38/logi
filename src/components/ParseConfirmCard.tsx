'use client';

// ============================================================
// Thẻ xác nhận sau khi nói.
// Hiện khi máy chưa đủ chắc, hoặc thiếu field bắt buộc.
// Sửa được ngay tại chỗ - không bắt người dùng nói lại.
// ============================================================

import { useState } from 'react';
import { fromLocalInput, toLocalInput } from '@/lib/datetime';
import type { ParsedCommand } from '@/lib/parse-sanitize';
import type { MissingField } from '@/lib/voice-command';
import { CATEGORIES, CATEGORY_LABEL, type Activity, type Category } from '@/types/logi';

const FIELD =
  'min-h-11 w-full rounded-md border border-zinc-200 bg-white px-3 text-base dark:border-zinc-800 dark:bg-zinc-900';
const MISSING = 'border-red-400 dark:border-red-500';

const INTENT_TITLE: Record<ParsedCommand['intent'], string> = {
  start: 'Start this?',
  stop: 'Stop this?',
  log_past: 'Log this?',
  schedule: 'Schedule this?',
  edit: 'Change this?',
  clarify: 'One question',
  unknown: 'Not sure',
};

export default function ParseConfirmCard({
  cmd,
  active,
  busy,
  onConfirm,
  onCancel,
}: {
  cmd: ParsedCommand;
  /** Session đang chạy - để chọn khi câu "I'm done" không rõ dừng cái nào. */
  active: Activity[];
  busy: boolean;
  /** Trả về lệnh đã sửa, không phải lệnh gốc. */
  onConfirm: (edited: ParsedCommand) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<Category | ''>(cmd.category ?? '');
  const [label, setLabel] = useState(cmd.label ?? '');
  const [startStr, setStartStr] = useState(cmd.startAt ? toLocalInput(cmd.startAt) : '');
  const [endStr, setEndStr] = useState(cmd.endAt ? toLocalInput(cmd.endAt) : '');
  const [target, setTarget] = useState(cmd.targetActivityId ?? '');

  const needsTime = cmd.intent !== 'stop';
  // 'start' = đang chạy. Không có giờ kết thúc, và không được hỏi giờ kết thúc.
  const running = cmd.intent === 'start';
  const needsEnd = cmd.intent === 'log_past';
  const needsStart = cmd.intent === 'log_past' || cmd.intent === 'schedule';
  const needsCategory = cmd.intent !== 'stop';
  const needsTarget = cmd.intent === 'stop' || cmd.intent === 'edit';
  // "Change it to 9 AM" không nhắc category - đừng bắt chọn thứ họ không muốn đổi.
  const categoryRequired = needsCategory && cmd.intent !== 'edit';

  const startAt = fromLocalInput(startStr);
  const endAt = running ? null : fromLocalInput(endStr);

  // Thiếu field nào thì tính TẠI ĐÂY, theo đúng thứ đang hiện trên card.
  // Danh sách `missing` lúc mở card cũ ngay khi người dùng chọn xong, nên
  // trước đây câu lỗi hiện lên mà không ô nào đỏ - và ngược lại.
  const gaps: { field: MissingField; name: string }[] = [];
  if (needsTarget && target === '') gaps.push({ field: 'target', name: 'Session' });
  if (categoryRequired && category === '') gaps.push({ field: 'category', name: 'Category' });
  if (needsStart && startAt === null) gaps.push({ field: 'startAt', name: 'Start' });
  if (needsEnd && endAt === null) gaps.push({ field: 'endAt', name: 'End' });

  const backwards = startAt !== null && endAt !== null && endAt <= startAt;

  // Nút Confirm chỉ mở khi đủ field. Đỡ phải bắt lỗi sau khi ghi.
  const ready = gaps.length === 0 && !backwards;

  // Nêu đích danh ô nào thiếu - "ô được tô đỏ" là câu vô dụng khi có 2 ô đỏ.
  const problem = gaps.length
    ? `${gaps.map((g) => g.name).join(' and ')} ${gaps.length > 1 ? 'are' : 'is'} missing.`
    : backwards
      ? 'End must be after Start.'
      : null;

  function confirm() {
    onConfirm({
      ...cmd,
      category: category === '' ? null : category,
      label: label.trim() || null,
      startAt,
      endAt,
      targetActivityId: target || null,
    });
  }

  const hi = (f: MissingField) => (gaps.some((g) => g.field === f) ? ` ${MISSING}` : '');

  return (
    <div
      className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      role="group"
      aria-label="Confirm voice entry"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{INTENT_TITLE[cmd.intent]}</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {Math.round(cmd.confidence * 100)}% sure
        </span>
      </div>

      {cmd.transcript ? (
        <p className="mt-1 text-sm italic text-zinc-500 dark:text-zinc-400">“{cmd.transcript}”</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-3">
        {needsTarget ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Session</span>
            <select
              value={target}
              disabled={busy}
              onChange={(e) => setTarget(e.target.value)}
              className={FIELD + hi('target')}
            >
              <option value="">Which one?</option>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {CATEGORY_LABEL[a.category]}
                  {a.label ? ` - ${a.label}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {needsCategory ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Category</span>
            <select
              value={category}
              disabled={busy}
              onChange={(e) => setCategory(e.target.value as Category | '')}
              className={FIELD + hi('category')}
            >
              <option value="">{categoryRequired ? 'Pick one…' : 'Leave as is'}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {needsCategory ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Label <span className="font-normal">(optional)</span>
            </span>
            <input
              type="text"
              value={label}
              disabled={busy}
              placeholder="devops"
              onChange={(e) => setLabel(e.target.value)}
              className={FIELD}
            />
          </label>
        ) : null}

        {needsTime ? (
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Start</span>
              <input
                type="datetime-local"
                value={startStr}
                disabled={busy}
                onChange={(e) => setStartStr(e.target.value)}
                className={FIELD + hi('startAt')}
              />
            </label>
            {needsEnd ? (
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">End</span>
                <input
                  type="datetime-local"
                  value={endStr}
                  disabled={busy}
                  onChange={(e) => setEndStr(e.target.value)}
                  className={FIELD + hi('endAt')}
                />
              </label>
            ) : running ? (
              // Ô trống ở đây làm người ta tưởng phải điền. Nói thẳng là đang chạy.
              <div className="flex flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">End</span>
                <p className={`${FIELD} flex items-center text-zinc-400 dark:text-zinc-500`}>
                  running
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {problem ? (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {problem}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 flex-1 rounded-md border border-zinc-200 text-sm font-medium disabled:opacity-50 dark:border-zinc-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy || !ready}
          className="min-h-11 flex-1 rounded-md bg-zinc-900 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      </div>
    </div>
  );
}
