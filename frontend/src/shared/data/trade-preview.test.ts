import {describe, expect, it} from 'vitest';
import {tradePreview} from './trade-preview';

describe('trade preview', () => {
  it('calculates the fee and total in hundredths of BC', () => {
    expect(tradePreview('buy', 3, 24_800, 500)).toEqual({gross: 74_400, fee: 3_720, total: 78_120});
    expect(tradePreview('sell', 3, 24_800, 500)).toEqual({gross: 74_400, fee: 3_720, total: 70_680});
    expect(tradePreview('sell', 1, 101, 10_000)).toEqual({gross: 101, fee: 101, total: 0});
    expect(tradePreview('buy', 1, 101, 500)).toEqual({gross: 101, fee: 5, total: 106});
  });
});
