'use client';

// ---------------------------------------------------------------------------
// logi - Chất lượng log & overlap (Stage 5 Task 6, sửa ở
// AMENDMENT-remove-sleep mục 3.2)
//
// Đặt TRƯỚC các chart, không phải sau. Log thưa thì "Learn thiếu 12h" là câu
// vô nghĩa: có thể đã học nhưng quên bấm. Người đọc cần biết điều đó trước khi
// tin bất kỳ con số nào bên dưới.
//
// Trước đây ô này hiện một tỉ lệ trên nền 24h/ngày. Bỏ Sleep thì kế hoạch chỉ
// còn 89h/168h = 53%, tức là log hoàn hảo vẫn bị báo động - nên nay hiện ba
// con số thô, mỗi con số tự kiểm chứng được.
// ---------------------------------------------------------------------------

import Card from '@/components/Card';
import { isThin, logQualityLine, thinWarning, type LogQuality } from '@/lib/log-quality';

interface Props {
  quality: LogQuality;
  /** Số giờ bị đếm hai lần. */
  overlap: number;
}

export default function LogQualityNote({ quality, overlap }: Props) {
  const thin = isThin(quality);

  return (
    <Card title="Log quality">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[13px] tabular-nums text-ink">{logQualityLine(quality)}</span>
        {overlap > 0.05 && (
          <span
            className="text-[13px] tabular-nums text-ink-muted"
            title="Time counted in two categories at once (e.g. Work while Learning)."
          >
            Overlap {overlap.toFixed(1)}h
          </span>
        )}
      </div>

      {thin && (
        <p className="whitespace-pre-line text-[13px] text-ink-soft">{thinWarning(quality)}</p>
      )}
    </Card>
  );
}
