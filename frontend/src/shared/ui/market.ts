const money = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2});
const decimal = new Intl.NumberFormat('ru-RU', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const plurals = new Intl.PluralRules('ru-RU');

export function formatBc(amount: number): string {
  return `${money.format(amount / 100)} BC`;
}

export function formatNumber(value: number): string {
  return decimal.format(value);
}

export function signedPercent(value: number): string {
  return `${value < 0 ? '−' : value > 0 ? '+' : ''}${decimal.format(Math.abs(value))}%`;
}

export function changePercent(price: number, priorPrice: number): number {
  return priorPrice > 0 ? (price / priorPrice - 1) * 100 : 0;
}

export function pluralCount(count: number, forms: readonly [string, string, string]): string {
  const rule = plurals.select(count);
  return `${count} ${rule === 'one' ? forms[0] : rule === 'few' ? forms[1] : forms[2]}`;
}

export function shares(count: number): string {
  return pluralCount(count, ['акцию', 'акции', 'акций']);
}
