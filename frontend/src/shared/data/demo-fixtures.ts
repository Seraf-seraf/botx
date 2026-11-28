import type {AppSnapshot, PricePoint, Quote} from './contracts';

export const API_KEY_MASK = 'botx_••••••••••••';

const DAY_MS = 24 * 60 * 60 * 1000;
const MARKET_DEPTH_DAYS = 30;
const SEED_POINTS_PER_DAY = 12;

const catalog = [
  {symbol: 'QST', name: 'QuestBot', icon: 'robot', price: 24_800, priorPrice: 22_064, isNew: false, tradingStatus: 'active'},
  {symbol: 'DICE', name: 'DiceLab', icon: 'dice-5', price: 17_600, priorPrice: 18_182, isNew: false, tradingStatus: 'active'},
  {symbol: 'MUSE', name: 'Muse AI', icon: 'brain', price: 9_400, priorPrice: 8_885, isNew: true, tradingStatus: 'active'},
  {symbol: 'NEKO', name: 'NekoBot', icon: 'cat', price: 31_200, priorPrice: 30_439, isNew: true, tradingStatus: 'active'},
] as const satisfies readonly Omit<Quote, 'history'>[];

const rise = [0, 0.07, 0.14, 0.09, 0.3, 0.36, 0.31, 0.49, 0.57, 0.5, 0.66, 0.73, 0.8, 0.74, 0.9, 0.93, 1];

function history(quote: Omit<Quote, 'history'>, now: number): PricePoint[] {
  const count = MARKET_DEPTH_DAYS * SEED_POINTS_PER_DAY;
  const tick = DAY_MS / SEED_POINTS_PER_DAY;
  const change = quote.price - quote.priorPrice;

  return Array.from({length: count + 1}, (_, index) => {
    const age = count - index;
    const cycle = age / (7 * SEED_POINTS_PER_DAY);
    const position = 1 - (cycle % 1);
    const point = position * (rise.length - 1);
    const lower = Math.floor(point);
    const first = rise[lower] ?? 0;
    const next = rise[lower + 1] ?? first;
    const wave = first + (next - first) * (point - lower);
    return {
      at: now - age * tick,
      price: Math.max(1, Math.round(quote.price + (wave - 1 - Math.floor(cycle)) * change)),
    };
  });
}

function atTime(now: number, daysAgo: number, hours: number, minutes: number): number {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

export function createDemoFixtures(now: number): AppSnapshot {
  return {
    integrations: {api: {connected: true, scopes: ['quotes', 'history', 'rewards', 'payments']},
      mcp: {connected: true, scopes: ['market', 'trade', 'history'], limitMinor: 50_000}},
    listings: [
      {id: 'study-bot', name: 'Study Bot', username: '@study_bot', status: 'pending'},
      {id: 'quest-bot', name: 'Quest Bot', username: '@quest_bot', status: 'pending'},
      {id: 'music-bot', name: 'Music Bot', username: '@music_bot', status: 'revision'},
    ],
    marketStatus: 'ready',
    payments: [],
    now,
    fees: {buyBps: 500, sellBps: 500, transferBps: 50, serviceBps: 50},
    balance: 328_000,
    quotes: catalog.map((quote) => ({...quote, history: history(quote, now)})),
    holdings: {
      QST: {quantity: 20, cost: 441_200},
      NEKO: {quantity: 15, cost: 419_600},
      DICE: {quantity: 16, cost: 263_200},
    },
    operations: [
      {id: 'demo-buy', kind: 'buy', symbol: 'QST', quantity: 3, date: atTime(now, 0, 14, 40), amount: 74_400},
      {id: 'demo-bonus', kind: 'bonus', date: atTime(now, 1, 9, 0), amount: 10_000},
      {id: 'demo-sell', kind: 'sell', symbol: 'DICE', quantity: 2, date: atTime(now, 1, 17, 18), amount: 35_200},
    ],
    bonusClaimed: false,
  };
}
