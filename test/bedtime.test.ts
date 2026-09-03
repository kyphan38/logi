// ---------------------------------------------------------------------------
// Stage 8 - giờ đi ngủ.
//
// Cái bẫy ở đây là 00:15. Trên đồng hồ nó là số NHỎ nhất trong ngày, nhưng nó
// là giờ đi ngủ MUỘN nhất. Thang liên tục (22:00 → 22.0, 00:15 → 24.25) tồn
// tại chỉ để trung bình và min/max không bị lộn ngược.
// ---------------------------------------------------------------------------
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bedtimeScale, bedtimeStats, formatBedtime, formatScale, median } from '@/lib/bedtime';

import { at } from './_helpers.ts';

describe('bedtimeScale', () => {
  it('tối hôm trước giữ nguyên giờ đồng hồ', () => {
    assert.equal(bedtimeScale(at('2026-08-26', '22:00')), 22);
    assert.equal(bedtimeScale(at('2026-08-26', '23:30')), 23.5);
  });

  it('sau nửa đêm cộng thêm 24 - vẫn thuộc đêm hôm trước', () => {
    assert.equal(bedtimeScale(at('2026-08-27', '00:15')), 24.25);
    assert.equal(bedtimeScale(at('2026-08-27', '01:30')), 25.5);
  });

  it('00:15 > 22:00 trên thang này (trên đồng hồ thì ngược lại)', () => {
    const late = bedtimeScale(at('2026-08-27', '00:15'));
    const early = bedtimeScale(at('2026-08-26', '22:00'));
    assert.ok(late > early, 'ngủ muộn phải ra số lớn hơn');
  });

  it('mốc cắt 04:00: 03:59 vẫn là đêm hôm trước, 04:00 là ngày mới', () => {
    assert.equal(bedtimeScale(at('2026-08-27', '03:59')), 27 + 59 / 60);
    assert.equal(bedtimeScale(at('2026-08-27', '04:00')), 4);
  });
});

describe('formatScale', () => {
  it('đưa về giờ đồng hồ 24h', () => {
    assert.equal(formatScale(22), '22:00');
    assert.equal(formatScale(24.25), '00:15');
    assert.equal(formatScale(25.5), '01:30');
  });

  it('23.999 phải ra 00:00, không phải 23:60', () => {
    assert.equal(formatScale(23.999), '00:00');
  });

  it('formatBedtime đọc thẳng từ epoch', () => {
    assert.equal(formatBedtime(at('2026-08-27', '00:15')), '00:15');
  });
});

describe('median', () => {
  it('số lẻ phần tử → phần tử giữa', () => {
    assert.equal(median([3, 1, 2]), 2);
  });

  it('số chẵn phần tử → trung bình hai phần tử giữa', () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
  });

  it('rỗng → null', () => {
    assert.equal(median([]), null);
  });

  it('không sửa mảng gọi vào', () => {
    const xs = [3, 1, 2];
    median(xs);
    assert.deepEqual(xs, [3, 1, 2]);
  });
});

describe('bedtimeStats', () => {
  it('trung vị trên thang liên tục, không phải trên giờ đồng hồ', () => {
    const s = bedtimeStats([
      at('2026-08-24', '23:00'),
      at('2026-08-26', '00:30'), // 24.5 - muộn nhất
      at('2026-08-25', '22:00'), // 22.0 - sớm nhất
    ]);
    assert.ok(s);
    assert.equal(s.median, 23);
    assert.equal(s.min, 22);
    assert.equal(s.max, 24.5);
    assert.equal(s.n, 3);
    assert.equal(formatScale(s.max), '00:30');
  });

  it('không có đêm nào ghi → null, chứ không phải 0', () => {
    assert.equal(bedtimeStats([]), null);
  });

  it('n là số đêm thực sự có ghi - AI insight dựa vào đây', () => {
    const s = bedtimeStats([at('2026-08-24', '23:00'), at('2026-08-25', '23:30')]);
    assert.ok(s);
    assert.equal(s.n, 2);
    assert.equal(s.median, 23.25);
  });
});
