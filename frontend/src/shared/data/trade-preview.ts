import type {TradeSide} from './contracts';

const BASIS_POINTS_PER_PERCENT = 100;
const PERCENT_PER_WHOLE = 100;

export function tradePreview(side: TradeSide, quantity: number, unitPrice: number, feeBps: number): {gross: number; fee: number; total: number} {
  const gross = quantity * unitPrice;
  const fee = Math.round(gross * feeBps / (BASIS_POINTS_PER_PERCENT * PERCENT_PER_WHOLE));
  return {gross, fee, total: side === 'buy' ? gross + fee : gross - fee};
}
